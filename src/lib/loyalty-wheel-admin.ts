import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { discountCodes, products } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { normalizeAmountInput } from "@/lib/amount-format";
import { LOYALTY_WHEEL_PRIZE_TYPES, type LoyaltyWheelPrizeType } from "@/lib/loyalty-wheel-core";
import { resolveProductOptionSelection } from "@/lib/product-options";

function integer(value: unknown) {
  const normalized = normalizeAmountInput(typeof value === "string" || typeof value === "number" ? value : "");
  return normalized ? Number(normalized) : NaN;
}

export async function parseWheelPrizeInput(value: Record<string, unknown>, businessId: number) {
  const prizeType = value.prizeType;
  if (!LOYALTY_WHEEL_PRIZE_TYPES.includes(prizeType as LoyaltyWheelPrizeType)) throw new HttpError(400, "نوع جایزه معتبر نیست");
  const title = typeof value.title === "string" ? value.title.trim().slice(0, 80) : "";
  if (!title) throw new HttpError(400, "عنوان جایزه را وارد کنید");
  const weight = integer(value.weight);
  if (!Number.isInteger(weight) || weight < 1 || weight > 10_000) throw new HttpError(400, "وزن شانس باید بین ۱ تا ۱۰٬۰۰۰ باشد");

  const result: {
    title: string;
    prizeType: LoyaltyWheelPrizeType;
    amount: number;
    discountCodeId: number | null;
    productIds: number[];
    message: string;
    weight: number;
  } = { title, prizeType: prizeType as LoyaltyWheelPrizeType, amount: 0, discountCodeId: null, productIds: [], message: "", weight };

  if (prizeType === "fixed_amount") {
    result.amount = integer(value.amount);
    if (!Number.isSafeInteger(result.amount) || result.amount < 1 || result.amount > 500_000_000) throw new HttpError(400, "مبلغ جایزه باید بین ۱ تا ۵۰۰ میلیون تومان باشد");
  } else if (prizeType === "discount_code") {
    result.discountCodeId = integer(value.discountCodeId);
    if (!Number.isSafeInteger(result.discountCodeId) || result.discountCodeId < 1) throw new HttpError(400, "کد تخفیف را انتخاب کنید");
    const [coupon] = await db.select({ id: discountCodes.id, isActive: discountCodes.isActive, maxUses: discountCodes.maxUses, usedCount: discountCodes.usedCount, expiresAt: discountCodes.expiresAt })
      .from(discountCodes).where(and(eq(discountCodes.id, result.discountCodeId), eq(discountCodes.businessId, businessId))).limit(1);
    if (!coupon || !coupon.isActive || (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) || (coupon.expiresAt && coupon.expiresAt <= new Date()))
      throw new HttpError(400, "کد تخفیف فعال و دارای ظرفیت را انتخاب کنید");
  } else if (prizeType === "free_items") {
    if (!Array.isArray(value.productIds)) throw new HttpError(400, "یک یا چند محصول رایگان انتخاب کنید");
    const ids = [...new Set(value.productIds.map(integer))];
    if (!ids.length || ids.length > 10 || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new HttpError(400, "یک تا ۱۰ محصول معتبر انتخاب کنید");
    const items = await db.select({ id: products.id, name: products.name, price: products.price, sellingMode: products.sellingMode, isAvailable: products.isAvailable, modifierGroups: products.modifierGroups })
      .from(products).where(and(eq(products.businessId, businessId), inArray(products.id, ids)));
    if (items.length !== ids.length || items.some((item) => !item.isAvailable || item.price <= 0 || item.sellingMode !== "count"))
      throw new HttpError(400, "همهٔ محصولات جایزه باید در منو موجود، قیمت‌دار و تعدادی باشند");
    for (const item of items) {
      try { resolveProductOptionSelection(item.modifierGroups ?? [], []); }
      catch { throw new HttpError(400, `محصول «${item.name}» گزینهٔ اجباری دارد و برای جایزه مناسب نیست`); }
    }
    result.productIds = ids;
  } else if (prizeType === "message") {
    result.message = typeof value.message === "string" ? value.message.trim().slice(0, 300) : "";
    if (!result.message) throw new HttpError(400, "متن پیام جایزه را وارد کنید");
  }
  return result;
}
