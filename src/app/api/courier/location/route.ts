import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courierLocations, orders } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { myCourier } from "@/lib/courier";
import { enforceRateLimit } from "@/lib/rate-limit";

export const POST = withAuth(async (req, auth) => {
  const me = await myCourier(auth);
  await enforceRateLimit(req, "courier-location", String(me.id), 30, 60_000);
  if (me.status === "off") throw new HttpError(409, "برای اشتراک موقعیت باید در شیفت باشید.");
  const body = await readJson(req, 2 * 1024);
  const latitude = Number(body.latitude), longitude = Number(body.longitude), accuracyMeters = Number(body.accuracyMeters);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 10_000)
    throw new HttpError(400, "مختصات موقعیت معتبر نیست.");
  const active = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.businessId, auth.business.id), eq(orders.courierId, me.id), inArray(orders.deliveryStatus, ["assigned", "picked_up"]))).limit(1);
  if (!active.length) throw new HttpError(409, "برای حفظ حریم خصوصی، موقعیت فقط هنگام داشتن سفارش فعال ذخیره می‌شود.");
  const now = new Date();
  const [location] = await db.insert(courierLocations).values({ businessId: auth.business.id, courierId: me.id, latitude, longitude, accuracyMeters, updatedAt: now })
    .onConflictDoUpdate({ target: [courierLocations.businessId, courierLocations.courierId], set: { latitude, longitude, accuracyMeters, updatedAt: now } }).returning({ updatedAt: courierLocations.updatedAt });
  return Response.json({ ok: true, updatedAt: location.updatedAt }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "courier", courierOk: true });

export const DELETE = withAuth(async (_req, auth) => {
  const me = await myCourier(auth);
  await db.delete(courierLocations).where(and(eq(courierLocations.businessId, auth.business.id), eq(courierLocations.courierId, me.id)));
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "courier", courierOk: true });
