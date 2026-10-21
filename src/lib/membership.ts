import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { chooseMembershipTier, snapshotMembership, type MembershipTierRule } from "@/lib/membership-core";

export async function currentMembership(
  businessId: number,
  customerId: number,
  tiers: MembershipTierRule[],
  now = new Date(),
  executor: typeof db | any = db,
) {
  const metricsByTier: Record<string, { totalSpent: number; ordersCount: number; lastOrderAt: Date | null }> = {};
  for (const tier of tiers) {
    if (!tier.isActive) continue;
    const windowStart = new Date(now.getTime() - tier.validityDays * 86_400_000);
    const [aggregate] = await executor.select({
      totalSpent: sql<string>`coalesce(sum(${orders.total}), 0)::text`,
      ordersCount: sql<number>`count(*)::int`,
      lastOrderAt: sql<Date | null>`max(${orders.createdAt})`,
    }).from(orders).where(and(
      eq(orders.businessId, businessId),
      eq(orders.customerId, customerId),
      eq(orders.status, "paid"),
      eq(orders.paymentStatus, "paid"),
      isNull(orders.deletedAt),
      gte(orders.createdAt, windowStart),
      lte(orders.createdAt, now),
    ));
    metricsByTier[tier.id] = {
      totalSpent: Number(aggregate?.totalSpent ?? 0),
      ordersCount: Number(aggregate?.ordersCount ?? 0),
      lastOrderAt: aggregate?.lastOrderAt ? new Date(aggregate.lastOrderAt) : null,
    };
  }
  const selected = chooseMembershipTier(tiers, metricsByTier, now);
  if (!selected) return null;
  return {
    tier: selected.tier,
    metrics: selected.metrics,
    snapshot: snapshotMembership(selected.tier, selected.metrics, selected.expiresAt, now),
  };
}
