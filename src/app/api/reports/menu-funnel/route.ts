import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { menuEvents } from "@/db/schema";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async (req, auth) => {
  const requested = Number(new URL(req.url).searchParams.get("days"));
  const days = [7, 14, 30].includes(requested) ? requested : 14;
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);
  const rows = await db.select({ eventName: menuEvents.eventName, count: sql<number>`count(*)::int` })
    .from(menuEvents)
    .where(and(eq(menuEvents.businessId, auth.business.id), gte(menuEvents.createdAt, since)))
    .groupBy(menuEvents.eventName);
  const totals = Object.fromEntries(rows.map((row) => [row.eventName, Number(row.count)]));
  const views = totals.menu_view ?? 0;
  const orders = totals.order_created ?? 0;
  return Response.json({
    days,
    views,
    categoryViews: totals.category_view ?? 0,
    productViews: totals.product_view ?? 0,
    addToCart: totals.add_to_cart ?? 0,
    checkoutStarts: totals.checkout_start ?? 0,
    orders,
    conversionPercent: views ? Math.round((orders / views) * 1000) / 10 : 0,
    definition: "رویدادها تکرار بازدید را می‌شمارند؛ تعداد سفارش از رویداد سفارش ثبت‌شده در تراکنش سفارش می‌آید، نه از کلیک مشتری.",
  }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "sales_reports", manager: true });
