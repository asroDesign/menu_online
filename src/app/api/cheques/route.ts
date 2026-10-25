import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { accAccounts, accDocuments, accLines, chequeBeneficiaries, chequeEvents, cheques } from "@/db/schema";
import { HttpError, readJson, withAuth, type AuthContext } from "@/lib/auth";
import * as A from "@/lib/accounting";
import { buildChequeRegistrationLines, buildChequeStatusLines, isChequeTransitionAllowed } from "@/lib/cheques";
import { jMonthRange } from "@/lib/jalali";
import { parseTehranDateTime } from "@/lib/tehran-time";
import { normalizeIranianDigits } from "@/lib/cheque-reminders-core";

const options = { feature: "cheque_register", manager: true, roles: ["accountant"] };

async function selectedCounterAccount(tx: typeof db, businessId: number, id: number) {
  const [account] = await tx.select().from(accAccounts).where(and(eq(accAccounts.id, id), eq(accAccounts.businessId, businessId))).limit(1);
  if (!account || !account.isActive || !["moein", "tafsili"].includes(account.level) || account.code === A.C.CHEQUE_RECEIVABLE || account.code === A.C.CHEQUE_PAYABLE) {
    throw new HttpError(400, "کد حساب طرف چک معتبر یا فعال نیست؛ یک حساب معین یا تفصیلی انتخاب کنید.");
  }
  return account;
}

async function reverseChequeDocument(tx: typeof db, auth: AuthContext, documentId: number, requestKey: string, chequeId: number, now: Date) {
  const [document] = await tx.select().from(accDocuments).where(and(eq(accDocuments.id, documentId), eq(accDocuments.businessId, auth.business.id))).for("update");
  if (!document || document.status !== "posted" || document.reversed || document.kind === "closing") {
    throw new HttpError(409, "سند وضعیت قبلی قابل برگشت نیست؛ دفتر حسابداری را بررسی کنید.");
  }
  const lines = await tx.select().from(accLines).where(and(eq(accLines.documentId, document.id), eq(accLines.businessId, auth.business.id)));
  if (lines.length < 2) throw new HttpError(409, "ردیف‌های سند وضعیت قبلی ناقص است.");
  const reversal = await A.postDocumentInTransaction(tx, auth.business, {
    date: now,
    kind: "general",
    source: "reversal",
    sourceRef: `cheque:${chequeId}:reverse:${requestKey}`,
    reversedOf: document.id,
    createdBy: String(auth.user.id),
    description: `برگشت خودکار سند وضعیت چک #${chequeId} — سند ${document.number}`,
    lines: lines.map((line) => ({ accountId: line.accountId, debit: line.credit, credit: line.debit, description: `برگشت: ${line.description}` })),
  });
  await tx.update(accDocuments).set({ reversed: true }).where(and(eq(accDocuments.id, document.id), eq(accDocuments.businessId, auth.business.id)));
  return reversal.id;
}

export const GET = withAuth(async (req, auth) => {
  const url = new URL(req.url);
  const yearValue = url.searchParams.get("year");
  const monthValue = url.searchParams.get("month");
  let where = eq(cheques.businessId, auth.business.id);
  const monthly = yearValue !== null || monthValue !== null;
  if (monthly) {
    const year = Number(yearValue), month = Number(monthValue);
    if (!yearValue || !monthValue || !Number.isInteger(year) || year < 1300 || year > 1500 || !Number.isInteger(month) || month < 1 || month > 12)
      throw new HttpError(400, "ماه شمسی نامعتبر است.");
    const range = jMonthRange(year, month);
    where = and(where, gte(cheques.dueDate, range.start), lte(cheques.dueDate, range.end))!;
  }
  const items = await db.select().from(cheques).where(where).orderBy(desc(cheques.dueDate), desc(cheques.id)).limit(monthly ? 5_000 : 500);
  const events = items.length ? await db.select().from(chequeEvents).where(eq(chequeEvents.businessId, auth.business.id)).orderBy(desc(chequeEvents.createdAt)).limit(2_000) : [];
  const byId = new Map<number, typeof events>();
  for (const event of events) byId.set(event.chequeId, [...(byId.get(event.chequeId) ?? []), event]);
  return Response.json({ items: items.map((item) => ({ ...item, events: byId.get(item.id) ?? [] })) }, { headers: { "Cache-Control": "no-store" } });
}, options);

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 8 * 1024);
  const direction: "receivable" | "payable" | "" = body.direction === "receivable" ? "receivable" : body.direction === "payable" ? "payable" : "";
  const amount = Number(String(body.amount ?? "").replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))));
  const dueDate = parseTehranDateTime(body.dueDate);
  const issueDate = body.issueDate ? parseTehranDateTime(body.issueDate) : new Date();
  const accountingAccountId = Number(body.accountingAccountId);
  if (!direction || !Number.isSafeInteger(amount) || amount <= 0 || amount > 2_000_000_000_000 || !Number.isFinite(dueDate.getTime()) || !Number.isFinite(issueDate.getTime())) throw new HttpError(400, "جهت، مبلغ و تاریخ‌های چک را درست وارد کنید.");
  if (issueDate.getTime() > dueDate.getTime()) throw new HttpError(400, "تاریخ صدور چک نمی‌تواند بعد از تاریخ سررسید باشد.");
  if (!Number.isSafeInteger(accountingAccountId) || accountingAccountId < 1) throw new HttpError(400, "انتخاب کد حساب طرف سند الزامی است.");
  await A.ensureChequeAccountingAccounts(auth.business);
  const beneficiaryId = body.beneficiaryId === null || body.beneficiaryId === "" || body.beneficiaryId === undefined ? null : Number(body.beneficiaryId);
  let partnerName = typeof body.partnerName === "string" ? body.partnerName.trim().slice(0, 120) : "";
  if (beneficiaryId !== null) {
    if (!Number.isSafeInteger(beneficiaryId) || beneficiaryId < 1) throw new HttpError(400, "ذی‌نفع انتخاب‌شده معتبر نیست.");
    const [beneficiary] = await db.select({ id: chequeBeneficiaries.id, fullName: chequeBeneficiaries.fullName }).from(chequeBeneficiaries)
      .where(and(eq(chequeBeneficiaries.id, beneficiaryId), eq(chequeBeneficiaries.businessId, auth.business.id))).limit(1);
    if (!beneficiary) throw new HttpError(400, "ذی‌نفع انتخاب‌شده در این کسب‌وکار ثبت نشده است.");
    partnerName = beneficiary.fullName;
  }
  if (!partnerName) throw new HttpError(400, "ذی‌نفع یا نام طرف چک را وارد کنید.");
  const chequeNumber = typeof body.chequeNumber === "string" ? normalizeIranianDigits(body.chequeNumber).trim().slice(0, 40) : "";
  const serialNumber = typeof body.serialNumber === "string" ? normalizeIranianDigits(body.serialNumber).trim().slice(0, 40) : "";
  if (!chequeNumber || !serialNumber) throw new HttpError(400, "شماره و سریال چک را وارد کنید.");
  const bank = typeof body.bank === "string" ? body.bank.trim().slice(0, 60) : "";
  if (!bank) throw new HttpError(400, "بانک صادرکننده چک را انتخاب کنید.");
  const branch = typeof body.branch === "string" ? body.branch.trim().slice(0, 100) : "";
  const expensePurpose = typeof body.expensePurpose === "string" ? body.expensePurpose.trim().slice(0, 120) : "";
  const sayadIdentifier = typeof body.sayadIdentifier === "string" ? body.sayadIdentifier.trim().slice(0, 40) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const now = new Date();
  const [duplicate] = await db.select({ id: cheques.id }).from(cheques).where(and(
    eq(cheques.businessId, auth.business.id), eq(cheques.serialNumber, serialNumber), eq(cheques.chequeNumber, chequeNumber),
  )).limit(1);
  if (duplicate) throw new HttpError(409, "چکی با این شماره و سریال قبلاً ثبت شده است.");
  let item: typeof cheques.$inferSelect;
  try {
  item = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const account = await selectedCounterAccount(tx, auth.business.id, accountingAccountId);
    const [created] = await tx.insert(cheques).values({ businessId: auth.business.id, beneficiaryId, direction, status: "registered", partnerName, amount, issueDate, dueDate, chequeNumber, serialNumber, bank, branch, expensePurpose, sayadIdentifier, note, createdBy: auth.user.id, accountingAccountId: account.id, createdAt: now, updatedAt: now }).returning();
    const ledgerCode = direction === "receivable" ? A.C.CHEQUE_RECEIVABLE : A.C.CHEQUE_PAYABLE;
    const document = await A.postDocumentInTransaction(tx, auth.business, {
      date: now, source: "cheque", sourceRef: `cheque:${created.id}:initial`, createdBy: String(auth.user.id),
      description: `ثبت ${direction === "receivable" ? "چک دریافتنی" : "چک پرداختنی"} #${created.id} — ${partnerName || "بدون نام طرف حساب"}`,
      lines: buildChequeRegistrationLines(direction, account.id, ledgerCode, amount),
    });
    const [saved] = await tx.update(cheques).set({ accountingDocumentId: document.id }).where(and(eq(cheques.id, created.id), eq(cheques.businessId, auth.business.id))).returning();
    await tx.insert(chequeEvents).values({ businessId: auth.business.id, chequeId: saved.id, requestKey: `created:${saved.id}`, fromStatus: null, toStatus: saved.status, note: "ثبت اولیه و ایجاد سند حسابداری", actorId: auth.user.id, accountingAccountId: account.id, accountingDocumentId: document.id, createdAt: now });
    return saved;
  });
  } catch (error) {
    const databaseError = error as { code?: string; constraint?: string };
    if (databaseError.code === "23505" && databaseError.constraint === "cheques_business_serial_number_idx") throw new HttpError(409, "چکی با این شماره و سریال هم‌زمان ثبت شده است.");
    throw error;
  }
  return Response.json({ item: { ...item, events: [] } }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, options);

export const PATCH = withAuth(async (req, auth) => {
  const body = await readJson(req, 4 * 1024);
  const id = Number(body.id), nextStatus = String(body.status), requestKey = typeof body.requestKey === "string" ? body.requestKey : "";
  if (!Number.isSafeInteger(id) || id < 1 || !/^[0-9a-f-]{36}$/i.test(requestKey)) throw new HttpError(400, "درخواست معتبر نیست.");
  if (!/^(registered|passed|bounced|returned|assigned|voided)$/.test(nextStatus)) throw new HttpError(400, "وضعیت انتخاب‌شده معتبر نیست.");
  const requestedAccountId = Number(body.accountingAccountId);
  const requestedStatusAccountId = Number(body.statusAccountId ?? body.accountingAccountId);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  await A.ensureChequeAccountingAccounts(auth.business);
  const item = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [replay] = await tx.select().from(chequeEvents).where(and(eq(chequeEvents.businessId, auth.business.id), eq(chequeEvents.requestKey, requestKey))).limit(1);
    if (replay) {
      if (replay.chequeId !== id) throw new HttpError(409, "کلید تکرار برای چک دیگری استفاده شده است.");
      return { id: replay.chequeId, status: replay.toStatus, replay: true };
    }
    const [current] = await tx.select().from(cheques).where(and(eq(cheques.id, id), eq(cheques.businessId, auth.business.id))).for("update");
    if (!current) throw new HttpError(404, "چک پیدا نشد.");
    const [committedReplay] = await tx.select().from(chequeEvents).where(and(eq(chequeEvents.businessId, auth.business.id), eq(chequeEvents.requestKey, requestKey))).limit(1);
    if (committedReplay) {
      if (committedReplay.chequeId !== id) throw new HttpError(409, "کلید تکرار برای چک دیگری استفاده شده است.");
      return { id: committedReplay.chequeId, status: committedReplay.toStatus, replay: true };
    }
    if (!isChequeTransitionAllowed(current.status, nextStatus, current.direction)) throw new HttpError(400, "وضعیت انتخاب‌شده برای این نوع چک معتبر نیست.");
    const [lastCurrentEvent] = await tx.select().from(chequeEvents).where(and(
      eq(chequeEvents.businessId, auth.business.id), eq(chequeEvents.chequeId, current.id),
      isNotNull(chequeEvents.fromStatus), eq(chequeEvents.toStatus, current.status),
    )).orderBy(desc(chequeEvents.id)).limit(1);
    const assignedAccountChanged = nextStatus === "assigned" && lastCurrentEvent?.accountingAccountId !== requestedStatusAccountId;
    const needsInitialAccounting = !current.accountingDocumentId;
    if (current.status === nextStatus && !needsInitialAccounting && !assignedAccountChanged) throw new HttpError(409, "این چک همین حالا همین وضعیت را دارد.");
    if (needsInitialAccounting && (!Number.isSafeInteger(requestedAccountId) || requestedAccountId < 1)) throw new HttpError(400, "برای تکمیل سند پایه کد حساب طرف را انتخاب کنید.");
    if (nextStatus === "assigned" && (!Number.isSafeInteger(requestedStatusAccountId) || requestedStatusAccountId < 1)) throw new HttpError(400, "برای واگذاری چک کد حساب مقصد را انتخاب کنید.");
    const requestedAccount = needsInitialAccounting ? await selectedCounterAccount(tx, auth.business.id, requestedAccountId) : null;
    const requestedStatusAccount = nextStatus === "assigned" ? await selectedCounterAccount(tx, auth.business.id, requestedStatusAccountId) : null;
    const now = new Date();
    const direction = current.direction as "receivable" | "payable";
    const ledgerCode = direction === "receivable" ? A.C.CHEQUE_RECEIVABLE : A.C.CHEQUE_PAYABLE;
    let baseAccountId = current.accountingAccountId;
    let baseDocumentId = current.accountingDocumentId;
    if (!baseDocumentId) {
      if (!requestedAccount) throw new HttpError(400, "برای تکمیل سند اولیه کد حساب را انتخاب کنید.");
      baseAccountId = requestedAccount.id;
      const baseDocument = await A.postDocumentInTransaction(tx, auth.business, {
        date: now, source: "cheque", sourceRef: `cheque:${current.id}:initial`, createdBy: String(auth.user.id),
        description: `تکمیل سند اولیه ${current.direction === "receivable" ? "چک دریافتنی" : "چک پرداختنی"} #${current.id}`,
        lines: buildChequeRegistrationLines(direction, baseAccountId, ledgerCode, current.amount),
      });
      baseDocumentId = baseDocument.id;
    }
    if (!baseAccountId || !baseDocumentId) throw new HttpError(409, "سند پایه چک ناقص است و امکان تغییر وضعیت وجود ندارد.");

    let reversalDocumentId: number | null = null;
    if (current.status !== "registered" && lastCurrentEvent?.accountingDocumentId) {
      reversalDocumentId = await reverseChequeDocument(tx, auth, lastCurrentEvent.accountingDocumentId, requestKey, current.id, now);
    }
    const statusAccountId = nextStatus === "assigned" ? requestedStatusAccount!.id : baseAccountId;
    const lines = buildChequeStatusLines(direction, nextStatus as "registered" | "passed" | "bounced" | "returned" | "assigned" | "voided", statusAccountId, ledgerCode, A.C.BANK, current.amount);
    let accountingDocumentId: number | null = null;
    if (lines.length) {
      const document = await A.postDocumentInTransaction(tx, auth.business, {
        date: now, source: "cheque", sourceRef: `cheque:${current.id}:state:${requestKey}`, createdBy: String(auth.user.id),
        description: `تغییر وضعیت چک #${current.id} به ${nextStatus}`,
        lines,
      });
      accountingDocumentId = document.id;
    }
    const [updated] = await tx.update(cheques).set({ status: nextStatus, accountingAccountId: baseAccountId, accountingDocumentId: baseDocumentId, updatedAt: now }).where(and(eq(cheques.id, current.id), eq(cheques.businessId, auth.business.id), eq(cheques.status, current.status))).returning({ id: cheques.id, status: cheques.status });
    if (!updated) throw new HttpError(409, "وضعیت چک هم‌زمان تغییر کرد.");
    await tx.insert(chequeEvents).values({
      businessId: auth.business.id, chequeId: current.id, requestKey, fromStatus: current.status, toStatus: nextStatus, note,
      actorId: auth.user.id, accountingAccountId: nextStatus === "assigned" ? requestedStatusAccount!.id : baseAccountId,
      reversalDocumentId, accountingDocumentId, createdAt: now,
    });
    return { ...updated, replay: false, accountingDocumentId, reversalDocumentId };
  });
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}, options);
