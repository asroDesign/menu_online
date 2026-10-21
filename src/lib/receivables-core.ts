export type ReceivableState = "open" | "partial" | "overdue" | "settled";

export function validMoneyAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 9_000_000_000_000_000;
}

export function outstandingAmount(amount: number, received: number) {
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(received) || amount < 0 || received < 0)
    throw new RangeError("Invalid receivable balance");
  return Math.max(0, amount - received);
}

export function paymentFitsBalance(amount: number, received: number, payment: number) {
  return validMoneyAmount(payment) && payment <= outstandingAmount(amount, received);
}

export function receivableState(amount: number, received: number, dueAt: Date | null, now = new Date()): ReceivableState {
  const balance = outstandingAmount(amount, received);
  if (balance === 0) return "settled";
  if (dueAt && dueAt.getTime() < now.getTime()) return "overdue";
  return received > 0 ? "partial" : "open";
}
