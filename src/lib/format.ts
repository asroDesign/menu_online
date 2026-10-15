const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export const toFa = (v: string | number) => String(v).replace(/\d/g, (d) => FA[Number(d)]);

export const formatNumber = (n: number) =>
  toFa(Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬"));

export const formatPrice = (n: number) => `${formatNumber(n)} تومان`;

/** Compact price: 1٫250 هزار / میلیون */
export function formatCompact(n: number) {
  if (n >= 1_000_000) return `${toFa((n / 1_000_000).toFixed(1).replace(/\.0$/, "").replace(".", "٫"))} میلیون`;
  if (n >= 1_000) return `${toFa(Math.round(n / 1_000))} هزار`;
  return toFa(n);
}

const dateFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  hour: "2-digit",
  minute: "2-digit",
});
const shortFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "Asia/Tehran",
  month: "short",
  day: "numeric",
});
const weekdayFmt = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", weekday: "short" });

export const formatDate = (d: string | Date) => dateFmt.format(new Date(d));
export const formatTime = (d: string | Date) => timeFmt.format(new Date(d));
export const formatShortDate = (d: string | Date) => shortFmt.format(new Date(d));
export const formatWeekday = (d: string | Date) => weekdayFmt.format(new Date(d));

export function timeAgo(d: string | Date) {
  const diff = Math.max(0, Date.now() - new Date(d).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "همین الان";
  if (m < 60) return `${toFa(m)} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${toFa(h)} ساعت پیش`;
  return `${toFa(Math.floor(h / 24))} روز پیش`;
}

export const ORDER_STATUSES = [
  { key: "awaiting_payment", label: "در انتظار پرداخت", short: "پرداخت‌نشده", color: "stone", next: null, nextLabel: "" },
  { key: "pending", label: "در انتظار تأیید", short: "جدید", color: "amber", next: "preparing", nextLabel: "شروع آماده‌سازی" },
  { key: "preparing", label: "در حال آماده‌سازی", short: "آماده‌سازی", color: "blue", next: "ready", nextLabel: "آماده سرو" },
  { key: "ready", label: "آماده سرو", short: "آماده", color: "violet", next: "served", nextLabel: "سرو شد" },
  { key: "served", label: "سرو شده", short: "سرو شده", color: "teal", next: "paid", nextLabel: "ثبت پرداخت" },
  { key: "paid", label: "پرداخت شده", short: "پرداخت", color: "emerald", next: null, nextLabel: "" },
  { key: "canceled", label: "لغو شده", short: "لغو", color: "rose", next: null, nextLabel: "" },
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number]["key"];
export const statusInfo = (key: string) =>
  ORDER_STATUSES.find((s) => s.key === key) ?? ORDER_STATUSES[1];

export const ACTIVE_STATUSES = ["awaiting_payment", "pending", "preparing", "ready", "served"];

export { STAFF_ROLE_LABELS as STAFF_ROLES } from "@/lib/roles";

const ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUND = ["", "یکصد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
const SCALES = ["", " هزار", " میلیون", " میلیارد", " تریلیون"];
function below1000(n: number) {
  const parts: string[] = [];
  if (n >= 100) parts.push(HUND[Math.floor(n / 100)]);
  const r = n % 100;
  if (r > 0) {
    if (r < 20) parts.push(ONES[r]);
    else parts.push(TENS[Math.floor(r / 10)] + (r % 10 ? " و " + ONES[r % 10] : ""));
  }
  return parts.join(" و ");
}
/** Persian amount in words, e.g. 1250000 → «یک میلیون و دویست و پنجاه هزار» */
export function amountInWords(n: number) {
  n = Math.round(Math.abs(n));
  if (n === 0) return "صفر";
  const groups: string[] = [];
  let i = 0;
  while (n > 0) {
    const g = n % 1000;
    if (g) groups.unshift(below1000(g) + SCALES[i]);
    n = Math.floor(n / 1000);
    i++;
  }
  return groups.join(" و ");
}

export const SOURCES: Record<string, string> = {
  waiter: "گارسون",
  customer: "مشتری (QR)",
  kiosk: "کیوسک",
  cashier: "صندوق",
};
