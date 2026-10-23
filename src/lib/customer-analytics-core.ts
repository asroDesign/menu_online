const TEHRAN_OFFSET = "+03:30";

function tehranYearMonth(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function monthKey(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function customerAnalyticsWindow(now: Date, months: number) {
  if (![3, 6, 12].includes(months)) throw new Error("بازهٔ تحلیل مشتری معتبر نیست");
  const current = tehranYearMonth(now);
  const startIndex = current.month - 1 - (months - 1);
  const start = new Date(Date.UTC(current.year, startIndex, 1));
  const next = new Date(Date.UTC(current.year, current.month, 1));
  const startAt = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00${TEHRAN_OFFSET}`;
  const endAt = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00${TEHRAN_OFFSET}`;
  const monthKeys = Array.from({ length: months }, (_, index) => monthKey(start.getUTCFullYear(), start.getUTCMonth() + index));
  return { startAt: new Date(startAt), endAt: new Date(endAt), monthKeys };
}

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, "").toUpperCase();
  if (!normalized) return "";
  return /^[A-Z0-9-]{4,32}$/.test(normalized) ? normalized : null;
}

export function canAttachReferral(input: {
  customerId: number;
  referrerId: number;
  currentReferrerId: number | null;
  hasPaidOrders: boolean;
}) {
  return input.customerId !== input.referrerId && input.currentReferrerId === null && !input.hasPaidOrders;
}
