export type MembershipTierRule = {
  id: string;
  name: string;
  minSpent: number;
  minOrders: number;
  validityDays: number;
  discountPercent: number;
  maxDiscount: number;
  isActive: boolean;
};

export type MembershipTierMetrics = {
  totalSpent: number;
  ordersCount: number;
  lastOrderAt: Date | null;
};

export type MembershipOrderSnapshot = {
  tierId: string;
  tierName: string;
  discountPercent: number;
  maxDiscount: number;
  validityDays: number;
  qualifyingSpent: number;
  qualifyingOrders: number;
  effectiveAt: string;
  expiresAt: string;
};

const normalizeDigits = (value: string) => value
  .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[٬,\s]/g, "");

function integer(value: unknown, field: string, min: number, max: number) {
  if (value === null || value === undefined || value === "") throw new Error(`${field} نامعتبر است`);
  const raw = typeof value === "string" ? normalizeDigits(value) : value;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${field} نامعتبر است`);
  return n;
}

export function parseMembershipTierRules(value: unknown): MembershipTierRule[] {
  if (!Array.isArray(value) || value.length > 10) throw new Error("حداکثر ۱۰ سطح عضویت قابل تعریف است");
  const ids = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("اطلاعات سطح عضویت نامعتبر است");
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim().slice(0, 40) : "";
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 50) : "";
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || ids.has(id)) throw new Error("شناسه سطح عضویت تکراری یا نامعتبر است");
    if (name.length < 2) throw new Error("نام هر سطح عضویت حداقل ۲ نویسه باشد");
    ids.add(id);
    const minSpent = integer(item.minSpent, "حداقل مبلغ خرید", 0, 100_000_000_000);
    const minOrders = integer(item.minOrders, "حداقل تعداد خرید", 0, 1_000_000);
    if (minSpent === 0 && minOrders === 0) throw new Error("برای هر سطح، حداقل مبلغ یا تعداد خرید تعیین کنید");
    return {
      id,
      name,
      minSpent,
      minOrders,
      validityDays: integer(item.validityDays, "مدت اعتبار", 1, 730),
      discountPercent: integer(item.discountPercent, "درصد مزیت", 1, 100),
      maxDiscount: integer(item.maxDiscount ?? 0, "سقف مزیت", 0, 2_147_483_647),
      isActive: item.isActive !== false,
    };
  }).map((tier) => ({ ...tier }));
}

export function membershipDiscountAmount(subtotal: number, tier: MembershipTierRule) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) throw new Error("جمع سفارش نامعتبر است");
  const percentAmount = Math.floor(subtotal * tier.discountPercent / 100);
  return Math.min(subtotal, tier.maxDiscount > 0 ? Math.min(percentAmount, tier.maxDiscount) : percentAmount);
}

export function chooseMembershipTier(
  tiers: MembershipTierRule[],
  metricsByTier: Record<string, MembershipTierMetrics>,
  now: Date,
) {
  for (const tier of tiers) {
    if (!tier.isActive) continue;
    const metrics = metricsByTier[tier.id];
    if (!metrics?.lastOrderAt) continue;
    const spentFits = tier.minSpent === 0 || metrics.totalSpent >= tier.minSpent;
    const ordersFit = tier.minOrders === 0 || metrics.ordersCount >= tier.minOrders;
    const expiresAt = new Date(metrics.lastOrderAt.getTime() + tier.validityDays * 86_400_000);
    if (spentFits && ordersFit && expiresAt.getTime() > now.getTime()) return { tier, metrics, expiresAt };
  }
  return null;
}

export function snapshotMembership(
  tier: MembershipTierRule,
  metrics: MembershipTierMetrics,
  expiresAt: Date,
  now: Date,
): MembershipOrderSnapshot {
  return {
    tierId: tier.id,
    tierName: tier.name,
    discountPercent: tier.discountPercent,
    maxDiscount: tier.maxDiscount,
    validityDays: tier.validityDays,
    qualifyingSpent: metrics.totalSpent,
    qualifyingOrders: metrics.ordersCount,
    effectiveAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
