import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerRewardCampaigns, customerRewardClaims, products } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { resolveProductOptionSelection } from "@/lib/product-options";

export const GET = withAuth(async (_req, auth) => {
  const rows = await db.select().from(customerRewardCampaigns)
    .where(eq(customerRewardCampaigns.businessId, auth.business.id))
    .orderBy(desc(customerRewardCampaigns.createdAt), desc(customerRewardCampaigns.id)).limit(100);
  if (!rows.length) return Response.json({ items: [], businessSlug: auth.business.slug }, { headers: { "Cache-Control": "no-store" } });
  const counts = await db.select({ campaignId: customerRewardClaims.campaignId, count: sql<number>`count(*)::int` })
    .from(customerRewardClaims).where(and(eq(customerRewardClaims.businessId, auth.business.id), inArray(customerRewardClaims.campaignId, rows.map((row) => row.id))))
    .groupBy(customerRewardClaims.campaignId);
  const countByCampaign = new Map(counts.map((row) => [row.campaignId, Number(row.count)]));
  return Response.json({ items: rows.map((row) => ({ ...row, token: row.token, claimCount: countByCampaign.get(row.id) ?? 0 })), businessSlug: auth.business.slug }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const rewardType = body.rewardType;
  const expiresAfterDays = Number(body.expiresAfterDays);
  const maxClaims = Number(body.maxClaims ?? 0);
  if (!name) throw new HttpError(400, "نام جایزه را وارد کنید");
  if (!Number.isInteger(expiresAfterDays) || expiresAfterDays < 1 || expiresAfterDays > 365) throw new HttpError(400, "اعتبار جایزه باید بین ۱ تا ۳۶۵ روز باشد");
  if (!Number.isInteger(maxClaims) || maxClaims < 0 || maxClaims > 1_000_000) throw new HttpError(400, "سقف فعال‌سازی نامعتبر است؛ صفر یعنی بدون سقف");
  if (rewardType !== "discount_percent" && rewardType !== "free_item") throw new HttpError(400, "نوع جایزه معتبر نیست");

  let discountPercent = 0;
  let productId: number | null = null;
  let productName = "";
  if (rewardType === "discount_percent") {
    discountPercent = Number(body.discountPercent);
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100) throw new HttpError(400, "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد");
  } else {
    productId = Number(body.productId);
    if (!Number.isSafeInteger(productId) || productId < 1) throw new HttpError(400, "یک آیتم معتبر از منوی رستوران انتخاب کنید");
    const [product] = await db.select({ id: products.id, name: products.name, price: products.price, sellingMode: products.sellingMode, isAvailable: products.isAvailable, modifierGroups: products.modifierGroups })
      .from(products).where(and(eq(products.id, productId), eq(products.businessId, auth.business.id))).limit(1);
    if (!product || !product.isAvailable || product.price <= 0 || product.sellingMode !== "count") throw new HttpError(400, "آیتم رایگان باید موجود، قیمت‌دار و تعدادی باشد");
    try { resolveProductOptionSelection(product.modifierGroups ?? [], []); }
    catch { throw new HttpError(400, "آیتم جایزه نباید گزینهٔ اجباری داشته باشد؛ محصول دیگری انتخاب کنید"); }
    productName = product.name;
  }

  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(customerRewardCampaigns)
    .where(eq(customerRewardCampaigns.businessId, auth.business.id));
  if (Number(count?.count ?? 0) >= 500) throw new HttpError(409, "برای این کسب‌وکار حداکثر ۵۰۰ طرح جایزه قابل تعریف است");
  const token = randomBytes(24).toString("base64url");
  const [item] = await db.insert(customerRewardCampaigns).values({
    businessId: auth.business.id, name, token, rewardType, discountPercent, productId, productName,
    expiresAfterDays, maxClaims, isActive: true,
  }).returning();
  return Response.json({ item: { ...item, claimCount: 0 }, businessSlug: auth.business.slug }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });
