import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, customers, productReviews } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { getPublicMenu } from "@/lib/public-menu";
import { publicCustomerId } from "@/lib/public-customer-session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { hasAny } from "@/lib/plans";

type Context = { params: Promise<{ slug: string; id: string }> };

async function productInPublicMenu(slug: string, id: number) {
  const [business] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (!business) throw new HttpError(404, "محصول پیدا نشد");
  const menu = await getPublicMenu(slug);
  if (!menu) throw new HttpError(404, "محصول پیدا نشد");
  const product = menu.products.find((item) => item.id === id);
  if (!product) throw new HttpError(404, "محصول پیدا نشد");
  const features = await featuresOf(business);
  if (!hasAny(features, "loyalty")) throw new HttpError(403, "نظرات محصول در پلن این رستوران فعال نیست");
  return business;
}

export async function GET(_req: Request, { params }: Context) {
  try {
    const { slug, id: rawId } = await params;
    const productId = Number(rawId);
    if (!Number.isSafeInteger(productId) || productId < 1) throw new HttpError(404, "محصول پیدا نشد");
    const business = await productInPublicMenu(slug, productId);
    await enforceRateLimit(_req, "product-review-read", String(business.id), 120, 10 * 60_000, false);
    const where = and(eq(productReviews.businessId, business.id), eq(productReviews.productId, productId), eq(productReviews.status, "approved"));
    const [summary] = await db.select({
      count: sql<number>`count(*)::int`,
      average: sql<number>`coalesce(round(avg(${productReviews.rating})::numeric, 1), 0)::float8`,
    }).from(productReviews).where(where);
    const rows = await db.select({ id: productReviews.id, rating: productReviews.rating, body: productReviews.body, createdAt: productReviews.createdAt })
      .from(productReviews).innerJoin(customers, and(eq(customers.id, productReviews.customerId), eq(customers.businessId, business.id)))
      .where(where).orderBy(desc(productReviews.createdAt), desc(productReviews.id)).limit(50);
    const customerId = await publicCustomerId(slug, business.id);
    const [myReview] = customerId ? await db.select({ status: productReviews.status }).from(productReviews)
      .where(and(eq(productReviews.businessId, business.id), eq(productReviews.productId, productId), eq(productReviews.customerId, customerId))).limit(1) : [];
    return Response.json({ items: rows.map((row) => ({ ...row, customerName: "مشتری" })), summary: { count: Number(summary?.count ?? 0), average: Number(summary?.average ?? 0) }, myReviewStatus: myReview?.status ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const { slug, id: rawId } = await params;
    const productId = Number(rawId);
    if (!Number.isSafeInteger(productId) || productId < 1) throw new HttpError(404, "محصول پیدا نشد");
    const business = await productInPublicMenu(slug, productId);
    const customerId = await publicCustomerId(slug, business.id);
    if (!customerId) throw new HttpError(401, "برای ثبت نظر ابتدا با شمارهٔ موبایل وارد پروفایل شوید");
    await enforceRateLimit(req, "product-review-ip", String(business.id), 30, 60 * 60_000);
    await enforceRateLimit(req, "product-review-customer", `${business.id}:${customerId}`, 5, 24 * 60 * 60_000);
    const body = await readJson(req);
    const rating = Number(body.rating);
    const text = typeof body.body === "string" ? body.body.trim().slice(0, 1000) : "";
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "امتیاز باید بین ۱ تا ۵ باشد");
    if (text.length < 10) throw new HttpError(400, "متن نظر باید حداقل ۱۰ نویسه باشد");
    const [review] = await db.insert(productReviews).values({ businessId: business.id, productId, customerId, rating, body: text })
      .onConflictDoNothing({ target: [productReviews.businessId, productReviews.productId, productReviews.customerId] })
      .returning({ id: productReviews.id });
    if (!review) throw new HttpError(409, "برای این محصول قبلاً نظر ثبت کرده‌اید");
    return Response.json({ item: { id: review.id, status: "pending" }, message: "نظر برای بررسی مدیر ارسال شد" }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
