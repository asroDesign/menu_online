export const CHEQUE_STATUSES = ["registered", "passed", "bounced", "returned", "assigned", "voided"] as const;
export type ChequeStatus = typeof CHEQUE_STATUSES[number];
export type ChequeDirection = "payable" | "receivable";
export type ChequeJournalLine = { accountId?: number; code?: string; debit: number; credit: number; description: string };

export function chequeStatusesFor(direction: string): ChequeStatus[] {
  return CHEQUE_STATUSES.filter((status) => status !== "assigned" || direction === "receivable");
}

/** Statuses are intentionally correctable; each correction is journaled by reversing the prior state entry. */
export function isChequeTransitionAllowed(from: string, to: string, direction: string) {
  return chequeStatusesFor(direction).includes(to as ChequeStatus) && CHEQUE_STATUSES.includes(from as ChequeStatus);
}

export function buildChequeRegistrationLines(direction: ChequeDirection, counterAccountId: number, chequeAccountCode: string, amount: number): ChequeJournalLine[] {
  return direction === "receivable"
    ? [
        { code: chequeAccountCode, debit: amount, credit: 0, description: "ثبت چک دریافتنی" },
        { accountId: counterAccountId, debit: 0, credit: amount, description: "حساب طرف چک دریافتنی" },
      ]
    : [
        { accountId: counterAccountId, debit: amount, credit: 0, description: "حساب طرف چک پرداختنی" },
        { code: chequeAccountCode, debit: 0, credit: amount, description: "ثبت چک پرداختنی" },
      ];
}

/** Posting relative to the original registered cheque. Reversing the previous state document before this one keeps corrections balanced. */
export function buildChequeStatusLines(
  direction: ChequeDirection,
  status: ChequeStatus,
  counterAccountId: number,
  chequeAccountCode: string,
  bankAccountCode: string,
  amount: number,
): ChequeJournalLine[] {
  if (status === "registered") return [];
  if (status === "passed") {
    return direction === "receivable"
      ? [
          { code: bankAccountCode, debit: amount, credit: 0, description: "وصول چک به بانک" },
          { code: chequeAccountCode, debit: 0, credit: amount, description: "تسویه اسناد دریافتنی" },
        ]
      : [
          { code: chequeAccountCode, debit: amount, credit: 0, description: "تسویه اسناد پرداختنی" },
          { code: bankAccountCode, debit: 0, credit: amount, description: "پرداخت چک از بانک" },
        ];
  }
  if (status === "assigned") {
    if (direction !== "receivable") throw new Error("صدور چک پرداختنی قابل واگذاری نیست.");
    return [
      { accountId: counterAccountId, debit: amount, credit: 0, description: "واگذاری چک به حساب انتخاب‌شده" },
      { code: chequeAccountCode, debit: 0, credit: amount, description: "خروج چک دریافتنی از اسناد" },
    ];
  }
  // Bounced, returned and voided statuses reverse the original recognition entry.
  return direction === "receivable"
    ? [
        { accountId: counterAccountId, debit: amount, credit: 0, description: "برگشت ثبت چک دریافتنی" },
        { code: chequeAccountCode, debit: 0, credit: amount, description: "حذف چک از اسناد دریافتنی" },
      ]
    : [
        { code: chequeAccountCode, debit: amount, credit: 0, description: "حذف چک از اسناد پرداختنی" },
        { accountId: counterAccountId, debit: 0, credit: amount, description: "برگشت ثبت چک پرداختنی" },
      ];
}
