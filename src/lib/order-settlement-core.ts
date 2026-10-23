import type { CashierDebtInput } from "@/lib/cashier-debt-input";

export type SettlementInput = {
  cashAmount: number;
  bankAmount: number;
  bankAccountId: number | null;
  posAmount: number;
  posDeviceId: number | null;
  posBankAccountId: number | null;
  allowDebt: boolean;
  creditDetails?: CashierDebtInput | null;
  idempotencyKey: string;
  completeOrder?: boolean;
  posRefNo?: string;
};

export type SettlementPlan = SettlementInput & {
  creditAmount: number;
};

export type PaymentBreakdown = {
  idempotencyKey: string;
  cashAmount: number;
  bankAmount: number;
  bankAccountId: number | null;
  bankAccountName: string;
  posAmount: number;
  posDeviceId: number | null;
  posBankAccountId: number | null;
  posBankAccountName: string;
  posDeviceName: string;
  posTerminalNumber: string;
  posRefNo: string;
  creditAmount: number;
  creditCustomerName: string;
  creditCustomerPhone: string;
  settledAt: string;
};

function amount(value: unknown, label: string, total: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > total)
    throw new Error(`${label} باید عدد صحیح و بین صفر تا مبلغ فاکتور باشد`);
  return value;
}

export function normalizeSettlementInput(value: unknown, total: number): SettlementPlan {
  if (!Number.isSafeInteger(total) || total < 1) throw new Error("مبلغ فاکتور برای تسویه معتبر نیست");
  const input = (value ?? {}) as Partial<SettlementInput>;
  const cashAmount = amount(input.cashAmount, "مبلغ نقدی", total);
  const bankAmount = amount(input.bankAmount, "مبلغ بانکی", total);
  const posAmount = amount(input.posAmount, "مبلغ کارتخوان", total);
  const collected = cashAmount + bankAmount + posAmount;
  if (!Number.isSafeInteger(collected) || collected > total) throw new Error("جمع مبالغ دریافتی از مبلغ فاکتور بیشتر است");
  const creditAmount = total - collected;
  const bankAccountId = input.bankAccountId == null ? null : Number(input.bankAccountId);
  const posDeviceId = input.posDeviceId == null ? null : Number(input.posDeviceId);
  const posBankAccountId = input.posBankAccountId == null ? null : Number(input.posBankAccountId);
  if (bankAmount > 0 && (!Number.isSafeInteger(bankAccountId) || bankAccountId! < 1)) throw new Error("حساب بانکی دریافت را انتخاب کنید");
  if (posAmount > 0 && (!Number.isSafeInteger(posDeviceId) || posDeviceId! < 1)) throw new Error("دستگاه کارتخوان را انتخاب کنید");
  if (posAmount > 0 && (!Number.isSafeInteger(posBankAccountId) || posBankAccountId! < 1)) throw new Error("حساب بانکی واریز کارتخوان را انتخاب کنید");
  if (creditAmount > 0 && input.allowDebt !== true) throw new Error("باقی‌ماندهٔ فاکتور باید پرداخت یا در دفتر بدهکاران ثبت شود");
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100) throw new Error("شناسهٔ ثبت پرداخت معتبر نیست");
  return {
    cashAmount,
    bankAmount,
    bankAccountId,
    posAmount,
    posDeviceId,
    posBankAccountId,
    allowDebt: input.allowDebt === true,
    creditAmount,
    creditDetails: input.creditDetails ?? null,
    idempotencyKey,
    completeOrder: input.completeOrder === true,
    posRefNo: typeof input.posRefNo === "string" ? input.posRefNo.slice(0, 40) : undefined,
  };
}

export function settlementMethod(plan: Pick<SettlementPlan, "cashAmount" | "bankAmount" | "posAmount" | "creditAmount">) {
  const methods = [plan.cashAmount > 0, plan.bankAmount > 0, plan.posAmount > 0, plan.creditAmount > 0].filter(Boolean).length;
  if (methods > 1) return "mixed";
  if (plan.posAmount > 0) return "pos";
  if (plan.bankAmount > 0) return "card_to_card";
  if (plan.creditAmount > 0) return "credit";
  return "cash";
}
