import { HttpError, withAuth } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { endOfDayTehran, startOfDayTehran } from "@/lib/jalali";
import { listReceivables } from "@/lib/receivables";

export const GET = withAuth(async (req, auth) => {
  const url = new URL(req.url);
  const parse = (raw: string | null, end: boolean) => {
    if (!raw) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new HttpError(400, "تاریخ فیلتر معتبر نیست");
    const date = new Date(`${raw}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new HttpError(400, "تاریخ فیلتر معتبر نیست");
    return end ? endOfDayTehran(date) : startOfDayTehran(date);
  };
  const from = parse(url.searchParams.get("from"), false);
  const to = parse(url.searchParams.get("to"), true);
  if (from && to && from > to) throw new HttpError(400, "ابتدای بازه باید پیش از انتهای آن باشد");
  if (from && to && to.getTime() - from.getTime() > 5 * 366 * 86_400_000) throw new HttpError(400, "بازهٔ خروجی حداکثر پنج سال است");
  const rows = await listReceivables(auth.business.id, undefined, { from, to });
  if (rows.length >= 500) throw new HttpError(413, "خروجی به سقف ۵۰۰ ردیف رسیده است؛ بازه را کوچک‌تر کنید");
  const lines = [
    ["بدهکار", "موبایل", "مبدأ", "سفارش", "مبلغ طلب", "دریافتی", "مانده", "وضعیت", "سررسید", "شرح", "ثبت"].map(csvCell).join(","),
    ...rows.map((r) => [r.accountName, r.phone, r.source === "order" ? "سفارش" : "دستی", r.orderNumber, Number(r.amount), r.received, r.balance, r.status, r.dueAt?.toISOString() ?? "", r.description, r.createdAt.toISOString()].map(csvCell).join(",")),
  ];
  return new Response(`\uFEFF${lines.join("\r\n")}`, { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename*=UTF-8''receivables.csv",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}, { feature: "accounting", manager: true, roles: ["accountant"] });
