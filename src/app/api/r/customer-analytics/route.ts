import { sql } from "drizzle-orm";
import { db } from "@/db";
import { HttpError, withAuth } from "@/lib/auth";
import { customerAnalyticsWindow } from "@/lib/customer-analytics-core";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, auth) => {
  const rawMonths = new URL(req.url).searchParams.get("months");
  const months = rawMonths === null ? 6 : Number(rawMonths);
  if (![3, 6, 12].includes(months)) throw new HttpError(400, "بازهٔ تحلیل باید ۳، ۶ یا ۱۲ ماه باشد");

  const window = customerAnalyticsWindow(new Date(), months);
  const businessId = auth.business.id;
  const [monthlyResult, summaryResult, referrerResult] = await Promise.all([
    db.execute(sql`
      WITH paid_orders AS (
        SELECT o.customer_id, o.created_at, o.total,
          row_number() OVER (PARTITION BY o.customer_id ORDER BY o.created_at, o.id) AS purchase_number
        FROM orders o
        INNER JOIN customers c ON c.id = o.customer_id AND c.business_id = o.business_id
        WHERE o.business_id = ${businessId}
          AND o.customer_id IS NOT NULL
          AND o.status = 'paid' AND o.payment_status = 'paid' AND o.deleted_at IS NULL
      ), purchase_months AS (
        SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'Asia/Tehran'), 'YYYY-MM-DD') AS month,
          count(DISTINCT customer_id) FILTER (WHERE purchase_number = 1)::int AS new_buyers,
          count(DISTINCT customer_id) FILTER (WHERE purchase_number > 1)::int AS returning_customers,
          count(*)::int AS paid_orders,
          coalesce(sum(total), 0)::bigint AS revenue
        FROM paid_orders
        WHERE created_at >= ${window.startAt} AND created_at < ${window.endAt}
        GROUP BY 1
      ), referral_months AS (
        SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'Asia/Tehran'), 'YYYY-MM-DD') AS month,
          count(*)::int AS referred_customers
        FROM customers
        WHERE business_id = ${businessId} AND referred_by_customer_id IS NOT NULL
          AND created_at >= ${window.startAt} AND created_at < ${window.endAt}
        GROUP BY 1
      )
      SELECT coalesce(p.month, r.month) AS month,
        coalesce(p.new_buyers, 0)::int AS new_buyers,
        coalesce(p.returning_customers, 0)::int AS returning_customers,
        coalesce(r.referred_customers, 0)::int AS referred_customers,
        coalesce(p.paid_orders, 0)::int AS paid_orders,
        coalesce(p.revenue, 0)::bigint AS revenue
      FROM purchase_months p FULL OUTER JOIN referral_months r USING (month)
      ORDER BY month
    `),
    db.execute(sql`
      WITH paid_orders AS (
        SELECT o.customer_id, o.created_at, o.total,
          row_number() OVER (PARTITION BY o.customer_id ORDER BY o.created_at, o.id) AS purchase_number
        FROM orders o
        INNER JOIN customers c ON c.id = o.customer_id AND c.business_id = o.business_id
        WHERE o.business_id = ${businessId}
          AND o.customer_id IS NOT NULL
          AND o.status = 'paid' AND o.payment_status = 'paid' AND o.deleted_at IS NULL
      ), period_orders AS (
        SELECT * FROM paid_orders WHERE created_at >= ${window.startAt} AND created_at < ${window.endAt}
      ), customer_counts AS (
        SELECT count(DISTINCT customer_id)::int AS active_buyers,
          count(DISTINCT customer_id) FILTER (WHERE purchase_number = 1)::int AS new_buyers,
          count(DISTINCT customer_id) FILTER (WHERE purchase_number > 1)::int AS returning_customers,
          count(*)::int AS paid_orders,
          coalesce(sum(total), 0)::bigint AS revenue
        FROM period_orders
      ), registration_counts AS (
        SELECT count(*)::int AS new_signups,
          count(*) FILTER (WHERE referred_by_customer_id IS NOT NULL)::int AS referred_customers,
          (SELECT count(*)::int FROM customers WHERE business_id = ${businessId}) AS all_customers
        FROM customers
        WHERE business_id = ${businessId} AND created_at >= ${window.startAt} AND created_at < ${window.endAt}
      )
      SELECT * FROM customer_counts CROSS JOIN registration_counts
    `),
    db.execute(sql`
      SELECT referrer.id, referrer.name, count(*)::int AS referrals
      FROM customers referred
      INNER JOIN customers referrer
        ON referrer.id = referred.referred_by_customer_id AND referrer.business_id = referred.business_id
      WHERE referred.business_id = ${businessId} AND referred.referred_by_customer_id IS NOT NULL
      GROUP BY referrer.id, referrer.name
      ORDER BY referrals DESC, referrer.id DESC
      LIMIT 5
    `),
  ]);

  const monthlyRows = (monthlyResult as unknown as { rows: Record<string, unknown>[] }).rows;
  const summaryRows = (summaryResult as unknown as { rows: Record<string, unknown>[] }).rows;
  const referrerRows = (referrerResult as unknown as { rows: Record<string, unknown>[] }).rows;
  const monthMap = new Map(monthlyRows.map((row) => [String(row.month).slice(0, 10), row]));
  const series = window.monthKeys.map((month) => {
    const row = monthMap.get(month) ?? {};
    return {
      month,
      newBuyers: Number(row.new_buyers ?? 0),
      returningCustomers: Number(row.returning_customers ?? 0),
      referredCustomers: Number(row.referred_customers ?? 0),
      paidOrders: Number(row.paid_orders ?? 0),
      revenue: Number(row.revenue ?? 0),
    };
  });
  const summaryRow = summaryRows[0] ?? {};
  const activeBuyers = Number(summaryRow.active_buyers ?? 0);
  const returningCustomers = Number(summaryRow.returning_customers ?? 0);
  const paidOrders = Number(summaryRow.paid_orders ?? 0);
  return Response.json({
    months,
    summary: {
      totalCustomers: Number(summaryRow.all_customers ?? 0),
      newSignups: Number(summaryRow.new_signups ?? 0),
      newBuyers: Number(summaryRow.new_buyers ?? 0),
      returningCustomers,
      referredCustomers: Number(summaryRow.referred_customers ?? 0),
      activeBuyers,
      retentionPercent: activeBuyers ? Math.round((returningCustomers / activeBuyers) * 100) : 0,
      averageOrders: activeBuyers ? Math.round((paidOrders / activeBuyers) * 10) / 10 : 0,
      paidOrders,
      revenue: Number(summaryRow.revenue ?? 0),
    },
    series,
    topReferrers: referrerRows.map((row) => ({ id: Number(row.id), name: String(row.name), referrals: Number(row.referrals) })),
    definitions: {
      newBuyer: "اولین سفارش پرداخت‌شدهٔ ثبت‌شده در این کسب‌وکار طی بازه",
      returningCustomer: "مشتری دارای سفارش پرداخت‌شده در بازه که دست‌کم یک سفارش پرداخت‌شدهٔ قدیمی‌تر دارد",
      referredCustomer: "حساب مشتری‌ای که با کد دعوت یک مشتری دیگر ساخته یا به او منتسب شده است",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });
