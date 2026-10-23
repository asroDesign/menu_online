export type CustomerRewardSettings = {
  pointValueToman: number;
  reviewPoints: number;
  referralMode: "fixed" | "purchase_based";
  referralFixedPoints: number;
  referralStepToman: number;
  referralPointsPerStep: number;
};

export const DEFAULT_CUSTOMER_REWARDS: CustomerRewardSettings = {
  pointValueToman: 0,
  reviewPoints: 0,
  referralMode: "fixed",
  referralFixedPoints: 0,
  referralStepToman: 100_000,
  referralPointsPerStep: 10,
};

const whole = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
};

export function normalizeCustomerRewards(value: unknown): CustomerRewardSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    pointValueToman: whole(raw.pointValueToman, DEFAULT_CUSTOMER_REWARDS.pointValueToman, 0, 1_000_000),
    reviewPoints: whole(raw.reviewPoints, DEFAULT_CUSTOMER_REWARDS.reviewPoints, 0, 100_000),
    referralMode: raw.referralMode === "purchase_based" ? "purchase_based" : "fixed",
    referralFixedPoints: whole(raw.referralFixedPoints, DEFAULT_CUSTOMER_REWARDS.referralFixedPoints, 0, 100_000),
    referralStepToman: whole(raw.referralStepToman, DEFAULT_CUSTOMER_REWARDS.referralStepToman, 1_000, 1_000_000_000),
    referralPointsPerStep: whole(raw.referralPointsPerStep, DEFAULT_CUSTOMER_REWARDS.referralPointsPerStep, 0, 100_000),
  };
}

export function referralRewardPoints(paidAmountToman: number, settings: CustomerRewardSettings) {
  if (!Number.isSafeInteger(paidAmountToman) || paidAmountToman <= 0) return 0;
  if (settings.referralMode === "fixed") return settings.referralFixedPoints;
  return Math.min(100_000_000, Math.floor(paidAmountToman / settings.referralStepToman) * settings.referralPointsPerStep);
}

export function pointValueToman(points: number, settings: CustomerRewardSettings) {
  if (!Number.isSafeInteger(points) || points <= 0 || settings.pointValueToman <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, points * settings.pointValueToman);
}
