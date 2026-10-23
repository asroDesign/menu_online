import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";

export async function publicCustomerData(businessId: number, customerId: number) {
  const [customer] = await db.select({ id: customers.id, name: customers.name, phone: customers.phone, points: customers.points, referralCode: customers.referralCode })
    .from(customers).where(and(eq(customers.id, customerId), eq(customers.businessId, businessId))).limit(1);
  if (!customer) return null;
  const recentOrders = await db.select({
    number: orders.number,
    status: orders.status,
    paymentStatus: orders.paymentStatus,
    deliveryStatus: orders.deliveryStatus,
    total: orders.total,
    type: orders.type,
    createdAt: orders.createdAt,
  }).from(orders)
    .where(and(eq(orders.businessId, businessId), eq(orders.customerId, customer.id), isNull(orders.deletedAt)))
    .orderBy(desc(orders.createdAt)).limit(20);
  return { ...customer, recentOrders };
}
