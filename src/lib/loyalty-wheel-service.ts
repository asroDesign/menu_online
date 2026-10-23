import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { discountCodes, loyaltyWheelPrizes, products } from "@/db/schema";
import type { OrderTransaction } from "@/lib/orders";
import { resolveProductOptionSelection } from "@/lib/product-options";
import type { LoyaltyWheelRewardSnapshot, LoyaltyWheelSegment } from "@/lib/loyalty-wheel-core";

export type EligibleWheelPrize = {
  prize: typeof loyaltyWheelPrizes.$inferSelect;
  segment: LoyaltyWheelSegment;
  snapshot: LoyaltyWheelRewardSnapshot;
};

export async function eligibleWheelPrizes(businessId: number, executor: OrderTransaction = db): Promise<EligibleWheelPrize[]> {
  const now = new Date();
  const rows = await executor.select().from(loyaltyWheelPrizes)
    .where(and(eq(loyaltyWheelPrizes.businessId, businessId), eq(loyaltyWheelPrizes.isActive, true)))
    .orderBy(loyaltyWheelPrizes.id);
  const eligible: EligibleWheelPrize[] = [];

  for (const prize of rows) {
    let snapshot: LoyaltyWheelRewardSnapshot = {};
    if (prize.prizeType === "fixed_amount") {
      snapshot = { amount: prize.amount };
    } else if (prize.prizeType === "discount_code") {
      const [coupon] = prize.discountCodeId ? await executor.select().from(discountCodes).where(and(
        eq(discountCodes.id, prize.discountCodeId), eq(discountCodes.businessId, businessId), eq(discountCodes.isActive, true),
      )).limit(1) : [];
      if (!coupon || (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) || (coupon.expiresAt && coupon.expiresAt <= now)) continue;
      snapshot = {
        discountCodeId: coupon.id,
        discountCode: coupon.code,
        discountType: coupon.type === "fixed" ? "fixed" : "percent",
        discountValue: coupon.value,
        minOrder: coupon.minOrder,
      };
    } else if (prize.prizeType === "free_items") {
      const ids = [...new Set((Array.isArray(prize.productIds) ? prize.productIds : []).map(Number))];
      if (!ids.length || ids.length > 10) continue;
      const items = await executor.select({ id: products.id, name: products.name, price: products.price, sellingMode: products.sellingMode, isAvailable: products.isAvailable, modifierGroups: products.modifierGroups })
        .from(products).where(and(eq(products.businessId, businessId), inArray(products.id, ids)));
      if (items.length !== ids.length || items.some((item) => !item.isAvailable || item.price <= 0 || item.sellingMode !== "count")) continue;
      let invalidModifiers = false;
      for (const item of items) {
        try { resolveProductOptionSelection(item.modifierGroups ?? [], []); }
        catch { invalidModifiers = true; break; }
      }
      if (invalidModifiers) continue;
      snapshot = { products: ids.map((id) => {
        const item = items.find((candidate) => candidate.id === id)!;
        return { id: item.id, name: item.name, price: item.price };
      }) };
    } else if (prize.prizeType === "message") {
      snapshot = { message: prize.message };
    } else if (prize.prizeType !== "no_prize") {
      continue;
    }
    eligible.push({
      prize,
      segment: { id: prize.id, title: prize.title, prizeType: prize.prizeType as LoyaltyWheelSegment["prizeType"], weight: prize.weight },
      snapshot,
    });
  }
  return eligible;
}
