import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";
import { csvCell } from "@/lib/csv";

export const GET = withAuth(async (_req, auth) => {
  const rows = await db.select({
    name: customers.name,
    phone: customers.phone,
    smsOptIn: customers.smsOptIn,
    birthMonth: customers.birthMonth,
    birthDay: customers.birthDay,
    ordersCount: customers.ordersCount,
    totalSpent: customers.totalSpent,
    lastOrderAt: customers.lastOrderAt,
  }).from(customers).where(eq(customers.businessId, auth.business.id)).orderBy(asc(customers.id)).limit(10_001);
  if (rows.length > 10_000) throw new HttpError(413, "خروجی بیش از ۱۰٬۰۰۰ مشتری است؛ فهرست را محدود و دوباره تلاش کنید");
  const lines = [
    ["نام", "موبایل", "رضایت پیامک تبلیغاتی", "ماه تولد شمسی", "روز تولد", "تعداد سفارش پرداخت‌شده", "مجموع خرید (تومان)", "آخرین خرید"].map(csvCell).join(","),
    ...rows.map((row) => [row.name, row.phone, row.smsOptIn ? "بله" : "خیر", row.birthMonth, row.birthDay, row.ordersCount, row.totalSpent, row.lastOrderAt?.toISOString() ?? ""].map(csvCell).join(",")),
  ];
  return new Response(`\uFEFF${lines.join("\r\n")}`, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename*=UTF-8''customers.csv",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}, { feature: "loyalty", manager: true });
