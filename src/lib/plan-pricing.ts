import { PLANS } from "@/lib/plans";

export type BillingTerm = 6 | 12;
export type PriceSettings = { price?: number; oldPrice?: number; sixMonthPrice?: number; sixMonthDiscount?: number; annualDiscount?: number };
export const TERM_LABELS = { 6: "شش‌ماهه", 12: "سالانه" } as const;
const money = (n: number) => Math.max(0, Math.round(n));
const percent = (n: number) => Math.max(0, Math.min(100, n));
export function pricePlan(plan: typeof PLANS[number], values: PriceSettings = {}) {
  // Preserve legacy annual sale prices until an explicit term discount is saved.
  const legacyPrice = values.price ?? plan.price;
  const annualBase = values.annualDiscount !== undefined ? values.oldPrice ?? legacyPrice : Math.max(values.oldPrice ?? plan.oldPrice, legacyPrice);
  const annualDiscount = percent(values.annualDiscount ?? (annualBase ? (1 - legacyPrice / annualBase) * 100 : 0));
  const sixMonthPrice = money(values.sixMonthPrice ?? legacyPrice / 2);
  const sixMonthDiscount = percent(values.sixMonthDiscount ?? 0);
  const annualTotal = values.annualDiscount === undefined ? money(legacyPrice) : money(annualBase * (1 - annualDiscount / 100));
  return { ...plan, oldPrice: annualBase, price: annualTotal, annualDiscount, sixMonthPrice, sixMonthDiscount,
    terms: { 6: { base: sixMonthPrice, discount: sixMonthDiscount, total: money(sixMonthPrice * (1 - sixMonthDiscount / 100)) }, 12: { base: annualBase, discount: annualDiscount, total: annualTotal } } };
}
export type PricedPlan = ReturnType<typeof pricePlan>;
