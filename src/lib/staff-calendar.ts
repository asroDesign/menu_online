import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

const monthNames = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

export type StaffCalendarDay = { number: number; dateKey: string };
export type StaffCalendarMonth = {
  jy: number;
  jm: number;
  monthDays: number;
  rows: (StaffCalendarDay | null)[][];
  label: string;
};

function toGregorianKey(jy: number, jm: number, jd: number) {
  const date = toGregorian(jy, jm, jd);
  return `${date.gy}-${String(date.gm).padStart(2, "0")}-${String(date.gd).padStart(2, "0")}`;
}

export function tehranDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function jalaliMonthStart(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const { jy, jm } = toJalaali(year, month, day);
  return toGregorianKey(jy, jm, 1);
}

export function nextJalaliMonthStart(monthStart: string) {
  const [year, month, day] = monthStart.split("-").map(Number);
  const { jy, jm } = toJalaali(year, month, day);
  return jm === 12 ? toGregorianKey(jy + 1, 1, 1) : toGregorianKey(jy, jm + 1, 1);
}

export function shiftJalaliMonth(monthStart: string, offset: number) {
  const [year, month, day] = monthStart.split("-").map(Number);
  const { jy, jm } = toJalaali(year, month, day);
  const index = jy * 12 + jm - 1 + offset;
  const nextYear = Math.floor(index / 12);
  const nextMonth = ((index % 12) + 12) % 12 + 1;
  return toGregorianKey(nextYear, nextMonth, 1);
}

export function buildStaffCalendarMonth(monthStart: string): StaffCalendarMonth {
  const [year, month, day] = monthStart.split("-").map(Number);
  const { jy, jm } = toJalaali(year, month, day);
  const monthDays = jalaaliMonthLength(jy, jm);
  // UTC avoids browser timezone differences; Sunday=0 becomes Saturday-first offset.
  const startWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const offset = (startWeekday + 1) % 7;
  const cellCount = Math.ceil((offset + monthDays) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const number = index - offset + 1;
    return number < 1 || number > monthDays ? null : { number, dateKey: toGregorianKey(jy, jm, number) };
  });
  const rows = Array.from({ length: cellCount / 7 }, (_, index) => cells.slice(index * 7, (index + 1) * 7));
  return { jy, jm, monthDays, rows, label: `${monthNames[jm - 1]} ${jy.toLocaleString("fa-IR", { useGrouping: false })}` };
}
