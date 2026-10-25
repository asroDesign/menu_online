const DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeIranianDigits(value: unknown) {
  return String(value ?? "").replace(/[۰-۹]/g, (digit) => String(DIGITS.indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function normalizeIranianMobile(value: unknown) {
  const digits = normalizeIranianDigits(value).replace(/\D/g, "");
  const national = digits.startsWith("98") ? `0${digits.slice(2)}` : digits.length === 10 && digits.startsWith("9") ? `0${digits}` : digits;
  return /^09\d{9}$/.test(national) ? national : "";
}

export function normalizeChequeReminderSettings(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const days = Number(raw.daysBefore);
  return {
    enabled: raw.enabled !== false,
    daysBefore: Number.isInteger(days) ? Math.min(30, Math.max(0, days)) : 2,
    smsEnabled: raw.smsEnabled !== false,
    managerPhone: normalizeIranianMobile(raw.managerPhone),
  };
}

export function tehranDayKey(value: Date | string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Calendar day on which the reminder should be sent, using Tehran's local date rather than a 24-hour duration. */
export function chequeReminderSendDate(dueAt: Date | string, daysBefore: number) {
  const key = tehranDayKey(dueAt);
  const days = Number.isInteger(daysBefore) ? Math.min(30, Math.max(0, daysBefore)) : 2;
  if (!key) return "";
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function isChequeReminderDueToday(dueAt: Date | string, daysBefore: number, now: Date | string = new Date()) {
  const today = tehranDayKey(now);
  return !!today && chequeReminderSendDate(dueAt, daysBefore) === today;
}
