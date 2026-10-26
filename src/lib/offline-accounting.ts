import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots } from "@/db/schema";
import * as Accounting from "@/lib/accounting";
import { HttpError } from "@/lib/auth";
import { hasAny } from "@/lib/plans";
import { offlineAuth } from "@/lib/offline-pos";

type AccountingCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "accounting";
  action: "create_document";
  baseDataset: "accounting";
  baseSnapshotId: string;
  baseRevision: number;
  payload: {
    date: string;
    kind: "general";
    description: string;
    lines: { accountId: number; debit: number; credit: number; description: string }[];
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function parseCommand(raw: unknown): AccountingCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "فرمان حسابداری آفلاین معتبر نیست");
  const command = raw as Record<string, unknown>;
  const keys = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(command).some((key) => !keys.includes(key))) throw new HttpError(400, "فرمان حسابداری فیلد ناشناخته دارد");
  if (command.schemaVersion !== 1 || command.module !== "accounting" || command.action !== "create_document" || command.baseDataset !== "accounting") throw new HttpError(400, "نسخه یا نوع فرمان حسابداری پشتیبانی نمی‌شود");
  if (typeof command.id !== "string" || !UUID.test(command.id) || !Number.isSafeInteger(command.businessId) || Number(command.businessId) < 1) throw new HttpError(400, "شناسه فرمان یا کسب‌وکار معتبر نیست");
  if (typeof command.baseSnapshotId !== "string" || !UUID.test(command.baseSnapshotId) || !Number.isSafeInteger(command.baseRevision) || Number(command.baseRevision) < 1) throw new HttpError(400, "نسخه مبنای حسابداری معتبر نیست");
  if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new HttpError(400, "اطلاعات سند معتبر نیست");
  const payload = command.payload as Record<string, unknown>;
  if (Object.keys(payload).some((key) => !["date", "kind", "description", "lines"].includes(key))) throw new HttpError(400, "اطلاعات سند فیلد ناشناخته دارد");
  if (typeof payload.date !== "string" || payload.date.length > 40 || !RFC3339.test(payload.date) || !Number.isFinite(Date.parse(payload.date)) || payload.kind !== "general" || typeof payload.description !== "string" || payload.description.trim().length < 2 || [...payload.description].length > 300 || !Array.isArray(payload.lines) || payload.lines.length < 2 || payload.lines.length > 200) throw new HttpError(400, "تاریخ، شرح یا ردیف‌های سند معتبر نیستند");
  const lines = payload.lines.map((rawLine) => {
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) throw new HttpError(400, "ردیف سند معتبر نیست");
    const line = rawLine as Record<string, unknown>;
    if (Object.keys(line).some((key) => !["accountId", "debit", "credit", "description"].includes(key)) || !Number.isSafeInteger(line.accountId) || Number(line.accountId) < 1 || !Number.isSafeInteger(line.debit) || Number(line.debit) < 0 || !Number.isSafeInteger(line.credit) || Number(line.credit) < 0 || (Number(line.debit) > 0 && Number(line.credit) > 0) || typeof line.description !== "string" || [...line.description].length > 200) throw new HttpError(400, "مبلغ یا حساب یکی از ردیف‌های سند معتبر نیست");
    return { accountId: Number(line.accountId), debit: Number(line.debit), credit: Number(line.credit), description: line.description.trim() };
  });
  const nonzero = lines.filter((line) => line.debit > 0 || line.credit > 0);
  const debit = nonzero.reduce((sum, line) => sum + line.debit, 0);
  const credit = nonzero.reduce((sum, line) => sum + line.credit, 0);
  if (nonzero.length < 2 || !Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit <= 0 || debit !== credit) throw new HttpError(422, "سند باید دست‌کم دو ردیف مبلغ‌دار و جمع بدهکار و بستانکار برابر داشته باشد");
  return { ...command, module: "accounting", action: "create_document", baseDataset: "accounting", payload: { date: payload.date, kind: "general", description: payload.description.trim(), lines } } as unknown as AccountingCommand;
}

export async function syncOfflineAccountingCommand(req: Request, raw: unknown) {
  const command = parseCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "accounting")) throw new HttpError(403, "صندوق آفلاین و حسابداری باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "سند متعلق به کسب‌وکار این دستگاه نیست");
  await Accounting.ensureAccounting(business);
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");
  const outcome = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      return { httpStatus: previous.httpStatus, response: previous.result };
    }

    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "accounting"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update");
    if (!snapshot || snapshot.validUntil <= new Date()) throw new HttpError(409, "نسخهٔ حسابداری پیدا نشد یا منقضی شده است؛ پس از اتصال نسخهٔ تازه بگیرید");
    const accounts = Array.isArray(snapshot.payload.accounts) ? snapshot.payload.accounts as Record<string, unknown>[] : [];
    const accountIds = new Set(accounts.filter((account) => account.isActive === true && account.level !== "kol").map((account) => Number(account.id)));
    if (command.payload.lines.some((line) => !accountIds.has(line.accountId))) throw new HttpError(409, "یکی از حساب‌های سند در نسخهٔ محلی موجود یا فعال نیست");
    const years = Array.isArray(snapshot.payload.years) ? snapshot.payload.years as Record<string, unknown>[] : [];
    const date = new Date(command.payload.date);
    if (!years.some((year) => year.isClosed !== true && typeof year.startDate === "string" && typeof year.endDate === "string" && date >= new Date(year.startDate) && date <= new Date(year.endDate))) throw new HttpError(409, "تاریخ سند در سال مالی بازِ نسخهٔ محلی نیست؛ پس از اتصال نسخهٔ تازه بگیرید");

    const doc = await Accounting.postDocumentInTransaction(tx, business, {
      date, kind: "general", source: "manual", sourceRef: `offline-command:${command.id}`,
      description: command.payload.description, status: "posted", lines: command.payload.lines,
      createdBy: `صندوق آفلاین ${terminal.id.slice(0, 8)}`,
    });
    const receipt = randomUUID();
    const response = { commandId: command.id, state: "applied", receipt, documentId: doc.id, documentNumber: doc.number };
    await tx.insert(offlineWorkspaceCommands).values({
      id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy,
      module: "accounting", action: "create_document", payloadHash,
      payload: command as unknown as Record<string, unknown>, state: "applied", httpStatus: 200,
      error: "", receipt, result: response,
    });
    return { httpStatus: 200, response };
  }, { isolationLevel: "repeatable read" });
  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, "error" in outcome.response && typeof outcome.response.error === "string" ? outcome.response.error : "ثبت سند آفلاین انجام نشد");
  return outcome.response;
}
