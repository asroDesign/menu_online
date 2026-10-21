import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orders, receivables } from "@/db/schema";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async (_req, auth) => {
  const items = await db.select({
    id: orders.id, number: orders.number, customerId: orders.customerId,
    customerName: orders.customerName, customerPhone: orders.customerPhone, total: orders.total,
    createdAt: orders.createdAt,
  }).from(orders).leftJoin(receivables, and(eq(receivables.orderId, orders.id), eq(receivables.businessId, orders.businessId))).where(and(
    eq(orders.businessId, auth.business.id), eq(orders.status, "served"),
    eq(orders.paymentStatus, "unpaid"), isNull(orders.deletedAt), isNull(receivables.id),
    isNotNull(orders.customerId),
  )).orderBy(desc(orders.createdAt)).limit(200);
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "accounting", manager: true, roles: ["accountant"] });
