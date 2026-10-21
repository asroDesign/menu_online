import { endOfDayTehran, startOfDayTehran } from "@/lib/jalali";

const DAY = 86_400_000;

function parseCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function parseSalesReportRange(params: URLSearchParams, now = new Date()) {
  const fromValue = (params.get("from") ?? "").trim();
  const toValue = (params.get("to") ?? "").trim();
  if (!!fromValue !== !!toValue) throw new RangeError("تاریخ شروع و پایان را هر دو انتخاب کنید");
  if (!fromValue) {
    const rawDays = Number(params.get("days"));
    const days = Math.min(365, Math.max(1, Number.isSafeInteger(rawDays) && rawDays > 0 ? rawDays : 14));
    return { from: new Date(now.getTime() - days * DAY), to: now, days, custom: false };
  }
  const fromDate = parseCalendarDate(fromValue);
  const toDate = parseCalendarDate(toValue);
  if (!fromDate || !toDate) throw new RangeError("تاریخ بازه معتبر نیست");
  const calendarDays = Math.floor((Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()) - Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate())) / DAY) + 1;
  if (calendarDays < 1) throw new RangeError("تاریخ پایان باید پس از تاریخ شروع باشد");
  if (calendarDays > 366) throw new RangeError("بازهٔ گزارش نمی‌تواند بیشتر از ۳۶۶ روز باشد");
  return { from: startOfDayTehran(fromDate), to: new Date(endOfDayTehran(toDate).getTime() + 999), days: calendarDays, custom: true };
}

export function reportCalendarKeys(range: { from: Date; days: number }, dayKey: (date: Date) => string) {
  return Array.from({ length: range.days }, (_, index) => dayKey(new Date(range.from.getTime() + index * DAY)));
}
