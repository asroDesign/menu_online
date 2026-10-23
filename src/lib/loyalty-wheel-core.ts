export const LOYALTY_WHEEL_PRIZE_TYPES = ["fixed_amount", "discount_code", "free_items", "no_prize", "message"] as const;
export type LoyaltyWheelPrizeType = (typeof LOYALTY_WHEEL_PRIZE_TYPES)[number];

export type LoyaltyWheelProductSnapshot = { id: number; name: string; price: number };
export type LoyaltyWheelRewardSnapshot = {
  amount?: number;
  discountCodeId?: number;
  discountCode?: string;
  discountType?: "percent" | "fixed";
  discountValue?: number;
  minOrder?: number;
  products?: LoyaltyWheelProductSnapshot[];
  message?: string;
};
export type LoyaltyWheelSegment = { id: number; title: string; prizeType: LoyaltyWheelPrizeType; weight: number };
export type ActiveLoyaltyWheelReward = {
  id: number;
  prizeType: "fixed_amount" | "discount_code" | "free_items";
  title: string;
  snapshot: LoyaltyWheelRewardSnapshot;
  expiresAt: string;
};

export function weightedWheelPrizeIndex(prizes: { weight: number }[], roll: number) {
  const totalWeight = prizes.reduce((sum, prize) => sum + prize.weight, 0);
  if (!prizes.length || !Number.isSafeInteger(totalWeight) || totalWeight < 1) throw new Error("گردونه جایزهٔ فعالی ندارد");
  if (!Number.isSafeInteger(roll) || roll < 0 || roll >= totalWeight) throw new RangeError("عدد تصادفی گردونه خارج از بازه است");
  let cursor = roll;
  for (let index = 0; index < prizes.length; index++) {
    cursor -= prizes[index].weight;
    if (cursor < 0) return index;
  }
  throw new RangeError("وزن جایزه‌های گردونه معتبر نیست");
}
