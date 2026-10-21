export type RetentionTrigger = "inactive_days" | "segment_enter" | "segment_exit";
export type RetentionSegment = "vip" | "loyal" | "regular" | "new" | "at_risk" | "lost" | "none";

export function normalizeIranMobile(value: string) {
  const digits = value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/\D/g, "");
  const local = digits.startsWith("98") ? `0${digits.slice(2)}` : digits.length === 10 && digits.startsWith("9") ? `0${digits}` : digits;
  return /^09\d{9}$/.test(local) ? local : null;
}

export function segmentTransitionMatches(trigger: "segment_enter" | "segment_exit", target: RetentionSegment, previous: RetentionSegment, next: RetentionSegment) {
  return trigger === "segment_enter" ? previous !== target && next === target : previous === target && next !== target;
}

export type RetentionEligibility = {
  smsOptIn: boolean;
  phone: string;
  lastOrderAt: Date | string | null;
  anchorOrderAt: Date | string | null;
  currentSegment: string;
  expectedSegment: string | null;
  lastMarketingAt: Date | string | null;
  marketingCount30Days: number;
  cooldownDays: number;
  maxMarketingSms30Days: number;
  now?: Date;
};

export function retentionEligibility(input: RetentionEligibility): { eligible: true; phone: string } | { eligible: false; reason: "opt_out" | "invalid_phone" | "purchase_after_trigger" | "segment_changed" | "cooldown" | "frequency_cap" } {
  if (!input.smsOptIn) return { eligible: false, reason: "opt_out" };
  const phone = normalizeIranMobile(input.phone);
  if (!phone) return { eligible: false, reason: "invalid_phone" };
  const currentOrder = input.lastOrderAt ? new Date(input.lastOrderAt).getTime() : null;
  const anchorOrder = input.anchorOrderAt ? new Date(input.anchorOrderAt).getTime() : null;
  if (currentOrder !== anchorOrder) return { eligible: false, reason: "purchase_after_trigger" };
  if (input.expectedSegment && input.currentSegment !== input.expectedSegment) return { eligible: false, reason: "segment_changed" };
  const now = (input.now ?? new Date()).getTime();
  if (input.lastMarketingAt && now - new Date(input.lastMarketingAt).getTime() < input.cooldownDays * 86_400_000) return { eligible: false, reason: "cooldown" };
  if (input.marketingCount30Days >= input.maxMarketingSms30Days) return { eligible: false, reason: "frequency_cap" };
  return { eligible: true, phone };
}
