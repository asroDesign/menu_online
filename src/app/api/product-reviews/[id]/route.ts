import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { productReviews } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { addCustomerPoints } from "@/lib/customer-points";

export const PATCH = withAuth(async (req, auth, { id }) => {
  const reviewId = Number(id);
  if (!Number.isSafeInteger(reviewId) || reviewId < 1) throw new HttpError(400, "شناسهٔ نظر معتبر نیست");
  const body = await readJson(req);
  const status = body.status;
  const awardPoints = body.awardPoints === undefined ? 0 : Number(body.awardPoints);
  if (status !== "approved" && status !== "rejected") throw new HttpError(400, "تصمیم تأیید یا رد نظر را انتخاب کنید");
  if (!Number.isSafeInteger(awardPoints) || awardPoints < 0 || awardPoints > 100_000 || (status === "rejected" && awardPoints > 0))
    throw new HttpError(400, "امتیاز هدیه باید بین صفر تا ۱۰۰٬۰۰۰ و فقط هنگام تأیید باشد");

  const item = await db.transaction(async (tx) => {
    const [review] = await tx.select().from(productReviews)
      .where(and(eq(productReviews.id, reviewId), eq(productReviews.businessId, auth.business.id))).for("update").limit(1);
    if (!review) throw new HttpError(404, "نظر محصول پیدا نشد");
    if (review.status !== "pending") throw new HttpError(409, "این نظر قبلاً تعیین‌تکلیف شده است");
    const [updated] = await tx.update(productReviews).set({
      status,
      awardedPoints: status === "approved" ? awardPoints : 0,
      moderatedBy: auth.user.id,
      moderatedAt: new Date(),
    }).where(and(eq(productReviews.id, review.id), eq(productReviews.businessId, auth.business.id), eq(productReviews.status, "pending"))).returning();
    if (!updated) throw new HttpError(409, "وضعیت نظر هم‌زمان تغییر کرده است؛ فهرست را تازه کنید");
    if (status === "approved" && awardPoints > 0) await addCustomerPoints(tx as unknown as typeof db, {
      businessId: auth.business.id,
      customerId: review.customerId,
      reviewId: review.id,
      amount: awardPoints,
      kind: "review",
      idempotencyKey: `product-review:${review.id}:award`,
      note: `امتیاز هدیه برای نظر محصول #${review.id}`,
    });
    return updated;
  });
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });
