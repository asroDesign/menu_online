import { randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, devices, orders, posRequests } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { queuePrintJobs, recordOrderEvents, refundCashback, settleOrder } from "@/lib/orders";
import type { FeatureMap } from "@/lib/plans";

type Biz = typeof businesses.$inferSelect;
type Req = typeof posRequests.$inferSelect;

/** How long a card payment may stay open before it is treated as failed. */
export const POS_TIMEOUT_MS = 180_000;
/** A held (unpaid) kiosk / online order is canceled automatically after this long. */
export const HOLD_MS = 15 * 60_000;
/** A POS bridge counts as online if it polled the server within this window. */
export const POS_ONLINE_MS = 45_000;

export async function posOnline(bizId: number, deviceId?: number | null) {
  const since = new Date(Date.now() - POS_ONLINE_MS);
  const rows = await db.select({ id: devices.id }).from(devices).where(and(eq(devices.businessId, bizId), eq(devices.kind, "pos"), gt(devices.lastSeenAt, since), deviceId ? eq(devices.id, deviceId) : undefined)).limit(1);
  return rows.length > 0;
}

/** Pending requests older than the timeout become "failed" (never re-sent to the terminal). */
export async function expirePosRequests(bizId?: number) {
  await db.update(posRequests).set({ status: "failed", detail: "زمان پرداخت با کارتخوان تمام شد", updatedAt: new Date() })
    .where(and(eq(posRequests.status, "pending"), lt(posRequests.createdAt, new Date(Date.now() - POS_TIMEOUT_MS)), bizId ? eq(posRequests.businessId, bizId) : undefined));
}

export async function createPosRequest(biz: Biz, orderId: number, deviceId?: number | null) {
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id)));
  if (!o) throw new HttpError(404, "سفارش پیدا نشد");
  if (o.paymentStatus === "paid" || o.status === "canceled") throw new HttpError(400, "این سفارش پرداخت یا لغو شده است");
  if (o.total < 1) throw new HttpError(400, "مبلغ سفارش صفر است");
  await db.update(posRequests).set({ status: "canceled", detail: "جایگزین درخواست جدید شد", updatedAt: new Date() }).where(and(eq(posRequests.orderId, o.id), eq(posRequests.status, "pending"), isNull(posRequests.pickedAt)));
  const [row] = await db.insert(posRequests).values({ businessId: biz.id, orderId: o.id, deviceId: deviceId ?? null, amount: o.total, token: randomBytes(12).toString("hex") }).returning();
  return { req: row, orderNumber: o.number };
}

/** Terminal confirmed the payment (also valid late: after a timeout/cancel, money was already taken). */
export async function approvePosRequest(biz: Biz, features: FeatureMap, r: Req, refNo: string) {
  await settleOrder(biz, features, r.orderId, "pos", false, { reopen: true });
  await db.update(posRequests).set({ status: "approved", refNo: refNo.slice(0, 40), detail: "", updatedAt: new Date() }).where(eq(posRequests.id, r.id));
}

/** Customer chose to pay at the counter instead: the held order is released to the kitchen, payment stays open. */
export async function releaseHeldOrder(biz: Biz, features: FeatureMap, orderId: number) {
  const released = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [current] = await tx.select({ status: orders.status }).from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id), eq(orders.status, "awaiting_payment"))).for("update");
    if (!current) return false;
    const [o] = await tx.update(orders).set({ status: "pending", updatedAt: new Date() }).where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id), eq(orders.status, "awaiting_payment"))).returning({ id: orders.id });
    if (o) await recordOrderEvents(tx, biz.id, orderId, { order: [current.status, "pending"] });
    return !!o;
  });
  if (released) await queuePrintJobs(biz, orderId, features, false);
}

export async function cancelHeldOrder(biz: Biz, orderId: number) {
  await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [o] = await tx.update(orders).set({ status: "canceled", updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id), eq(orders.status, "awaiting_payment"), sql`${orders.paymentStatus} <> 'paid'`))
      .returning({ id: orders.id });
    if (o) {
      await recordOrderEvents(tx, biz.id, orderId, { order: ["awaiting_payment", "canceled"] });
      await refundCashback(biz, orderId, tx);
    }
    else {
      const [canceled] = await tx.select({ id: orders.id }).from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id), eq(orders.status, "canceled"))).for("update");
      if (canceled) await refundCashback(biz, orderId, tx);
    }
  });
}

export async function cancelPendingRequests(orderId: number, detail: string) {
  await db.update(posRequests).set({ status: "canceled", detail, updatedAt: new Date() }).where(and(eq(posRequests.orderId, orderId), eq(posRequests.status, "pending")));
}

/** Housekeeping: expire card requests and cancel held orders nobody paid for. */
export async function expireUnpaid() {
  await expirePosRequests();
  // uploaded product images that are no longer used by any product (grace period: 1 day)
  await db.execute(sql`delete from uploads u where u.created_at < now() - interval '1 day' and not exists (select 1 from products p where p.image_url = '/api/files/' || u.id)`);
  const stale = await db.select().from(orders).where(and(eq(orders.status, "awaiting_payment"), lt(orders.createdAt, new Date(Date.now() - HOLD_MS)), sql`${orders.paymentStatus} <> 'paid'`)).limit(200);
  if (!stale.length) return 0;
  const bizs = await db.select().from(businesses).where(inArray(businesses.id, [...new Set(stale.map((s) => s.businessId))]));
  for (const o of stale) { const b = bizs.find((x) => x.id === o.businessId); if (b) await cancelHeldOrder(b, o.id); }
  return stale.length;
}

