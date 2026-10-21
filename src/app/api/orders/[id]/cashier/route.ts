import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders, orderStatusEvents, receivables } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { ensureAccounting } from "@/lib/accounting";
import { settleOrder, type OrderTransaction } from "@/lib/orders";
import { parseCashierDebt } from "@/lib/cashier-debt-input";
import { enforceRateLimit } from "@/lib/rate-limit";

export const POST = withAuth<{ id: string }>(async (req, auth, { id }) => {
  await enforceRateLimit(req, "cashier-action", `${auth.business.id}:${auth.user.id}`, 30, 60_000);
  const body = await readJson(req, 8192);
  const orderId = Number(id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) throw new HttpError(400, "سفارش معتبر نیست");
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
