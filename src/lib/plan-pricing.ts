import { PLANS } from "@/lib/plans";

export type BillingTerm = 1 | 3 | 6 | 12;
export type PriceSettings = {
  price?: number;
  oldPrice?: number;
  monthlyPrice?: number;
  monthlyDiscount?: number;
  threeMonthPrice?: number;
  threeMonthDiscount?: number;
  sixMonthPrice?: number;
  sixMonthDiscount?: number;
  annualDiscount?: number;
};
export const BILLING_TERMS = [1, 3, 6, 12] as const satisfies readonly BillingTerm[];
export const TERM_LABELS: Record<BillingTerm, string> = { 1: "یک‌ماهه", 3: "سه‌ماهه", 6: "شش‌ماهه", 12: "دوازده‌ماهه" };
export const isBillingTerm = (value: unknown): value is BillingTerm => typeof value === "number" && BILLING_TERMS.some((term) => term === value);
const money = (n: number) => Math.max(0, Math.round(n));
const percent = (n: number) => Math.max(0, Math.min(100, n));
export function pricePlan(plan: typeof PLANS[number], values: PriceSettings = {}) {
  // Preserve legacy annual sale prices until an explicit term discount is saved.
  const legacyPrice = values.price ?? plan.price;
  const annualBase = values.annualDiscount !== undefined ? values.oldPrice ?? legacyPrice : Math.max(values.oldPrice ?? plan.oldPrice, legacyPrice);
  const annualDiscount = percent(values.annualDiscount ?? (annualBase ? (1 - legacyPrice / annualBase) * 100 : 0));
  const monthlyPrice = money(values.monthlyPrice ?? legacyPrice / 12);
  const monthlyDiscount = percent(values.monthlyDiscount ?? 0);
  const threeMonthPrice = money(values.threeMonthPrice ?? legacyPrice / 4);
  const threeMonthDiscount = percent(values.threeMonthDiscount ?? 0);
  const sixMonthPrice = money(values.sixMonthPrice ?? legacyPrice / 2);
  const sixMonthDiscount = percent(values.sixMonthDiscount ?? 0);
  const annualTotal = values.annualDiscount === undefined ? money(legacyPrice) : money(annualBase * (1 - annualDiscount / 100));
  const term = (base: number, discount: number) => ({ base, discount, total: money(base * (1 - discount / 100)) });
  return { ...plan, oldPrice: annualBase, price: annualTotal, annualDiscount, monthlyPrice, monthlyDiscount, threeMonthPrice, threeMonthDiscount, sixMonthPrice, sixMonthDiscount,
    terms: {
      1: term(monthlyPrice, monthlyDiscount),
      3: term(threeMonthPrice, threeMonthDiscount),
      6: term(sixMonthPrice, sixMonthDiscount),
      12: { base: annualBase, discount: annualDiscount, total: annualTotal },
    } };
}
export type PricedPlan = ReturnType<typeof pricePlan>;
