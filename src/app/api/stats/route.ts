import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { diningTables, orderItems, orders, products } from "@/db/schema";
import { withAuth } from "@/lib/auth";
import { listOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

const dayKey = (d: Date | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date(d));

export const GET = withAuth(async (_req, { business }) => {
  const now = Date.now();
  const since = new Date(now - 15 * 86400_000);
  const rows = await db
    .select({ createdAt: orders.createdAt, total: orders.total, status: orders.status })
    .from(orders)
    .where(and(eq(orders.businessId, business.id), gte(orders.createdAt, since)));

  const days: { key: string; date: string; revenue: number; orders: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const t = now - i * 86400_000;
    days.push({ key: dayKey(t), date: new Date(t).toISOString(), revenue: 0, orders: 0 });
  }
  const idx = new Map(days.map((d, i) => [d.key, i]));
  for (const r of rows) {
    if (r.status === "canceled" || r.status === "awaiting_payment") continue;
    const i = idx.get(dayKey(r.createdAt));
    if (i === undefined) continue;
    days[i].orders += 1;
    if (r.status === "paid") days[i].revenue += r.total;
  }
  const today = days[13];
  const yesterday = days[12];
  const sum = (a: typeof days, f: "revenue" | "orders") => a.reduce((s, d) => s + d[f], 0);
  const last7 = days.slice(7);
  const prev7 = days.slice(0, 7);

  const todayKey = today.key;
  const todayRows = rows.filter((r) => dayKey(r.createdAt) === todayKey);
  const statusCounts: Record<string, number> = {};
  for (const r of todayRows) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  const paidToday = todayRows.filter((r) => r.status === "paid");
  const avgTicket = paidToday.length
    ? Math.round(paidToday.reduce((s, r) => s + r.total, 0) / paidToday.length)
    : 0;

  const top = await db
    .select({
      name: orderItems.name,
      emoji: sql<string>`max(${orderItems.emoji})`,
      qty: sql<number>`sum(${orderItems.quantity})::int`,
      revenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.price})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.businessId, business.id), ne(orders.status, "canceled"), gte(orders.createdAt, since)))
    .groupBy(orderItems.name)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(5);

  const activeOrders = await listOrders(business.id, {
    statuses: ["pending", "preparing", "ready", "served"],
    limit: 100,
  });
  const [tableCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(diningTables)
    .where(eq(diningTables.businessId, business.id));
  const [productCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.businessId, business.id));
  const occupied = new Set(activeOrders.filter((o) => o.tableId).map((o) => o.tableId)).size;

  const recent = await listOrders(business.id, { limit: 6 });

  return Response.json({
    today: {
      revenue: today.revenue,
      orders: today.orders,
      avgTicket,
      revenueDelta: yesterday.revenue ? ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100 : null,
    },
    week: {
      revenue: sum(last7, "revenue"),
      orders: sum(last7, "orders"),
      revenueDelta: sum(prev7, "revenue")
        ? ((sum(last7, "revenue") - sum(prev7, "revenue")) / sum(prev7, "revenue")) * 100
        : null,
    },
    series: last7.map(({ date, revenue, orders }) => ({ date, revenue, orders })),
    top,
    statusCounts,
    activeCount: activeOrders.length,
    tables: { total: tableCount.n, occupied },
    productCount: productCount.n,
    recent,
  });
}, { manager: true, roles: ["accountant"] });
