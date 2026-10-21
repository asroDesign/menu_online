import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orders, pagers } from "@/db/schema";
import { can, HttpError, readJson, requireFeature, withAuth } from "@/lib/auth";
import { listOrders, queuePrintJobs, recordOrderEvents, refundCashback, settleOrder } from "@/lib/orders";
import { isManagerRole } from "@/lib/roles";

const STATUSES = ["awaiting_payment", "pending", "preparing", "ready", "served", "paid", "canceled"];

export const PATCH = withAuth<{ id: string }>(
  async (req, auth, { id }) => {
    const { business } = auth;
    const b = await readJson(req);
    const oid = Number(id);
    const [existing] = await db.select().from(orders).where(and(eq(orders.id, oid), eq(orders.businessId, business.id)));
    if (!existing) throw new HttpError(404, "سفارش پیدا نشد");
    if (b.restore === true) {
      if (!isManagerRole(auth.role)) throw new HttpError(403, "بازگردانی سفارش فقط برای مدیر رستوران مجاز است");
      await db.update(orders).set({ deletedAt: null, deletedBy: null, updatedAt: new Date() }).where(eq(orders.id, oid));
      const [item] = await listOrders(business.id, { id: oid });
      return Response.json({ item });
    }
    if (existing.deletedAt) throw new HttpError(404, "سفارش پیدا نشد");
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (b.revokeTracking === true) {
      if (!isManagerRole(auth.role)) throw new HttpError(403, "ابطال پیوند پیگیری فقط برای مدیر مجاز است");
      set.trackingRevokedAt = new Date();
    }
    if (typeof b.status === "string") {
      if (!STATUSES.includes(b.status)) throw new HttpError(400, "وضعیت نامعتبر است");
      if (b.status !== "paid") set.status = b.status;
    }
    if (typeof b.note === "string") set.note = b.note.slice(0, 300);
    if (typeof b.customerName === "string") set.customerName = b.customerName.slice(0, 80);
    if ("waiterId" in b) set.waiterId = b.waiterId ? Number(b.waiterId) : null;
    if ("tableId" in b) set.tableId = b.tableId ? Number(b.tableId) : null;
    if ("courierId" in b) {
      requireFeature(auth, "courier");
      if (b.courierId) {
        const [c] = await db.select({ id: couriers.id }).from(couriers).where(and(eq(couriers.id, Number(b.courierId)), eq(couriers.businessId, business.id)));
        if (!c) throw new HttpError(400, "پیک نامعتبر است");
      }
      if (existing.type !== "delivery" && b.courierId) throw new HttpError(400, "فقط سفارش‌های ارسال (دلیوری) به پیک سپرده می‌شوند");
      if (existing.deliveryStatus === "picked_up" && existing.courierId && Number(b.courierId) !== existing.courierId) throw new HttpError(400, "سفارش هم‌اکنون در دست پیک است؛ ابتدا پیک باید وضعیت آن را مشخص کند");
      if (existing.deliveryStatus === "delivered") throw new HttpError(400, "این سفارش تحویل داده شده است");
      set.courierId = b.courierId ? Number(b.courierId) : null;
      set.deliveryStatus = b.courierId ? "assigned" : "none";
      set.assignedAt = b.courierId ? new Date() : null;
      set.pickedUpAt = null;
      set.deliveryFinishedAt = null;
      set.courierNote = "";
      // a returned (undelivered) order that is re-dispatched is ready for pick-up again
      if (b.courierId && ["not_home", "failed"].includes(existing.deliveryStatus) && existing.status === "served") set.status = "ready";
    }
    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      await tx.update(orders).set(set).where(and(eq(orders.id, oid), eq(orders.businessId, business.id)));
      const changes: Parameters<typeof recordOrderEvents>[3] = {};
      if (typeof set.status === "string") changes.order = [existing.status, set.status];
      if (typeof set.deliveryStatus === "string") changes.delivery = [existing.deliveryStatus, set.deliveryStatus];
      await recordOrderEvents(tx, business.id, oid, changes, auth.role, auth.user.id);
      if (existing.status !== "ready" && set.status === "ready")
        await queuePrintJobs(business, oid, auth.features, false, undefined, tx, "completed");
    });

    const status = typeof b.status === "string" ? b.status : null;
    if (status === "paid") {
      await settleOrder(business, auth.features, oid, typeof b.paymentMethod === "string" ? b.paymentMethod : null, true, { actorId: auth.user.id, actorType: auth.role });
    }
    if (status === "canceled") await refundCashback(business, oid);
    if (existing.status === "awaiting_payment" && status && !["awaiting_payment", "canceled", "paid"].includes(status)) await queuePrintJobs(business, oid, auth.features, false);
    if (can(auth, "foodcourt_pager") && status) {
      if (status === "ready") await db.update(pagers).set({ status: "ringing", ringRequestedAt: new Date(), ringSentAt: null }).where(and(eq(pagers.businessId, business.id), eq(pagers.orderId, oid)));
      if (["served", "paid", "canceled"].includes(status))
        await db.update(pagers).set({ status: "free", orderId: null }).where(and(eq(pagers.businessId, business.id), eq(pagers.orderId, oid)));
    }
    const [item] = await listOrders(business.id, { id: oid });
    return Response.json({ item });
  },
  { feature: "cashier_pos", manager: true, roles: ["waiter", "cashier", "chef"] },
);

export const DELETE = withAuth<{ id: string }>(
  async (_req, auth, { id }) => {
    const [row] = await db.update(orders)
      .set({ deletedAt: new Date(), deletedBy: auth.user.name, trackingRevokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(orders.id, Number(id)), eq(orders.businessId, auth.business.id), isNull(orders.deletedAt)))
      .returning({ id: orders.id });
    if (!row) throw new HttpError(404, "سفارش پیدا نشد");
    return Response.json({ ok: true });
  },
  { feature: "cashier_pos", manager: true },
);
