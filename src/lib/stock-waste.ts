export const WASTE_REASONS = [
  { key: "spoilage", label: "خرابی یا فساد مواد" },
  { key: "expired", label: "انقضا یا پایان مهلت مصرف" },
  { key: "prep_loss", label: "پرت آماده‌سازی یا پخت" },
  { key: "quality", label: "افت کیفیت یا آلودگی" },
  { key: "damaged", label: "آسیب‌دیدگی یا شکستگی" },
  { key: "other", label: "سایر" },
] as const;

export type WasteReason = (typeof WASTE_REASONS)[number]["key"];

export function isWasteReason(value: unknown): value is WasteReason {
  return typeof value === "string" && WASTE_REASONS.some((reason) => reason.key === value);
}

export function wasteReasonLabel(value: string | null | undefined) {
  return WASTE_REASONS.find((reason) => reason.key === value)?.label ?? "سایر / ثبت قدیمی";
}
