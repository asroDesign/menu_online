export type LoyaltyRewardKind = "discount_percent" | "free_item";

export type CustomerRewardSnapshot = {
  id: number;
  campaignName: string;
  rewardType: LoyaltyRewardKind;
  discountPercent: number;
  productId: number | null;
  productName: string;
  expiresAt: string;
};

export function rewardExpiresAt(now: Date, days: number) {
  const safeDays = Number.isInteger(days) ? Math.min(365, Math.max(1, days)) : 7;
  return new Date(now.getTime() + safeDays * 24 * 60 * 60_000);
}

export function rewardIsExpired(expiresAt: Date | string, now = new Date()) {
  const timestamp = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return !Number.isFinite(timestamp) || timestamp <= now.getTime();
}

export function rewardDiscountAmount(subtotal: number, discountPercent: number) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || !Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100) return 0;
  return Math.min(subtotal, Math.round(subtotal * discountPercent / 100));
}

export function normalizeRewardClaim(row: {
  id: number;
  campaignName: string;
  rewardType: string;
  discountPercent: number;
  productId: number | null;
  productName: string;
  expiresAt: Date | string;
}): CustomerRewardSnapshot | null {
  if (row.rewardType !== "discount_percent" && row.rewardType !== "free_item") return null;
  if (row.rewardType === "discount_percent" && (row.discountPercent < 1 || row.discountPercent > 100)) return null;
  if (row.rewardType === "free_item" && (!row.productId || !row.productName)) return null;
  return {
    id: row.id,
    campaignName: row.campaignName,
    rewardType: row.rewardType,
    discountPercent: row.discountPercent,
    productId: row.productId,
    productName: row.productName,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
  };
}
