import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customerRewardCampaigns, products } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { resolveProductOptionSelection } from "@/lib/product-options";

export const PATCH = withAuth(async (req, auth, { id }) => {
  const campaignId = Number(id);
  if (!Number.isSafeInteger(campaignId) || campaignId < 1) throw new HttpError(400, "شناسهٔ طرح جایزه معتبر نیست");
  const body = await readJson(req);
  if (typeof body.isActive !== "boolean") throw new HttpError(400, "وضعیت فعال‌بودن نامعتبر است");
  const [current] = await db.select().from(customerRewardCampaigns)
    .where(and(eq(customerRewardCampaigns.id, campaignId), eq(customerRewardCampaigns.businessId, auth.business.id))).limit(1);
  if (!current) throw new HttpError(404, "طرح جایزه پیدا نشد");
  if (body.isActive && current.rewardType === "free_item") {
    const [product] = current.productId ? await db.select({ id: products.id, price: products.price, isAvailable: products.isAvailable, sellingMode: products.sellingMode, modifierGroups: products.modifierGroups })
      .from(products).where(and(eq(products.id, current.productId), eq(products.businessId, auth.business.id))).limit(1) : [];
    if (!product || !product.isAvailable || product.price <= 0 || product.sellingMode !== "count") throw new HttpError(409, "برای فعال‌کردن دوباره، محصول جایزه باید موجود، تعدادی و قیمت‌دار باشد");
    try { resolveProductOptionSelection(product.modifierGroups ?? [], []); }
    catch { throw new HttpError(409, "محصول جایزه اکنون گزینهٔ اجباری دارد؛ ابتدا محصول دیگری انتخاب کنید"); }
  }
  const [item] = await db.update(customerRewardCampaigns).set({ isActive: body.isActive })
    .where(and(eq(customerRewardCampaigns.id, campaignId), eq(customerRewardCampaigns.businessId, auth.business.id))).returning();
  if (!item) throw new HttpError(404, "طرح جایزه پیدا نشد");
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });
