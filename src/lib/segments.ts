// Automatic customer classification by purchase frequency, spend and recency (client-safe).
export type SegKey = "vip" | "loyal" | "regular" | "new" | "at_risk" | "lost" | "none";
export type SegCfg = { vipSpent: number; vipOrders: number; loyalSpent: number; loyalOrders: number; atRiskDays: number; lostDays: number };

export const DEFAULT_SEG: SegCfg = { vipSpent: 5_000_000, vipOrders: 8, loyalSpent: 2_000_000, loyalOrders: 4, atRiskDays: 45, lostDays: 90 };

export const SEGMENTS: { key: SegKey; label: string; emoji: string; color: string; desc: string }[] = [
  { key: "vip", label: "ویژه (VIP)", emoji: "👑", color: "amber", desc: "تعداد خرید و مبلغ خرید هر دو بالا، و اخیراً خرید کرده" },
  { key: "loyal", label: "وفادار", emoji: "💎", color: "violet", desc: "خرید مکرر یا مبلغ خرید بالا" },
  { key: "regular", label: "عادی", emoji: "🙂", color: "stone", desc: "چند بار خرید کرده، هنوز به سطح وفادار نرسیده" },
  { key: "new", label: "جدید", emoji: "🌱", color: "emerald", desc: "حداکثر یک خرید و اخیراً" },
  { key: "at_risk", label: "در خطر ریزش", emoji: "⚠️", color: "rose", desc: "بیش از چند هفته از آخرین خریدش گذشته" },
  { key: "lost", label: "ازدست‌رفته", emoji: "💤", color: "blue", desc: "مدت زیادی خرید نکرده" },
  { key: "none", label: "بدون خرید", emoji: "👤", color: "stone", desc: "فقط ثبت‌نام شده" },
];

export const segMeta = (k: string) => SEGMENTS.find((s) => s.key === k) ?? SEGMENTS[2];

export function segmentOf(c: { ordersCount: number; totalSpent: number; lastOrderAt: string | Date | null }, cfg: SegCfg = DEFAULT_SEG, now = Date.now()): SegKey {
  if (c.ordersCount <= 0) return "none";
  const days = c.lastOrderAt ? Math.floor((now - new Date(c.lastOrderAt).getTime()) / 86400_000) : 0;
  if (days >= cfg.lostDays) return "lost";
  if (days >= cfg.atRiskDays && c.ordersCount >= 2) return "at_risk";
  if (c.ordersCount >= cfg.vipOrders && c.totalSpent >= cfg.vipSpent) return "vip";
  if (c.ordersCount >= cfg.loyalOrders || c.totalSpent >= cfg.loyalSpent) return "loyal";
  if (c.ordersCount <= 1) return "new";
  return "regular";
}

export const mergeSeg = (v: Partial<SegCfg> | undefined): SegCfg => ({ ...DEFAULT_SEG, ...(v ?? {}) });
