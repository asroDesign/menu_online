import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { accAccounts, accDocuments, accLines, businesses, chequeBeneficiaries, chequeEvents, cheques, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots } from "@/db/schema";
import * as Accounting from "@/lib/accounting";
import { HttpError } from "@/lib/auth";
import { buildChequeRegistrationLines, buildChequeStatusLines, isChequeTransitionAllowed } from "@/lib/cheques";
import { normalizeIranianDigits, normalizeIranianMobile } from "@/lib/cheque-reminders-core";
import { offlineAuth } from "@/lib/offline-pos";
import { hasAny } from "@/lib/plans";
import { parseTehranDateTime } from "@/lib/tehran-time";

type ChequeCommand = {
  schemaVersion: 1; id: string; businessId: number; module: "cheques"; action: "register" | "set_status";
  baseDataset: "cheques"; baseSnapshotId: string; baseRevision: number; payload: Record<string, unknown>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const STATUSES = ["registered", "passed", "bounced", "returned", "assigned", "voided"] as const;

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function parseCommand(raw: unknown): ChequeCommand {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.module !== "cheques" || !["register", "set_status"].includes(String(raw.action)) || raw.baseDataset !== "cheques") throw new HttpError(400, "قالب فرمان دفتر چک آفلاین معتبر نیست");
  const allowed = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(raw).some((key) => !allowed.includes(key)) || typeof raw.id !== "string" || !UUID.test(raw.id) || !Number.isSafeInteger(raw.businessId) || Number(raw.businessId) < 1 || typeof raw.baseSnapshotId !== "string" || !UUID.test(raw.baseSnapshotId) || !Number.isSafeInteger(raw.baseRevision) || Number(raw.baseRevision) < 1 || !isRecord(raw.payload)) throw new HttpError(400, "شناسه یا snapshot پایهٔ دفتر چک معتبر نیست");
  const payload = raw.payload;
  if (raw.action === "register") {
    const keys = ["direction", "beneficiaryId", "partnerName", "amount", "issueDate", "dueDate", "chequeNumber", "serialNumber", "bank", "branch", "expensePurpose", "sayadIdentifier", "note", "accountingAccountId", "newBeneficiary"];
    if (Object.keys(payload).some((key) => !keys.includes(key)) || !["payable", "receivable"].includes(String(payload.direction)) || !(payload.beneficiaryId === null || (Number.isSafeInteger(payload.beneficiaryId) && Number(payload.beneficiaryId) > 0)) || !Number.isSafeInteger(payload.amount) || Number(payload.amount) < 1 || Number(payload.amount) > 2_000_000_000_000 || !Number.isSafeInteger(payload.accountingAccountId) || Number(payload.accountingAccountId) < 1 || typeof payload.issueDate !== "string" || !ISO.test(payload.issueDate) || !Number.isFinite(Date.parse(payload.issueDate)) || typeof payload.dueDate !== "string" || !ISO.test(payload.dueDate) || !Number.isFinite(Date.parse(payload.dueDate))) throw new HttpError(400, "مبلغ، جهت، تاریخ یا حساب طرف چک معتبر نیست");
    for (const key of ["partnerName", "chequeNumber", "serialNumber", "bank", "branch", "expensePurpose", "sayadIdentifier", "note"]) if (typeof payload[key] !== "string") throw new HttpError(400, "متن یکی از فیلدهای چک معتبر نیست");
    if (payload.newBeneficiary !== undefined && payload.newBeneficiary !== null) {
      const person = payload.newBeneficiary;
      if (!isRecord(person) || Object.keys(person).some((key) => !["fullName", "nationalId", "phone"].includes(key)) || typeof person.fullName !== "string" || typeof person.nationalId !== "string" || typeof person.phone !== "string") throw new HttpError(400, "اطلاعات ذی‌نفع تازه معتبر نیست");
    }
  } else {
    const keys = ["chequeId", "expectedStatus", "status", "note", "accountingAccountId", "statusAccountId"];
    if (Object.keys(payload).some((key) => !keys.includes(key)) || !Number.isSafeInteger(payload.chequeId) || Number(payload.chequeId) < 1 || !STATUSES.includes(payload.expectedStatus as typeof STATUSES[number]) || !STATUSES.includes(payload.status as typeof STATUSES[number]) || typeof payload.note !== "string" || !Number.isSafeInteger(payload.accountingAccountId) || Number(payload.accountingAccountId) < 0 || !Number.isSafeInteger(payload.statusAccountId) || Number(payload.statusAccountId) < 0) throw new HttpError(400, "درخواست تغییر وضعیت چک معتبر نیست");
  }
  return raw as unknown as ChequeCommand;
}

function validNationalId(value: string) {
  if (!/^\d{10}$/.test(value) || /^([0-9])\1{9}$/.test(value)) return false;
  const check = Number(value[9]);
  const sum = value.slice(0, 9).split("").reduce((total, digit, index) => total + Number(digit) * (10 - index), 0) % 11;
  return sum < 2 ? check === sum : check === 11 - sum;
}

async function selectedCounterAccount(tx: typeof db, businessId: number, id: number) {
  const [account] = await tx.select().from(accAccounts).where(and(eq(accAccounts.id, id), eq(accAccounts.businessId, businessId))).for("update").limit(1);
  if (!account || !account.isActive || !["moein", "tafsili"].includes(account.level) || account.code === Accounting.C.CHEQUE_RECEIVABLE || account.code === Accounting.C.CHEQUE_PAYABLE) throw new HttpError(409, "کد حساب طرف چک دیگر فعال یا مجاز نیست");
  return account;
}

async function reverseChequeDocument(tx: typeof db, business: typeof businesses.$inferSelect, documentId: number, requestKey: string, chequeId: number, actor: string, now: Date) {
  const [document] = await tx.select().from(accDocuments).where(and(eq(accDocuments.id, documentId), eq(accDocuments.businessId, business.id))).for("update");
  if (!document || document.status !== "posted" || document.reversed || document.kind === "closing") throw new HttpError(409, "سند وضعیت قبلی قابل برگشت نیست؛ دفتر حسابداری را بررسی کنید");
  const lines = await tx.select().from(accLines).where(and(eq(accLines.documentId, document.id), eq(accLines.businessId, business.id)));
  if (lines.length < 2) throw new HttpError(409, "ردیف‌های سند وضعیت قبلی ناقص است");
  const reversal = await Accounting.postDocumentInTransaction(tx, business, {
    date: now, kind: "general", source: "reversal", sourceRef: `cheque:${chequeId}:reverse:${requestKey}`,
    reversedOf: document.id, createdBy: actor, description: `برگشت خودکار سند وضعیت چک #${chequeId} — سند ${document.number}`,
    lines: lines.map((line) => ({ accountId: line.accountId, debit: line.credit, credit: line.debit, description: `برگشت: ${line.description}` })),
  });
  await tx.update(accDocuments).set({ reversed: true }).where(and(eq(accDocuments.id, document.id), eq(accDocuments.businessId, business.id)));
  return reversal.id;
}

export async function syncOfflineChequeCommand(req: Request, raw: unknown) {
  const command = parseCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos") || !hasAny(features, "cheque_register") || !hasAny(features, "accounting")) throw new HttpError(403, "صندوق آفلاین، دفتر چک و حسابداری باید در اشتراک فعال باشند");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان چک متعلق به کسب‌وکار این دستگاه نیست");
  await Accounting.ensureChequeAccountingAccounts(business);
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");
  const requestKey = `offline:${terminal.id}:${command.id}`;
  let outcome: { httpStatus: number; response: Record<string, unknown> };
  try {
    outcome = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [activeBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!activeBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");
    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسه فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      return { httpStatus: previous.httpStatus, response: previous.result };
    }
    const [snapshot] = await tx.select().from(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId), eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.businessId, business.id), eq(offlineWorkspaceSnapshots.dataset, "cheques"), eq(offlineWorkspaceSnapshots.revision, command.baseRevision))).for("update");
    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "", extra: Record<string, unknown> = {}) => {
      const response = { commandId: command.id, state, receipt, ...extra, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({ id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy, module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>, state, httpStatus, error, receipt, result: response });
      return { httpStatus, response };
    };
    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "نسخهٔ دفتر چک پیدا نشد یا اعتبارش پایان یافته است؛ بعد از اتصال نسخهٔ تازه بگیرید");
    const snapshotCheques = Array.isArray(snapshot.payload.cheques) ? snapshot.payload.cheques as Record<string, unknown>[] : [];
    const snapshotAccounts = Array.isArray(snapshot.payload.accounts) ? snapshot.payload.accounts as Record<string, unknown>[] : [];
    if (command.action === "register") {
      const p = command.payload;
      const direction = String(p.direction) as "payable" | "receivable";
      const amount = Number(p.amount);
      const issueDate = parseTehranDateTime(String(p.issueDate)), dueDate = parseTehranDateTime(String(p.dueDate));
      const partnerName = String(p.partnerName).trim().replace(/\s+/g, " ").slice(0, 120);
      const chequeNumber = normalizeIranianDigits(String(p.chequeNumber)).trim().slice(0, 40);
      const serialNumber = normalizeIranianDigits(String(p.serialNumber)).trim().slice(0, 40);
      const bank = String(p.bank).trim().slice(0, 60);
      if (!partnerName || !chequeNumber || !serialNumber || !bank || !Number.isFinite(issueDate.getTime()) || !Number.isFinite(dueDate.getTime()) || issueDate > dueDate) return record("rejected", 422, "اطلاعات ذی‌نفع، شماره، بانک یا تاریخ چک معتبر نیست");
      const accountId = Number(p.accountingAccountId);
      if (!snapshotAccounts.some((row) => row.id === accountId && row.isActive === true)) return record("conflict", 409, "حساب طرف چک در نسخهٔ مبنا فعال نیست؛ نسخه را تازه کنید");
      const [duplicate] = await tx.select({ id: cheques.id }).from(cheques).where(and(eq(cheques.businessId, business.id), eq(cheques.serialNumber, serialNumber), eq(cheques.chequeNumber, chequeNumber))).limit(1);
      if (duplicate) return record("conflict", 409, "چکی با این شماره و سریال از قبل ثبت شده است");
      let beneficiaryId: number | null = p.beneficiaryId === null ? null : Number(p.beneficiaryId);
      if (beneficiaryId !== null) {
        const snapshotBeneficiaries = Array.isArray(snapshot.payload.beneficiaries) ? snapshot.payload.beneficiaries as Record<string, unknown>[] : [];
        if (!snapshotBeneficiaries.some((row) => row.id === beneficiaryId)) return record("conflict", 409, "ذی‌نفع در نسخهٔ مبنا پیدا نشد؛ نسخه را تازه کنید");
        const [beneficiary] = await tx.select({ id: chequeBeneficiaries.id, fullName: chequeBeneficiaries.fullName }).from(chequeBeneficiaries).where(and(eq(chequeBeneficiaries.id, beneficiaryId), eq(chequeBeneficiaries.businessId, business.id))).for("update").limit(1);
        if (!beneficiary) return record("conflict", 409, "ذی‌نفع حذف شده است؛ نسخه را تازه کنید");
        if (beneficiary.fullName !== partnerName) return record("conflict", 409, "نام ذی‌نفع از زمان دریافت نسخه تغییر کرده است");
      }
      const newPerson = isRecord(p.newBeneficiary) ? p.newBeneficiary : null;
      if (!beneficiaryId && newPerson) {
        const fullName = String(newPerson.fullName).trim().replace(/\s+/g, " ").slice(0, 120);
        const nationalId = normalizeIranianDigits(String(newPerson.nationalId)).replace(/\D/g, "");
        const phone = normalizeIranianMobile(String(newPerson.phone));
        if (fullName.length < 2 || fullName !== partnerName || (nationalId && !validNationalId(nationalId)) || (newPerson.phone && !phone)) return record("rejected", 422, "اطلاعات ذی‌نفع تازه معتبر نیست");
        if (nationalId) {
          const [existing] = await tx.select().from(chequeBeneficiaries).where(and(eq(chequeBeneficiaries.businessId, business.id), eq(chequeBeneficiaries.nationalId, nationalId))).for("update").limit(1);
          if (existing) return record("conflict", 409, "ذی‌نفعی با این کد ملی قبلاً ثبت شده است؛ ابتدا snapshot را تازه کنید");
        }
        const [createdBeneficiary] = await tx.insert(chequeBeneficiaries).values({ businessId: business.id, fullName, nationalId, phone }).returning({ id: chequeBeneficiaries.id });
        beneficiaryId = createdBeneficiary.id;
      }
      const account = await selectedCounterAccount(tx, business.id, accountId);
      const [created] = await tx.insert(cheques).values({ businessId: business.id, beneficiaryId, direction, status: "registered", partnerName, amount, issueDate, dueDate, chequeNumber, serialNumber, bank, branch: String(p.branch).trim().slice(0, 100), expensePurpose: String(p.expensePurpose).trim().slice(0, 120), sayadIdentifier: String(p.sayadIdentifier).trim().slice(0, 40), note: String(p.note).trim().slice(0, 500), createdBy: terminal.createdBy, accountingAccountId: account.id, createdAt: new Date(), updatedAt: new Date() }).returning();
      const ledgerCode = direction === "receivable" ? Accounting.C.CHEQUE_RECEIVABLE : Accounting.C.CHEQUE_PAYABLE;
      const document = await Accounting.postDocumentInTransaction(tx, business, { date: new Date(), source: "cheque", sourceRef: `cheque:${created.id}:initial`, createdBy: `صندوق آفلاین ${terminal.id.slice(0, 8)}`, description: `ثبت ${direction === "receivable" ? "چک دریافتنی" : "چک پرداختنی"} #${created.id} — ${partnerName}`, lines: buildChequeRegistrationLines(direction, account.id, ledgerCode, amount) });
      const [saved] = await tx.update(cheques).set({ accountingDocumentId: document.id }).where(and(eq(cheques.id, created.id), eq(cheques.businessId, business.id))).returning({ id: cheques.id });
      await tx.insert(chequeEvents).values({ businessId: business.id, chequeId: saved.id, requestKey, fromStatus: null, toStatus: "registered", note: "ثبت آفلاین و ایجاد سند حسابداری", actorId: terminal.createdBy, accountingAccountId: account.id, accountingDocumentId: document.id, createdAt: new Date() });
      return record("applied", 200, "", randomUUID(), { chequeId: saved.id, status: "registered", documentId: document.id });
    }

    const p = command.payload, id = Number(p.chequeId), expectedStatus = String(p.expectedStatus), nextStatus = String(p.status);
    const base = snapshotCheques.find((row) => row.id === id);
    if (!base || base.status !== expectedStatus) return record("conflict", 409, "چک در نسخهٔ مبنا پیدا نشد یا وضعیت آن تغییر کرده است");
    const [current] = await tx.select().from(cheques).where(and(eq(cheques.id, id), eq(cheques.businessId, business.id))).for("update");
    if (!current || current.status !== expectedStatus || current.updatedAt.toISOString() !== String(base.updatedAt)) return record("conflict", 409, "چک از زمان snapshot تغییر کرده است؛ وضعیت را تازه کنید");
    if (!isChequeTransitionAllowed(current.status, nextStatus, current.direction)) return record("rejected", 422, "وضعیت انتخاب‌شده برای جهت این چک مجاز نیست");
    const [lastCurrentEvent] = await tx.select().from(chequeEvents).where(and(eq(chequeEvents.businessId, business.id), eq(chequeEvents.chequeId, current.id), isNotNull(chequeEvents.fromStatus), eq(chequeEvents.toStatus, current.status))).orderBy(desc(chequeEvents.id)).limit(1);
    const requestedAccountId = Number(p.accountingAccountId), requestedStatusAccountId = Number(p.statusAccountId);
    const assignedAccountChanged = nextStatus === "assigned" && lastCurrentEvent?.accountingAccountId !== requestedStatusAccountId;
    const needsInitialAccounting = !current.accountingDocumentId;
    if (current.status === nextStatus && !needsInitialAccounting && !assignedAccountChanged) return record("rejected", 422, "چک هم‌اکنون همین وضعیت را دارد");
    const accountIds = new Set(snapshotAccounts.filter((row) => row.isActive === true).map((row) => Number(row.id)));
    if (needsInitialAccounting && (!Number.isSafeInteger(requestedAccountId) || requestedAccountId < 1 || !accountIds.has(requestedAccountId))) return record("conflict", 409, "برای سند پایه حساب معتبری در نسخهٔ محلی نیست");
    if (nextStatus === "assigned" && (!Number.isSafeInteger(requestedStatusAccountId) || requestedStatusAccountId < 1 || !accountIds.has(requestedStatusAccountId))) return record("conflict", 409, "حساب مقصد واگذاری در نسخهٔ محلی فعال نیست");
    const initialAccount = needsInitialAccounting ? await selectedCounterAccount(tx, business.id, requestedAccountId) : null;
    const statusAccount = nextStatus === "assigned" ? await selectedCounterAccount(tx, business.id, requestedStatusAccountId) : null;
    const now = new Date(), direction = current.direction as "receivable" | "payable";
    const ledgerCode = direction === "receivable" ? Accounting.C.CHEQUE_RECEIVABLE : Accounting.C.CHEQUE_PAYABLE;
    let baseAccountId = current.accountingAccountId, baseDocumentId = current.accountingDocumentId;
    if (!baseDocumentId) {
      if (!initialAccount) return record("conflict", 409, "حساب سند پایهٔ چک مشخص نیست");
      baseAccountId = initialAccount.id;
      const baseDocument = await Accounting.postDocumentInTransaction(tx, business, { date: now, source: "cheque", sourceRef: `cheque:${current.id}:initial`, createdBy: `صندوق آفلاین ${terminal.id.slice(0, 8)}`, description: `تکمیل سند پایه چک #${current.id}`, lines: buildChequeRegistrationLines(direction, baseAccountId, ledgerCode, current.amount) });
      baseDocumentId = baseDocument.id;
    }
    if (!baseAccountId || !baseDocumentId) return record("conflict", 409, "سند پایهٔ چک ناقص است");
    let reversalDocumentId: number | null = null;
    if (current.status !== "registered" && lastCurrentEvent?.accountingDocumentId) reversalDocumentId = await reverseChequeDocument(tx, business, lastCurrentEvent.accountingDocumentId, requestKey, current.id, `صندوق آفلاین ${terminal.id.slice(0, 8)}`, now);
    const counterId = nextStatus === "assigned" ? statusAccount!.id : baseAccountId;
    const lines = buildChequeStatusLines(direction, nextStatus as typeof STATUSES[number], counterId, ledgerCode, Accounting.C.BANK, current.amount);
    let accountingDocumentId: number | null = null;
    if (lines.length) accountingDocumentId = (await Accounting.postDocumentInTransaction(tx, business, { date: now, source: "cheque", sourceRef: `cheque:${current.id}:state:${requestKey}`, createdBy: `صندوق آفلاین ${terminal.id.slice(0, 8)}`, description: `تغییر وضعیت چک #${current.id} به ${nextStatus}`, lines })).id;
    const [updated] = await tx.update(cheques).set({ status: nextStatus, accountingAccountId: baseAccountId, accountingDocumentId: baseDocumentId, updatedAt: now }).where(and(eq(cheques.id, current.id), eq(cheques.businessId, business.id), eq(cheques.status, current.status))).returning({ id: cheques.id, status: cheques.status });
    if (!updated) return record("conflict", 409, "وضعیت چک هم‌زمان تغییر کرد");
    await tx.insert(chequeEvents).values({ businessId: business.id, chequeId: current.id, requestKey, fromStatus: current.status, toStatus: nextStatus, note: String(p.note).trim().slice(0, 300), actorId: terminal.createdBy, accountingAccountId: nextStatus === "assigned" ? statusAccount!.id : baseAccountId, reversalDocumentId, accountingDocumentId, createdAt: now });
    return record("applied", 200, "", randomUUID(), { chequeId: updated.id, status: updated.status, accountingDocumentId, reversalDocumentId });
    }, { isolationLevel: "repeatable read" });
  } catch (error) {
    const databaseError = error as { code?: string; constraint?: string };
    if (databaseError.code === "23505" && databaseError.constraint === "cheques_business_serial_number_idx") throw new HttpError(409, "چکی با این شماره و سریال هم‌زمان ثبت شده است");
    throw error;
  }
  if (outcome.httpStatus !== 200) throw new HttpError(outcome.httpStatus, "error" in outcome.response && typeof outcome.response.error === "string" ? outcome.response.error : "ثبت تغییر آفلاین چک انجام نشد");
  return outcome.response;
}
