import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, customers, devices, orders, orderStatusEvents, receivables } from "@/db/schema";
import { HttpError, readJson, requireFeature, withAuth } from "@/lib/auth";
import { ensureAccounting } from "@/lib/accounting";
import { settleCashierOrder, settleOrder, type OrderTransaction } from "@/lib/orders";
import { parseCashierDebt } from "@/lib/cashier-debt-input";
import { enforceRateLimit } from "@/lib/rate-limit";
import { normalizeSettlementInput } from "@/lib/order-settlement-core";
import { createPosRequest, posOnline } from "@/lib/pos";

export const POST = withAuth<{ id: string }>(async (req, auth, { id }) => {
  await enforceRateLimit(req, "cashier-action", `${auth.business.id}:${auth.user.id}`, 30, 60_000);
  const body = await readJson(req, 8192);
  const orderId = Number(id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) throw new HttpError(400, "سفارش معتبر نیست");
  if (body.action === "settle") {
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.businessId, auth.business.id)));
    if (!order || order.deletedAt) throw new HttpError(404, "سفارش پیدا نشد");
    const submitted: Record<string, unknown> = typeof body.settlement === "object" && body.settlement
      ? { ...(body.settlement as Record<string, unknown>) }
      : {};
    const submittedPosAmount = Number(submitted.posAmount);
    if (submittedPosAmount > 0) {
      const selectedDeviceId = Number(submitted.posDeviceId);
      if (!Number.isSafeInteger(selectedDeviceId) || selectedDeviceId < 1) throw new HttpError(400, "کارتخوان صندوق را انتخاب کنید");
      const [device] = await db.select({ settlementBankAccountId: devices.settlementBankAccountId, cashierEnabled: devices.cashierEnabled })
        .from(devices).where(and(eq(devices.id, selectedDeviceId), eq(devices.businessId, auth.business.id), eq(devices.kind, "pos")));
      if (!device?.cashierEnabled || !device.settlementBankAccountId) throw new HttpError(400, "کارتخوان برای صندوق سفارش و حساب تسویه تنظیم نشده است");
      submitted.posBankAccountId = device.settlementBankAccountId;
    }
    const plan = normalizeSettlementInput(submitted, order.total);
    if (plan.creditAmount > 0) {
      try { plan.creditDetails = parseCashierDebt(plan.creditDetails ?? { name: order.customerName, phone: order.customerPhone }); }
      catch (error) { throw new HttpError(400, (error as Error).message); }
    }
    for (const bankId of [...new Set([
      ...(plan.bankAmount > 0 ? [plan.bankAccountId] : []),
      ...(plan.posAmount > 0 ? [plan.posBankAccountId] : []),
    ])]) {
      const [bank] = await db.select({ id: bankAccounts.id }).from(bankAccounts)
        .where(and(eq(bankAccounts.id, bankId ?? 0), eq(bankAccounts.businessId, auth.business.id)));
      if (!bank) throw new HttpError(400, "حساب بانکی انتخاب‌شده معتبر نیست");
    }
    if (plan.posAmount > 0) {
      requireFeature(auth, "tablet_pos");
      if (!(await posOnline(auth.business.id, plan.posDeviceId))) throw new HttpError(503, "کارتخوان انتخاب‌شده در دسترس نیست؛ اتصال دستگاه را بررسی کنید");
      const { req: posRequest, orderNumber } = await createPosRequest(auth.business, orderId, plan.posDeviceId, plan, "cashier");
      return Response.json({ ok: true, pendingPos: true, amount: posRequest.amount, orderNumber, requestId: posRequest.id });
    }
    const result = await settleCashierOrder(auth.business, auth.features, orderId, plan, { actorId: auth.user.id, actorType: auth.role });
    return Response.json({ ok: true, paymentBreakdown: result.paymentBreakdown });
  }
  if (body.action !== "confirm" && body.action !== "debt") throw new HttpError(400, "عملیات معتبر نیست");
  let details: ReturnType<typeof parseCashierDebt> | undefined;
  if (body.action === "debt") {
    try { details = parseCashierDebt(body.details); } catch (error) { throw new HttpError(400, (error as Error).message); }
    await ensureAccounting(auth.business);
  }
  await db.transaction(async rawTx => {
    const tx = rawTx as unknown as OrderTransaction;
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, auth.business.id))).for("update");
    if (!order || order.deletedAt) throw new HttpError(404, "سفارش پیدا نشد");
    if (body.action === "confirm") {
      const [previous] = await tx.select().from(orderStatusEvents).where(and(eq(orderStatusEvents.businessId, auth.business.id), eq(orderStatusEvents.orderId, order.id), eq(orderStatusEvents.kind, "cashier_confirmation"))).limit(1);
      if (previous) return;
      if (order.status !== "pending") throw new HttpError(409, "تنها سفارش در انتظار قابل تأیید است");
      await tx.insert(orderStatusEvents).values({ businessId: auth.business.id, orderId, kind: "cashier_confirmation", fromValue: "pending", toValue: "confirmed", actorType: auth.role, actorId: auth.user.id });
      return;
    }
    if (!details) throw new HttpError(400, "اطلاعات بدهکار لازم است");
    const [debt] = await tx.select().from(receivables).where(and(eq(receivables.businessId, auth.business.id), eq(receivables.orderId, order.id))).limit(1);
    if (debt) return; // Row lock makes retries safe, including double clicks.
    if (order.paymentStatus !== "unpaid" || !["pending", "preparing", "ready", "served"].includes(order.status)) throw new HttpError(409, "فقط سفارش باز و تسویه‌نشده قابل ثبت در بدهکاران است");
    let [customer] = await tx.select().from(customers).where(and(eq(customers.businessId, auth.business.id), eq(customers.phone, details.phone))).limit(1);
    if (!customer) {
      [customer] = await tx.insert(customers).values({ businessId: auth.business.id, name: details.name, phone: details.phone }).onConflictDoNothing().returning();
      if (!customer) [customer] = await tx.select().from(customers).where(and(eq(customers.businessId, auth.business.id), eq(customers.phone, details.phone))).limit(1);
    }
    if (!customer) throw new HttpError(409, "ثبت مشتری انجام نشد؛ دوباره تلاش کنید");
    await tx.update(orders).set({ customerId: customer.id, customerName: details.name, customerPhone: details.phone, updatedAt: new Date() }).where(and(eq(orders.id, order.id), eq(orders.businessId, auth.business.id)));
    await settleOrder(auth.business, auth.features, orderId, "credit", false, { creditSale: true, creditDetails: details, actorId: auth.user.id, actorType: auth.role, executor: tx });
  });
  return Response.json({ ok: true });
}, { feature: "cashier_pos", manager: true, roles: ["cashier"] });
