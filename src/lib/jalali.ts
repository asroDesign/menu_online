import * as j from "jalaali-js";

export const JMONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";
const faDigits = (s: string) => s.replace(/\d/g, (d) => FA[Number(d)]);
const enDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));

const tehranFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });

export function toJ(date: Date | string) {
  const [gy, gm, gd] = tehranFmt.format(new Date(date)).split("-").map(Number);
  const r = j.toJalaali(gy, gm, gd);
  return { jy: r.jy, jm: r.jm, jd: r.jd };
}

/** Date at 12:00 Tehran time */
export function fromJ(jy: number, jm: number, jd: number, hour = 12, min = 0, sec = 0) {
  const g = j.toGregorian(jy, jm, jd);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, hour - 3, min - 30, sec));
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const fmtJ = (date: Date | string, fa = true) => {
  const { jy, jm, jd } = toJ(date);
  const s = `${jy}/${pad2(jm)}/${pad2(jd)}`;
  return fa ? faDigits(s) : s;
};
export const fmtJLong = (date: Date | string) => {
  const { jy, jm, jd } = toJ(date);
  return faDigits(`${jd} ${JMONTHS[jm - 1]} ${jy}`);
};

export function parseJ(text: string): Date | null {
  const m = enDigits(text.trim()).match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!m) return null;
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!j.isValidJalaaliDate(jy, jm, jd)) return null;
  return fromJ(jy, jm, jd);
}

export const jYearRange = (jy: number) => ({
  start: fromJ(jy, 1, 1, 0, 0, 0),
  end: fromJ(jy, 12, j.jalaaliMonthLength(jy, 12), 23, 59, 59),
});
export const jMonthRange = (jy: number, jm: number) => ({ start: fromJ(jy, jm, 1, 0, 0, 0), end: fromJ(jy, jm, j.jalaaliMonthLength(jy, jm), 23, 59, 59) });
export const jMonthLength = j.jalaaliMonthLength;
export const startOfDayTehran = (d: Date | string) => { const { jy, jm, jd } = toJ(d); return fromJ(jy, jm, jd, 0, 0, 0); };
export const endOfDayTehran = (d: Date | string) => { const { jy, jm, jd } = toJ(d); return fromJ(jy, jm, jd, 23, 59, 59); };
