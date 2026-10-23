import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, productReviews, products } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";
import { normalizeCustomerRewards } from "@/lib/customer-rewards-core";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, auth) => {
  const requested = new URL(req.url).searchParams.get("status") ?? "pending";
  if (!new Set(["pending", "approved", "rejected", "all"]).has(requested)) throw new HttpError(400, "وضعیت نظر معتبر نیست");
  const filters = [eq(productReviews.businessId, auth.business.id)];
  if (requested !== "all") filters.push(eq(productReviews.status, requested));
  const rows = await db.select({
    id: productReviews.id, productId: productReviews.productId, productName: products.name,
    customerId: productReviews.customerId, customerName: customers.name, customerPhone: customers.phone,
    rating: productReviews.rating, body: productReviews.body, status: productReviews.status,
    awardedPoints: productReviews.awardedPoints, createdAt: productReviews.createdAt,
  }).from(productReviews)
    .innerJoin(products, and(eq(products.id, productReviews.productId), eq(products.businessId, auth.business.id)))
    .innerJoin(customers, and(eq(customers.id, productReviews.customerId), eq(customers.businessId, auth.business.id)))
    .where(and(...filters)).orderBy(desc(productReviews.createdAt), desc(productReviews.id)).limit(100);
  const settings = (auth.business.settings ?? {}) as Record<string, unknown>;
  return Response.json({ items: rows, defaultAwardPoints: normalizeCustomerRewards(settings.customerRewards).reviewPoints }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });
