import { createHash } from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { businesses, courierLocations, orderStatusEvents, orders } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const NOT_FOUND = "لینک رهگیری معتبر نیست یا دیگر در دسترس نیست";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

async function statusResponse(req: Request, slug: string, token: string) {
  await enforceRateLimit(req, "public-order-track-global", slug, 500, 60_000, false);
  if (!tokenPattern.test(token)) throw new HttpError(404, NOT_FOUND);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await enforceRateLimit(req, "public-order-track-token", tokenHash, 12, 60_000, false);
  const [business] = await db.select({ id: businesses.id, isSuspended: businesses.isSuspended }).from(businesses).where(eq(businesses.slug, slug));
  if (!business || business.isSuspended) throw new HttpError(404, NOT_FOUND);
  const [order] = await db.select({
    id: orders.id,
    number: orders.number,
    status: orders.status,
    paymentStatus: orders.paymentStatus,
    courierId: orders.courierId,
    deliveryStatus: orders.deliveryStatus,
    createdAt: orders.createdAt,
    updatedAt: orders.updatedAt,
  }).from(orders).where(and(
    eq(orders.businessId, business.id), eq(orders.trackingTokenHash, tokenHash), isNull(orders.deletedAt),
    isNull(orders.trackingRevokedAt), gt(orders.trackingExpiresAt, new Date()),
  ));
  if (!order) throw new HttpError(404, NOT_FOUND);
  const [history, courierLocation] = await Promise.all([
    db.select({ kind: orderStatusEvents.kind, value: orderStatusEvents.toValue, updatedAt: orderStatusEvents.createdAt })
      .from(orderStatusEvents).where(and(eq(orderStatusEvents.businessId, business.id), eq(orderStatusEvents.orderId, order.id))).orderBy(asc(orderStatusEvents.createdAt)).limit(40),
    order.courierId && ["assigned", "picked_up"].includes(order.deliveryStatus)
      ? db.select({ latitude: courierLocations.latitude, longitude: courierLocations.longitude, accuracyMeters: courierLocations.accuracyMeters, updatedAt: courierLocations.updatedAt })
        .from(courierLocations).where(and(eq(courierLocations.businessId, business.id), eq(courierLocations.courierId, order.courierId), gt(courierLocations.updatedAt, new Date(Date.now() - 3 * 60_000))))
      : Promise.resolve([]),
  ]);
  const statuses = new Set(["awaiting_payment", "pending", "preparing", "ready", "served", "paid", "canceled"]);
  const paymentStatuses = new Set(["unpaid", "pending", "paid", "failed", "refunded"]);
  const deliveryStatuses = new Set(["none", "assigned", "picked_up", "delivered", "not_home", "failed"]);
  return Response.json({
    orderNumber: order.number,
    status: statuses.has(order.status) ? order.status : "pending",
    paymentStatus: paymentStatuses.has(order.paymentStatus) ? order.paymentStatus : "unpaid",
    deliveryStatus: deliveryStatuses.has(order.deliveryStatus) ? order.deliveryStatus : "none",
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    history: history.filter((event) => ["order", "payment", "delivery"].includes(event.kind)).map((event) => ({ kind: event.kind, value: event.value, updatedAt: event.updatedAt.toISOString() })),
    courierLocation: courierLocation[0] ? { latitude: courierLocation[0].latitude, longitude: courierLocation[0].longitude, accuracyMeters: courierLocation[0].accuracyMeters, updatedAt: courierLocation[0].updatedAt.toISOString() } : null,
  }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
    return await statusResponse(req, slug, token);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Compatibility for previously opened tracking pages; new clients use an Authorization header. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const body = await readJson(req, 4 * 1024);
    return await statusResponse(req, slug, typeof body.token === "string" ? body.token : "");
  } catch (error) {
    return errorResponse(error);
  }
}
