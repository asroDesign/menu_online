import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { loyaltyWheelPrizes } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { parseWheelPrizeInput } from "@/lib/loyalty-wheel-admin";

export const PATCH = withAuth(async (req, auth, { id }) => {
  const prizeId = Number(id);
  if (!Number.isSafeInteger(prizeId) || prizeId < 1) throw new HttpError(400, "شناسهٔ جایزه معتبر نیست");
  const body = await readJson(req, 12 * 1024);
  if (typeof body.isActive !== "boolean") throw new HttpError(400, "وضعیت جایزه معتبر نیست");
  if (!body.isActive) {
    const [item] = await db.update(loyaltyWheelPrizes).set({ isActive: false })
      .where(and(eq(loyaltyWheelPrizes.id, prizeId), eq(loyaltyWheelPrizes.businessId, auth.business.id))).returning();
    if (!item) throw new HttpError(404, "جایزه پیدا نشد");
    return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
  }
  const values = await parseWheelPrizeInput(body, auth.business.id);
  const [item] = await db.update(loyaltyWheelPrizes).set({ ...values, isActive: body.isActive })
    .where(and(eq(loyaltyWheelPrizes.id, prizeId), eq(loyaltyWheelPrizes.businessId, auth.business.id))).returning();
  if (!item) throw new HttpError(404, "جایزه پیدا نشد");
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });

export const DELETE = withAuth(async (_req, auth, { id }) => {
  const prizeId = Number(id);
  if (!Number.isSafeInteger(prizeId) || prizeId < 1) throw new HttpError(400, "شناسهٔ جایزه معتبر نیست");
  const [item] = await db.delete(loyaltyWheelPrizes)
    .where(and(eq(loyaltyWheelPrizes.id, prizeId), eq(loyaltyWheelPrizes.businessId, auth.business.id))).returning({ id: loyaltyWheelPrizes.id });
  if (!item) throw new HttpError(404, "جایزه پیدا نشد");
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });
