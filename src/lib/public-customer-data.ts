import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customers, customerRewardClaims, orders } from "@/db/schema";
import { normalizeRewardClaim } from "@/lib/loyalty-rewards-core";

export async function publicCustomerData(businessId: number, customerId: number, pointValueToman = 0) {
  const [customer] = await db.select({ id: customers.id, name: customers.name, phone: customers.phone, points: customers.points, walletBalance: customers.walletBalance, referralCode: customers.referralCode })
    .from(customers).where(and(eq(customers.id, customerId), eq(customers.businessId, businessId))).limit(1);
  if (!customer) return null;
  const [activeRewardRow] = await db.select({
    id: customerRewardClaims.id, campaignName: customerRewardClaims.campaignName,
    rewardType: customerRewardClaims.rewardType, discountPercent: customerRewardClaims.discountPercent,
    productId: customerRewardClaims.productId, productName: customerRewardClaims.productName,
    expiresAt: customerRewardClaims.expiresAt,
  }).from(customerRewardClaims).where(and(
    eq(customerRewardClaims.businessId, businessId), eq(customerRewardClaims.customerId, customer.id),
    eq(customerRewardClaims.status, "active"),
  )).orderBy(desc(customerRewardClaims.createdAt)).limit(1);
  const activeReward = activeRewardRow && new Date(activeRewardRow.expiresAt).getTime() > Date.now()
    ? normalizeRewardClaim(activeRewardRow) : null;
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
  return { ...customer, pointValueToman, pointsValueToman: Math.min(Number.MAX_SAFE_INTEGER, customer.points * pointValueToman), recentOrders, activeReward };
}
