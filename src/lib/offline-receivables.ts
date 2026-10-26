import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots, receivablePaymentReversals, receivablePayments, receivables } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { logInfo } from "@/lib/logger";
import { offlineAuth } from "@/lib/offline-pos";
import { hasAny } from "@/lib/plans";
import { recordReceivablePaymentInTransaction } from "@/lib/receivables";
import { outstandingAmount, paymentFitsBalance } from "@/lib/receivables-core";
import * as Accounting from "@/lib/accounting";

type ReceivableCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "receivables";
  action: "record_payment";
  baseDataset: "receivables";
  baseSnapshotId: string;
  baseRevision: number;
  payload: { receivableId: number; amount: number; method: "cash"; note: string; expectedBalance: number };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function parseCommand(raw: unknown): ReceivableCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "فرمان دریافت آفلاین معتبر نیست");
  const command = raw as Record<string, unknown>;
  const keys = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(command).some((key) => !keys.includes(key)) || command.schemaVersion !== 1 || command.module !== "receivables" || command.action !== "record_payment" || command.baseDataset !== "receivables") throw new HttpError(400, "نوع یا نسخهٔ فرمان مطالبات پشتیبانی نمی‌شود");
  if (typeof command.id !== "string" || !UUID.test(command.id) || !Number.isSafeInteger(command.businessId) || Number(command.businessId) < 1 || typeof command.baseSnapshotId !== "string" || !UUID.test(command.baseSnapshotId) || !Number.isSafeInteger(command.baseRevision) || Number(command.baseRevision) < 1) throw new HttpError(400, "شناسهٔ فرمان یا نسخهٔ مطالبات معتبر نیست");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new HttpError(400, "اطلاعات دریافت معتبر نیست");
  const payload = command.payload as Record<string, unknown>;
  const payloadKeys = ["receivableId", "amount", "method", "note", "expectedBalance"];
  if (Object.keys(payload).some((key) => !payloadKeys.includes(key)) || !Number.isSafeInteger(payload.receivableId) || Number(payload.receivableId) < 1 || !Number.isSafeInteger(payload.amount) || Number(payload.amount) < 1 || Number(payload.amount) > 2_000_000_000 || payload.method !== "cash" || typeof payload.note !== "string" || payload.note.length > 300 || !Number.isSafeInteger(payload.expectedBalance) || Number(payload.expectedBalance) < 1 || Number(payload.amount) > Number(payload.expectedBalance)) throw new HttpError(400, "فقط دریافت نقدی با مبلغ معتبر و کمتر از ماندهٔ فعلی قابل همگام‌سازی است");
  return raw as ReceivableCommand;
}

export async function syncOfflineReceivablePayment(req: Request, raw: unknown) {
  const command = parseCommand(raw);
  const { payload } = command;
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "accounting")) throw new HttpError(403, "صندوق آفلاین و حسابداری باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان متعلق به کسب‌وکار این دستگاه نیست");
  await Accounting.ensureAccounting(business);
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");

  const outcome = await db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این دستگاه لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است" }, replayed: true };
      return { httpStatus: previous.httpStatus, response: previous.result as Record<string, unknown>, replayed: true };
    }

    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "", details: Record<string, unknown> = {}) => {
      const response: Record<string, unknown> = { commandId: command.id, state, receipt, ...details, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({ id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy, module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>, state, httpStatus, error, receipt, result: response });
      return { httpStatus, response, replayed: false };
    };
    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "receivables"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update");
    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ مطالبات مبنا منقضی شده یا پیدا نمی‌شود؛ snapshot تازه دریافت کنید");
    const baseRows = Array.isArray(snapshot.payload.receivables) ? snapshot.payload.receivables as Record<string, unknown>[] : [];
    const base = baseRows.find((row) => row.id === payload.receivableId);
    if (!base || base.balance !== payload.expectedBalance || !paymentFitsBalance(Number(base.amount), Number(base.received), payload.amount)) return record("conflict", 409, "ماندهٔ طلب با نسخهٔ محلی سازگار نیست؛ فهرست مطالبات را تازه کنید");
    const [current] = await tx.select().from(receivables).where(and(eq(receivables.id, payload.receivableId), eq(receivables.businessId, business.id))).for("update");
    if (!current) return record("conflict", 409, "طلب از زمان دریافت نسخه حذف یا تغییر کرده است؛ فهرست را تازه کنید");
    const [paid] = await tx.select({ total: sql<number>`coalesce(sum(${receivablePayments.amount}), 0)::bigint` }).from(receivablePayments)
      .where(and(eq(receivablePayments.businessId, business.id), eq(receivablePayments.receivableId, current.id)));
    const [reversed] = await tx.select({ total: sql<number>`coalesce(sum(${receivablePaymentReversals.amount}), 0)::bigint` })
      .from(receivablePaymentReversals).innerJoin(receivablePayments, and(eq(receivablePayments.id, receivablePaymentReversals.paymentId), eq(receivablePayments.businessId, receivablePaymentReversals.businessId)))
      .where(and(eq(receivablePaymentReversals.businessId, business.id), eq(receivablePayments.receivableId, current.id)));
    const balance = outstandingAmount(Number(current.amount), Number(paid.total) - Number(reversed.total));
    if (balance !== payload.expectedBalance) return record("conflict", 409, "ماندهٔ طلب پس از دریافت نسخه تغییر کرده است؛ پرداخت در دستگاه ثبت نشد");

    const result = await recordReceivablePaymentInTransaction(tx as unknown as typeof db, business, terminal.createdBy, current.id, {
      amount: payload.amount, method: "cash", bankAccountId: null, idempotencyKey: `offline-receivable:${command.id}`, note: payload.note,
    }, "offline_terminal");
    const receipt = `receivable-payment-${result.item.id}-${command.id}`;
    return record("applied", 200, "", receipt, { receivableId: current.id, paymentId: result.item.id, amount: payload.amount });
  });

  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, typeof outcome.response.error === "string" ? outcome.response.error : "دریافت آفلاین اعمال نشد");
  logInfo("offline.receivable_payment_synced", { businessId: business.id, terminalId: terminal.id, receivableId: command.payload.receivableId, amount: command.payload.amount, commandId: command.id, replayed: outcome.replayed });
  return outcome.response;
}
