import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accAccounts, businesses, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots, payrollItems, payrollRuns, payrollSettlements } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import * as Accounting from "@/lib/accounting";
import { hasAny } from "@/lib/plans";
import { offlineAuth } from "@/lib/offline-pos";

type PayrollSettlementCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "payroll";
  action: "settlement";
  baseDataset: "payroll";
  baseSnapshotId: string;
  baseRevision: number;
  payload: { runId: number; kind: "salary" | "insurance" | "tax"; from: "cash" | "bank"; bankAccountId: number | null; occurredAt: string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function parseCommand(raw: unknown): PayrollSettlementCommand {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.module !== "payroll" || raw.action !== "settlement" || raw.baseDataset !== "payroll") throw new HttpError(400, "قالب فرمان پرداخت حقوق آفلاین معتبر نیست");
  const allowed = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(raw).some((key) => !allowed.includes(key)) || typeof raw.id !== "string" || !UUID.test(raw.id)
    || !Number.isSafeInteger(raw.businessId) || Number(raw.businessId) < 1 || typeof raw.baseSnapshotId !== "string" || !UUID.test(raw.baseSnapshotId)
    || !Number.isSafeInteger(raw.baseRevision) || Number(raw.baseRevision) < 1 || !isRecord(raw.payload)) throw new HttpError(400, "شناسه یا نسخهٔ مبنای پرداخت حقوق معتبر نیست");
  const payload = raw.payload;
  if (Object.keys(payload).some((key) => !["runId", "kind", "from", "bankAccountId", "occurredAt"].includes(key))
    || !Number.isSafeInteger(payload.runId) || Number(payload.runId) < 1 || !["salary", "insurance", "tax"].includes(String(payload.kind))
    || !["cash", "bank"].includes(String(payload.from)) || !(payload.bankAccountId === null || (Number.isSafeInteger(payload.bankAccountId) && Number(payload.bankAccountId) > 0))
    || (payload.from === "cash" && payload.bankAccountId !== null) || (payload.from === "bank" && payload.bankAccountId === null)
    || typeof payload.occurredAt !== "string" || payload.occurredAt.length > 40 || !RFC3339.test(payload.occurredAt) || !Number.isFinite(Date.parse(payload.occurredAt))) {
    throw new HttpError(400, "نوع، مبلغ‌پرداخت، حساب یا زمان پرداخت حقوق معتبر نیست");
  }
  return raw as unknown as PayrollSettlementCommand;
}

function sumSnapshotAmount(run: Record<string, unknown>, kind: PayrollSettlementCommand["payload"]["kind"]) {
  const totals = isRecord(run.totals) ? run.totals : {};
  if (kind === "salary") return Number(totals.net);
  if (kind === "tax") return Number(totals.tax);
  return Number(totals.employeeInsurance) + Number(totals.employerInsurance);
}

export async function syncOfflinePayrollSettlementCommand(req: Request, raw: unknown) {
  const command = parseCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "payroll")) throw new HttpError(403, "صندوق آفلاین و حقوق و دستمزد باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان پرداخت حقوق متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");
  const accountIds = await Accounting.ensurePayrollAccountingAccounts(business);

  const outcome = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update").limit(1);
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false))).limit(1);
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update").limit(1);
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) {
        return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      }
      return { httpStatus: previous.httpStatus, response: previous.result as Record<string, unknown> };
    }

    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "payroll"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update").limit(1);
    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", resultFields: Record<string, unknown> = {}) => {
      const receipt = state === "applied" ? randomUUID() : "";
      const response = { commandId: command.id, state, receipt, ...resultFields, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({
        id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy,
        module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>,
        state, httpStatus, error, receipt, result: response,
      });
      return { httpStatus, response };
    };

    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ آرشیو حقوق پیدا نشد یا منقضی شده است؛ ابتدا نسخهٔ تازه دریافت کنید");
    const snapshotRuns = Array.isArray(snapshot.payload.runs) ? snapshot.payload.runs as Record<string, unknown>[] : [];
    const baseRun = snapshotRuns.find((run) => Number(run.id) === command.payload.runId);
    if (!baseRun || baseRun.status !== "approved") return record("conflict", 409, "لیست تأییدشده در نسخهٔ حقوق محلی پیدا نشد؛ ابتدا نسخهٔ تازه دریافت کنید");
    const banks = Array.isArray(snapshot.payload.bankAccounts) ? snapshot.payload.bankAccounts as Record<string, unknown>[] : [];
    if (command.payload.from === "bank" && !banks.some((bank) => Number(bank.id) === command.payload.bankAccountId)) return record("conflict", 409, "حساب بانکی در نسخهٔ حقوق محلی نیست؛ ابتدا نسخهٔ تازه دریافت کنید");

    const occurredAt = new Date(command.payload.occurredAt);
    const now = new Date();
    if (occurredAt.getTime() < now.getTime() - 31 * 86_400_000 || occurredAt.getTime() > now.getTime() + 5 * 60_000) return record("rejected", 422, "زمان ثبت محلی بیش از بازهٔ مجاز است؛ تاریخ پرداخت را پس از اتصال ثبت کنید");

    const [run] = await tx.select().from(payrollRuns).where(and(eq(payrollRuns.id, command.payload.runId), eq(payrollRuns.businessId, business.id))).for("update").limit(1);
    if (!run || run.status !== "approved" || run.jalaliYear !== baseRun.jalaliYear || run.jalaliMonth !== baseRun.jalaliMonth) return record("conflict", 409, "وضعیت یا دورهٔ لیست حقوق از زمان نسخهٔ محلی تغییر کرده است");
    const items = await tx.select({ netToman: payrollItems.netToman, employeeInsuranceToman: payrollItems.employeeInsuranceToman, employerInsuranceToman: payrollItems.employerInsuranceToman, incomeTaxToman: payrollItems.incomeTaxToman })
      .from(payrollItems).where(and(eq(payrollItems.runId, run.id), eq(payrollItems.businessId, business.id))).for("update");
    const amount = command.payload.kind === "salary" ? items.reduce((total, item) => total + item.netToman, 0)
      : command.payload.kind === "insurance" ? items.reduce((total, item) => total + item.employeeInsuranceToman + item.employerInsuranceToman, 0)
        : items.reduce((total, item) => total + item.incomeTaxToman, 0);
    if (!Number.isSafeInteger(amount) || amount < 0) return record("rejected", 422, "مبلغ پرداخت از محدودهٔ عددی امن خارج است");
    if (amount <= 0) return record("rejected", 422, "برای این نوع پرداخت مبلغی در لیست حقوق وجود ندارد");
    const snapshotAmount = sumSnapshotAmount(baseRun, command.payload.kind);
    if (!Number.isSafeInteger(snapshotAmount) || snapshotAmount !== amount) return record("conflict", 409, "مبلغ لیست حقوق از زمان نسخهٔ محلی تغییر کرده است؛ ابتدا نسخهٔ تازه بگیرید");
    if (Array.isArray(baseRun.settlements) && baseRun.settlements.some((row) => isRecord(row) && row.kind === command.payload.kind)) return record("conflict", 409, "این نوع پرداخت در نسخهٔ محلی قبلاً ثبت شده است؛ ابتدا وضعیت تازه را دریافت کنید");

    const [existingSettlement] = await tx.select({ id: payrollSettlements.id }).from(payrollSettlements).where(and(
      eq(payrollSettlements.businessId, business.id), eq(payrollSettlements.runId, run.id), eq(payrollSettlements.kind, command.payload.kind),
    )).for("update").limit(1);
    if (existingSettlement) return record("conflict", 409, "این نوع پرداخت حقوق قبلاً ثبت شده است");
    let counterAccountId: number;
    if (command.payload.from === "bank") {
      counterAccountId = await Accounting.bankDetailIdInTransaction(tx, business, command.payload.bankAccountId!);
    } else {
      const [cash] = await tx.select({ id: accAccounts.id }).from(accAccounts).where(and(
        eq(accAccounts.businessId, business.id), eq(accAccounts.code, Accounting.C.CASH), eq(accAccounts.isActive, true),
      )).limit(1);
      if (!cash) return record("conflict", 409, "حساب صندوق فعال نیست؛ کدینگ را بررسی و نسخهٔ تازه دریافت کنید");
      counterAccountId = cash.id;
    }
    const payableAccountId = command.payload.kind === "salary" ? accountIds.salaryPayableId
      : command.payload.kind === "insurance" ? accountIds.insurancePayableId : accountIds.taxPayableId;
    const title = command.payload.kind === "salary" ? "پرداخت خالص حقوق"
      : command.payload.kind === "insurance" ? "پرداخت حق بیمه تأمین اجتماعی" : "پرداخت مالیات حقوق";
    const period = `${run.jalaliYear}/${String(run.jalaliMonth).padStart(2, "0")}`;
    const document = await Accounting.postDocumentInTransaction(tx, business, {
      date: occurredAt, source: "payroll", sourceRef: `payroll-settlement:${run.id}:${command.payload.kind}`,
      description: `${title} ${period}`, createdBy: `صندوق آفلاین ${terminal.id.slice(0, 8)}`,
      lines: [
        { accountId: payableAccountId, debit: amount, description: title },
        { accountId: counterAccountId, credit: amount, description: command.payload.from === "bank" ? `پرداخت از حساب بانکی #${command.payload.bankAccountId}` : "پرداخت نقدی از صندوق" },
      ],
    });
    const [settlement] = await tx.insert(payrollSettlements).values({
      businessId: business.id, runId: run.id, kind: command.payload.kind, amountToman: amount,
      bankAccountId: command.payload.bankAccountId, accountingDocumentId: document.id, paidAt: occurredAt, createdBy: terminal.createdBy,
    }).returning({ id: payrollSettlements.id });
    return record("applied", 200, "", { settlementId: settlement.id, documentId: document.id, documentNumber: document.number, amountToman: amount });
  });
  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, typeof outcome.response.error === "string" ? outcome.response.error : "پرداخت حقوق آفلاین همگام نشد");
  return outcome.response;
}
