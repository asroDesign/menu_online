import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { discountCodes, loyaltyWheelPrizes, loyaltyWheelSettings, products } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { eligibleWheelPrizes } from "@/lib/loyalty-wheel-service";
import { resolveProductOptionSelection } from "@/lib/product-options";

export const GET = withAuth(async (_req, auth) => {
  const [savedSettings] = await db.select().from(loyaltyWheelSettings)
    .where(eq(loyaltyWheelSettings.businessId, auth.business.id)).limit(1);
  const prizes = await db.select().from(loyaltyWheelPrizes)
    .where(eq(loyaltyWheelPrizes.businessId, auth.business.id)).orderBy(desc(loyaltyWheelPrizes.id)).limit(100);
  const eligibleIds = new Set((await eligibleWheelPrizes(auth.business.id)).map(({ prize }) => prize.id));
  const productRows = await db.select({ id: products.id, name: products.name, price: products.price, sellingMode: products.sellingMode, isAvailable: products.isAvailable, modifierGroups: products.modifierGroups })
    .from(products).where(and(eq(products.businessId, auth.business.id), eq(products.isAvailable, true))).orderBy(products.name).limit(1000);
  const availableProducts = productRows.filter((product) => {
    if (product.price <= 0 || product.sellingMode !== "count") return false;
    try { resolveProductOptionSelection(product.modifierGroups ?? [], []); return true; }
    catch { return false; }
  }).map(({ id, name, price }) => ({ id, name, price }));
  const now = new Date();
  const coupons = await db.select({ id: discountCodes.id, code: discountCodes.code, type: discountCodes.type, value: discountCodes.value, minOrder: discountCodes.minOrder, maxUses: discountCodes.maxUses, usedCount: discountCodes.usedCount, expiresAt: discountCodes.expiresAt })
    .from(discountCodes).where(and(eq(discountCodes.businessId, auth.business.id), eq(discountCodes.isActive, true))).orderBy(desc(discountCodes.id)).limit(500);
  const availableDiscountCodes = coupons.filter((coupon) => !(coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) && !(coupon.expiresAt && coupon.expiresAt <= now))
    .map(({ id, code, type, value, minOrder }) => ({ id, code, type, value, minOrder }));

  return Response.json({
    settings: savedSettings ?? { businessId: auth.business.id, isEnabled: false, cooldownHours: 24, rewardExpiresAfterDays: 30 },
    prizes: prizes.map((prize) => ({ ...prize, dependencyAvailable: eligibleIds.has(prize.id) })),
    products: availableProducts,
    discountCodes: availableDiscountCodes,
    eligiblePrizeCount: eligibleIds.size,
  }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });

export const PATCH = withAuth(async (req, auth) => {
  const body = await readJson(req, 4 * 1024);
  if (typeof body.isEnabled !== "boolean") throw new HttpError(400, "وضعیت گردونه معتبر نیست");
  const cooldownHours = Number(body.cooldownHours);
  const rewardExpiresAfterDays = Number(body.rewardExpiresAfterDays);
  if (!Number.isInteger(cooldownHours) || cooldownHours < 1 || cooldownHours > 720) throw new HttpError(400, "فاصلهٔ چرخش باید بین ۱ تا ۷۲۰ ساعت باشد");
  if (!Number.isInteger(rewardExpiresAfterDays) || rewardExpiresAfterDays < 1 || rewardExpiresAfterDays > 365) throw new HttpError(400, "اعتبار جایزه باید بین ۱ تا ۳۶۵ روز باشد");
  if (body.isEnabled && !(await eligibleWheelPrizes(auth.business.id)).length) throw new HttpError(409, "برای فعال‌کردن گردونه ابتدا دست‌کم یک جایزهٔ معتبر و فعال بسازید");
  const [settings] = await db.insert(loyaltyWheelSettings).values({
    businessId: auth.business.id, isEnabled: body.isEnabled, cooldownHours, rewardExpiresAfterDays, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: loyaltyWheelSettings.businessId,
    set: { isEnabled: body.isEnabled, cooldownHours, rewardExpiresAfterDays, updatedAt: new Date() },
  }).returning();
  return Response.json({ settings }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });
