import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { fmtJ } from "@/lib/jalali";
import { parseSalesReportRange } from "@/lib/sales-report-range";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, auth) => {
  let range: ReturnType<typeof parseSalesReportRange>;
  try { range = parseSalesReportRange(new URL(req.url).searchParams); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "بازه گزارش معتبر نیست"); }
  const rows = await db.select({
    number: orders.number, createdAt: orders.createdAt, type: orders.type, paymentMethod: orders.paymentMethod,
    subtotal: orders.subtotal, discount: orders.discountAmount, tax: orders.tax, service: orders.service,
    deliveryFee: orders.deliveryFee, total: orders.total,
  }).from(orders).where(and(
    eq(orders.businessId, auth.business.id), eq(orders.status, "paid"), eq(orders.paymentStatus, "paid"),
    gte(orders.createdAt, range.from), lte(orders.createdAt, range.to),
  )).orderBy(orders.createdAt, orders.id).limit(10_001);
  if (rows.length > 10_000) throw new HttpError(413, "خروجی از ۱۰٬۰۰۰ سفارش بیشتر است؛ بازه کوتاه‌تری انتخاب کنید");
  const header = ["شماره سفارش", "تاریخ شمسی", "نوع سفارش", "روش پرداخت", "مبلغ اولیه", "تخفیف", "مالیات", "سرویس", "هزینه ارسال", "مبلغ پرداخت‌شده"];
  const csv = [header.map(csvCell).join(","), ...rows.map((row) => [
    row.number, fmtJ(row.createdAt), row.type, row.paymentMethod ?? "", row.subtotal, row.discount,
    row.tax, row.service, row.deliveryFee, row.total,
  ].map(csvCell).join(","))].join("\r\n");
  const filename = `sales-${fmtJ(range.from, false).replaceAll("/", "-")}-${fmtJ(range.to, false).replaceAll("/", "-")}.csv`;
  return new Response(`\uFEFF${csv}`, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "no-store",
  } });
}, { feature: "sales_reports", roles: ["owner", "manager", "accountant"] });
