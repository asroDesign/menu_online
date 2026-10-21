import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accAccounts, bankAccounts, businesses, cashShifts, customers, orderStatusEvents, orders,
  receivableAccounts, receivableEvents, receivablePaymentReversals, receivablePayments, receivables, transactions,
} from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { C, ensureAccounting, postDocumentInTransaction } from "@/lib/accounting";
import { outstandingAmount, paymentFitsBalance, receivableState, validMoneyAmount } from "@/lib/receivables-core";

type Biz = typeof businesses.$inferSelect;
type Q = typeof db;

export async function listReceivableAccounts(businessId: number) {
  return db.select().from(receivableAccounts)
    .where(and(eq(receivableAccounts.businessId, businessId), eq(receivableAccounts.isActive, true)))
    .orderBy(receivableAccounts.name).limit(500);
}

export async function listReceivables(businessId: number, accountId?: number, range: { from?: Date; to?: Date } = {}) {
  const conditions = [eq(receivables.businessId, businessId)];
  if (accountId) conditions.push(eq(receivables.accountId, accountId));
  if (range.from) conditions.push(gte(receivables.createdAt, range.from));
  if (range.to) conditions.push(lte(receivables.createdAt, range.to));
  const rows = await db.select({
    id: receivables.id, accountId: receivables.accountId, accountName: receivableAccounts.name,
    accountType: receivableAccounts.type, phone: receivableAccounts.phone, orderId: receivables.orderId,
    orderNumber: orders.number, source: receivables.source, amount: receivables.amount,
    dueAt: receivables.dueAt, description: receivables.description,
    accountingDocumentId: receivables.accountingDocumentId, createdAt: receivables.createdAt,
  }).from(receivables)
    .innerJoin(receivableAccounts, and(eq(receivableAccounts.id, receivables.accountId), eq(receivableAccounts.businessId, receivables.businessId)))
    .leftJoin(orders, and(eq(orders.id, receivables.orderId), eq(orders.businessId, receivables.businessId)))
    .where(and(...conditions)).orderBy(desc(receivables.createdAt)).limit(500);
  const ids = rows.map((r) => r.id);
  const sums = ids.length ? await db.select({
    receivableId: receivablePayments.receivableId,
    total: sql<number>`coalesce(sum(${receivablePayments.amount}), 0)::bigint`,
  }).from(receivablePayments).where(and(eq(receivablePayments.businessId, businessId), inArray(receivablePayments.receivableId, ids)))
    .groupBy(receivablePayments.receivableId) : [];
  const reversals = ids.length ? await db.select({
    receivableId: receivablePayments.receivableId,
    total: sql<number>`coalesce(sum(${receivablePaymentReversals.amount}), 0)::bigint`,
  }).from(receivablePaymentReversals).innerJoin(receivablePayments, and(
    eq(receivablePayments.id, receivablePaymentReversals.paymentId), eq(receivablePayments.businessId, receivablePaymentReversals.businessId),
  )).where(and(eq(receivablePaymentReversals.businessId, businessId), inArray(receivablePayments.receivableId, ids)))
    .groupBy(receivablePayments.receivableId) : [];
  const paidById = new Map(sums.map((s) => [s.receivableId, Number(s.total) - Number(reversals.find((r) => r.receivableId === s.receivableId)?.total ?? 0)]));
  const now = new Date();
  return rows.map((row) => {
    const received = paidById.get(row.id) ?? 0;
    return { ...row, received, balance: outstandingAmount(Number(row.amount), received), status: receivableState(Number(row.amount), received, row.dueAt, now) };
  });
}

export async function receivableStatement(businessId: number, receivableId: number) {
  const [row] = await listReceivables(businessId).then((items) => items.filter((item) => item.id === receivableId));
  if (!row) throw new HttpError(404, "حساب دریافتنی پیدا نشد");
  const [payments, events] = await Promise.all([
    db.select().from(receivablePayments).where(and(eq(receivablePayments.businessId, businessId), eq(receivablePayments.receivableId, receivableId))).orderBy(desc(receivablePayments.createdAt)),
    db.select().from(receivableEvents).where(and(eq(receivableEvents.businessId, businessId), eq(receivableEvents.receivableId, receivableId))).orderBy(desc(receivableEvents.createdAt)),
  ]);
  const reversals = payments.length ? await db.select().from(receivablePaymentReversals)
    .where(and(eq(receivablePaymentReversals.businessId, businessId), inArray(receivablePaymentReversals.paymentId, payments.map((p) => p.id))))
    .orderBy(desc(receivablePaymentReversals.createdAt)) : [];
  return { item: row, payments, reversals, events };
}

export async function createReceivableAccount(businessId: number, actorId: number, input: {
  name: string; type?: string; phone?: string; note?: string; customerId?: number | null;
}) {
  if (input.customerId != null && (!Number.isSafeInteger(input.customerId) || input.customerId < 1)) throw new HttpError(400, "شناسه مشتری معتبر نیست");
  const name = input.name.trim().slice(0, 120);
  const type = input.type ?? "person";
  if (!name) throw new HttpError(400, "نام شخص یا سازمان را وارد کنید");
  if (type !== "person" && type !== "company") throw new HttpError(400, "نوع حساب معتبر نیست");
  const customerId = input.customerId ?? null;
  if (customerId) {
    const [customer] = await db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId))).limit(1);
    if (!customer) throw new HttpError(400, "مشتری در این کسب‌وکار پیدا نشد");
  }
  const [row] = await db.insert(receivableAccounts).values({
    businessId, name, type, customerId, phone: (input.phone ?? "").trim().slice(0, 32),
    note: (input.note ?? "").trim().slice(0, 500), createdBy: actorId,
  }).returning();
  return row;
}

export async function createManualReceivable(biz: Biz, actorId: number, input: {
  accountId: number; amount: number; dueAt?: string | null; description?: string;
}) {
  if (!Number.isSafeInteger(input.accountId) || input.accountId < 1) throw new HttpError(400, "حساب بدهکار معتبر نیست");
  if (!validMoneyAmount(input.amount)) throw new HttpError(400, "مبلغ بدهی معتبر نیست");
  const [account] = await db.select().from(receivableAccounts)
    .where(and(eq(receivableAccounts.id, input.accountId), eq(receivableAccounts.businessId, biz.id), eq(receivableAccounts.isActive, true))).limit(1);
  if (!account) throw new HttpError(404, "حساب بدهکار در این کسب‌وکار پیدا نشد");
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (input.dueAt && (!dueAt || Number.isNaN(dueAt.getTime()))) throw new HttpError(400, "تاریخ سررسید معتبر نیست");
  await ensureAccounting(biz);
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Q;
    const [item] = await tx.insert(receivables).values({
      businessId: biz.id, accountId: account.id, source: "manual", amount: input.amount,
      dueAt, description: (input.description ?? "").trim().slice(0, 500), createdBy: actorId,
    }).returning();
    const document = await postDocumentInTransaction(tx, biz, {
      date: new Date(), source: "receivable", sourceRef: `receivable:${item.id}`,
      description: `ثبت طلب از ${account.name}${item.description ? ` — ${item.description}` : ""}`.slice(0, 200), createdBy: String(actorId),
      lines: [{ code: C.AR, debit: input.amount, description: `مطالبات از ${account.name}` }, { code: C.OTHER_INC, credit: input.amount, description: "ثبت طلب دستی" }],
    });
    await tx.update(receivables).set({ accountingDocumentId: document.id }).where(and(eq(receivables.id, item.id), eq(receivables.businessId, biz.id)));
    await tx.insert(receivableEvents).values({ businessId: biz.id, receivableId: item.id, kind: "created", amount: input.amount, note: "ثبت دستی طلب", actorId });
    return { ...item, accountingDocumentId: document.id, accountName: account.name, received: 0, balance: input.amount, status: "open" as const };
  });
}

export async function recordReceivablePayment(biz: Biz, actorId: number, receivableId: number, input: {
  amount: number; method: string; bankAccountId?: number | null; idempotencyKey: string; note?: string;
}) {
  if (!validMoneyAmount(input.amount)) throw new HttpError(400, "مبلغ دریافتی معتبر نیست");
  if (!/^[A-Za-z0-9:_-]{16,120}$/.test(input.idempotencyKey)) throw new HttpError(400, "شناسه یکتای دریافت معتبر نیست");
  if (!["cash", "bank", "pos", "transfer"].includes(input.method)) throw new HttpError(400, "روش دریافت معتبر نیست");
  const bankAccountId = input.bankAccountId ?? null;
  if (input.method !== "cash" && !bankAccountId) throw new HttpError(400, "حساب بانکی را انتخاب کنید");
  if (bankAccountId !== null && (!Number.isSafeInteger(bankAccountId) || bankAccountId < 1)) throw new HttpError(400, "حساب بانکی معتبر نیست");
  if (bankAccountId) {
    const [account] = await db.select({ id: bankAccounts.id }).from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.businessId, biz.id))).limit(1);
    if (!account) throw new HttpError(400, "حساب بانکی در این کسب‌وکار پیدا نشد");
  }
  await ensureAccounting(biz);
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Q;
    const [locked] = await tx.select().from(receivables)
      .where(and(eq(receivables.id, receivableId), eq(receivables.businessId, biz.id))).for("update").limit(1);
    if (!locked) throw new HttpError(404, "حساب دریافتنی پیدا نشد");
    const [existing] = await tx.select().from(receivablePayments)
      .where(and(eq(receivablePayments.businessId, biz.id), eq(receivablePayments.idempotencyKey, input.idempotencyKey))).limit(1);
    if (existing) return { item: existing, duplicate: true };
    const [sum] = await tx.select({ total: sql<number>`coalesce(sum(${receivablePayments.amount}), 0)::bigint` })
      .from(receivablePayments).where(and(eq(receivablePayments.businessId, biz.id), eq(receivablePayments.receivableId, receivableId)));
    const [reversedSum] = await tx.select({ total: sql<number>`coalesce(sum(${receivablePaymentReversals.amount}), 0)::bigint` })
      .from(receivablePaymentReversals).innerJoin(receivablePayments, and(
        eq(receivablePayments.id, receivablePaymentReversals.paymentId), eq(receivablePayments.businessId, receivablePaymentReversals.businessId),
      )).where(and(eq(receivablePaymentReversals.businessId, biz.id), eq(receivablePayments.receivableId, receivableId)));
    const alreadyReceived = Number(sum.total) - Number(reversedSum.total);
    if (!paymentFitsBalance(Number(locked.amount), alreadyReceived, input.amount)) throw new HttpError(409, "مبلغ دریافت از مانده طلب بیشتر است");

    let shiftId: number | null = null;
    if (input.method === "cash") {
      const [shift] = await tx.select({ id: cashShifts.id }).from(cashShifts)
        .where(and(eq(cashShifts.businessId, biz.id), isNull(cashShifts.closedAt))).for("update").limit(1);
      shiftId = shift?.id ?? null;
    }
    const [payment] = await tx.insert(receivablePayments).values({
      businessId: biz.id, receivableId, amount: input.amount, method: input.method, bankAccountId,
      shiftId, idempotencyKey: input.idempotencyKey, note: (input.note ?? "").trim().slice(0, 300), createdBy: actorId,
    }).returning();
    const [control] = await tx.select({ id: accAccounts.id }).from(accAccounts)
      .where(and(eq(accAccounts.businessId, biz.id), eq(accAccounts.code, C.AR))).limit(1);
    if (!control) throw new HttpError(500, "حساب کنترل مطالبات در کدینگ پیدا نشد");
    let receivingAccount = control.id;
    if (input.method === "cash") {
      const [cash] = await tx.select({ id: accAccounts.id }).from(accAccounts)
        .where(and(eq(accAccounts.businessId, biz.id), eq(accAccounts.code, C.CASH))).limit(1);
      if (!cash) throw new HttpError(500, "حساب صندوق در کدینگ پیدا نشد");
      receivingAccount = cash.id;
    } else {
      if (bankAccountId === null) throw new HttpError(400, "حساب بانکی را انتخاب کنید");
      const [detail] = await tx.select({ id: accAccounts.id }).from(accAccounts)
        .where(and(eq(accAccounts.businessId, biz.id), eq(accAccounts.refType, "bank"), eq(accAccounts.refId, bankAccountId))).limit(1);
      if (detail) receivingAccount = detail.id;
      else {
        const [bank] = await tx.select({ id: accAccounts.id }).from(accAccounts)
          .where(and(eq(accAccounts.businessId, biz.id), eq(accAccounts.code, C.BANK))).limit(1);
        if (!bank) throw new HttpError(500, "حساب بانک در کدینگ پیدا نشد");
        receivingAccount = bank.id;
      }
    }
    const document = await postDocumentInTransaction(tx, biz, {
      date: new Date(), source: "receivable", sourceRef: `receivable-payment:${payment.id}`,
      description: `دریافت از ${locked.description || `طلب شماره ${locked.id}`}`.slice(0, 200), createdBy: String(actorId),
      lines: [{ accountId: receivingAccount, debit: input.amount, description: `دریافت ${input.method}` }, { accountId: control.id, credit: input.amount, description: "کاهش حساب دریافتنی" }],
    });
    const [transaction] = await tx.insert(transactions).values({
      businessId: biz.id, kind: "income", source: "receivable", category: "وصول مطالبات", amount: input.amount,
      bankAccountId, orderId: locked.orderId, shiftId, settlementMethod: input.method,
      sourceRef: `receivable-payment:${payment.id}`, description: `وصول طلب شماره ${locked.id}${input.note ? ` — ${input.note}` : ""}`.slice(0, 200),
    }).returning({ id: transactions.id });
    await tx.update(receivablePayments).set({ accountingDocumentId: document.id, transactionId: transaction.id })
      .where(and(eq(receivablePayments.id, payment.id), eq(receivablePayments.businessId, biz.id)));
    await tx.insert(receivableEvents).values({ businessId: biz.id, receivableId, kind: "payment", amount: input.amount, note: input.note?.slice(0, 300) ?? "ثبت دریافت", actorId });

    if (locked.orderId && alreadyReceived + input.amount === Number(locked.amount)) {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, locked.orderId), eq(orders.businessId, biz.id))).for("update").limit(1);
      if (order && order.paymentStatus !== "paid") {
        const nextStatus = order.status === "served" ? "paid" : order.status;
        await tx.update(orders).set({ paymentStatus: "paid", status: nextStatus, updatedAt: new Date() })
          .where(and(eq(orders.id, order.id), eq(orders.businessId, biz.id)));
        await tx.insert(orderStatusEvents).values({ businessId: biz.id, orderId: order.id, kind: "payment", fromValue: order.paymentStatus, toValue: "paid", actorType: "user", actorId });
        if (nextStatus !== order.status) await tx.insert(orderStatusEvents).values({ businessId: biz.id, orderId: order.id, kind: "order", fromValue: order.status, toValue: nextStatus, actorType: "user", actorId });
      }
    }
    return { item: { ...payment, accountingDocumentId: document.id, transactionId: transaction.id }, duplicate: false };
  });
}

export async function reverseReceivablePayment(biz: Biz, actorId: number, receivableId: number, paymentId: number, input: {
  amount: number; idempotencyKey: string; reason: string;
}) {
  const reason = input.reason.trim().slice(0, 300);
  if (!validMoneyAmount(input.amount)) throw new HttpError(400, "مبلغ برگشت معتبر نیست");
  if (!reason) throw new HttpError(400, "علت برگشت دریافت را وارد کنید");
  if (!/^[A-Za-z0-9:_-]{16,120}$/.test(input.idempotencyKey)) throw new HttpError(400, "شناسه یکتای برگشت معتبر نیست");
  await ensureAccounting(biz);
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Q;
    const [lockedReceivable] = await tx.select().from(receivables)
      .where(and(eq(receivables.id, receivableId), eq(receivables.businessId, biz.id))).for("update").limit(1);
    if (!lockedReceivable) throw new HttpError(404, "حساب دریافتنی پیدا نشد");
    const [existing] = await tx.select().from(receivablePaymentReversals)
      .where(and(eq(receivablePaymentReversals.businessId, biz.id), eq(receivablePaymentReversals.idempotencyKey, input.idempotencyKey))).limit(1);
    if (existing) return { item: existing, duplicate: true };
    const [payment] = await tx.select().from(receivablePayments)
      .where(and(eq(receivablePayments.id, paymentId), eq(receivablePayments.receivableId, receivableId), eq(receivablePayments.businessId, biz.id))).for("update").limit(1);
    if (!payment) throw new HttpError(404, "دریافت مورد نظر پیدا نشد");
    const [prior] = await tx.select({ total: sql<number>`coalesce(sum(${receivablePaymentReversals.amount}), 0)::bigint` })
      .from(receivablePaymentReversals).where(and(eq(receivablePaymentReversals.businessId, biz.id), eq(receivablePaymentReversals.paymentId, paymentId)));
    const refundable = Number(payment.amount) - Number(prior.total);
    if (!paymentFitsBalance(Number(payment.amount), Number(prior.total), input.amount)) throw new HttpError(409, "مبلغ برگشت از مانده این دریافت بیشتر است");

    let shiftId: number | null = null;
    if (payment.method === "cash") {
      const [shift] = await tx.select({ id: cashShifts.id }).from(cashShifts)
        .where(and(eq(cashShifts.businessId, biz.id), isNull(cashShifts.closedAt))).for("update").limit(1);
      shiftId = shift?.id ?? null;
    }
    const [reversal] = await tx.insert(receivablePaymentReversals).values({
      businessId: biz.id, paymentId, amount: input.amount, method: payment.method,
      bankAccountId: payment.bankAccountId, shiftId, idempotencyKey: input.idempotencyKey,
      reason, actorId,
    }).returning();
    const [control] = await tx.select({ id: accAccounts.id }).from(accAccounts)
      .where(and(eq(accAccounts.businessId, biz.id), eq(accAccounts.code, C.AR))).limit(1);
    if (!control) throw new HttpError(500, "حساب کنترل مطالبات در کدینگ پیدا نشد");
    let payingAccountId: number;
    if (payment.method === "cash") {
      const [cash] = await tx.select({ id: accAccounts.id }).from(accAccounts)
        .where(and(eq(accAccounts.businessId, biz.id), eq(accAccounts.code, C.CASH))).limit(1);
      if (!cash) throw new HttpError(500, "حساب صندوق در کدینگ پیدا نشد");
      payingAccountId = cash.id;
    } else {
      const [detail] = payment.bankAccountId ? await tx.select({ id: accAccounts.id }).from(accAccounts)
        .where(and(eq(accAccounts.businessId, biz.id), eq(accAccounts.refType, "bank"), eq(accAccounts.refId, payment.bankAccountId))).limit(1) : [];
      if (detail) payingAccountId = detail.id;
      else {
        const [bank] = await tx.select({ id: accAccounts.id }).from(accAccounts)
          .where(and(eq(accAccounts.businessId, biz.id), eq(accAccounts.code, C.BANK))).limit(1);
        if (!bank) throw new HttpError(500, "حساب بانک در کدینگ پیدا نشد");
        payingAccountId = bank.id;
      }
    }
    const document = await postDocumentInTransaction(tx, biz, {
      date: new Date(), source: "receivable_reversal", sourceRef: `receivable-reversal:${reversal.id}`,
      description: `برگشت دریافت طلب شماره ${receivableId}: ${reason}`.slice(0, 200), createdBy: String(actorId),
      lines: [{ accountId: control.id, debit: input.amount, description: "برگشت به مطالبات" }, { accountId: payingAccountId, credit: input.amount, description: `برگشت وجه ${payment.method}` }],
    });
    const [transaction] = await tx.insert(transactions).values({
      businessId: biz.id, kind: "expense", source: "receivable_reversal", category: "برگشت دریافت مطالبات", amount: input.amount,
      bankAccountId: payment.bankAccountId, orderId: lockedReceivable.orderId, shiftId,
      settlementMethod: payment.method, sourceRef: `receivable-reversal:${reversal.id}`,
      description: `برگشت دریافت طلب شماره ${receivableId} — ${reason}`.slice(0, 200),
    }).returning({ id: transactions.id });
    await tx.update(receivablePaymentReversals).set({ accountingDocumentId: document.id, transactionId: transaction.id })
      .where(and(eq(receivablePaymentReversals.id, reversal.id), eq(receivablePaymentReversals.businessId, biz.id)));
    await tx.insert(receivableEvents).values({ businessId: biz.id, receivableId, kind: "payment_reversed", amount: input.amount, note: reason, actorId });
    const [paidSum] = await tx.select({ total: sql<number>`coalesce(sum(${receivablePayments.amount}), 0)::bigint` })
      .from(receivablePayments).where(and(eq(receivablePayments.businessId, biz.id), eq(receivablePayments.receivableId, receivableId)));
    const [reversedTotal] = await tx.select({ total: sql<number>`coalesce(sum(${receivablePaymentReversals.amount}), 0)::bigint` })
      .from(receivablePaymentReversals).innerJoin(receivablePayments, and(
        eq(receivablePayments.id, receivablePaymentReversals.paymentId), eq(receivablePayments.businessId, receivablePaymentReversals.businessId),
      )).where(and(eq(receivablePaymentReversals.businessId, biz.id), eq(receivablePayments.receivableId, receivableId)));
    if (lockedReceivable.orderId && Number(paidSum.total) - Number(reversedTotal.total) < Number(lockedReceivable.amount)) {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, lockedReceivable.orderId), eq(orders.businessId, biz.id))).for("update").limit(1);
      if (order?.paymentStatus === "paid") {
        const nextStatus = order.status === "paid" ? "served" : order.status;
        await tx.update(orders).set({ paymentStatus: "unpaid", status: nextStatus, updatedAt: new Date() })
          .where(and(eq(orders.id, order.id), eq(orders.businessId, biz.id)));
        await tx.insert(orderStatusEvents).values({ businessId: biz.id, orderId: order.id, kind: "payment", fromValue: "paid", toValue: "unpaid", actorType: "user", actorId });
        if (nextStatus !== order.status) await tx.insert(orderStatusEvents).values({ businessId: biz.id, orderId: order.id, kind: "order", fromValue: order.status, toValue: nextStatus, actorType: "user", actorId });
      }
    }
    return { item: { ...reversal, accountingDocumentId: document.id, transactionId: transaction.id }, duplicate: false, refundable: refundable - input.amount };
  });
}
