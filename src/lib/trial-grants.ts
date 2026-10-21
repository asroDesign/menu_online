import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, subscriptionInvoices, trialGrants } from "@/db/schema";
import { getSetting } from "@/lib/app-settings";
import { getPlanOverrides } from "@/lib/entitlements";
import { resolveFeatures } from "@/lib/plans";
import { trialDurationDays } from "@/lib/trial-policy";

/** Recover a missed first-signup grant once, only for an unpaid business with no trial history. */
export async function ensurePendingBusinessTrial(businessId: number) {
  const policy = await getSetting<{ enabled?: boolean; durationDays?: number }>("trialPolicy", { enabled: true, durationDays: 14 });
  const durationDays = trialDurationDays(policy.durationDays);
  const featureSnapshot = resolveFeatures("premium_plus", null, await getPlanOverrides());

  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [business] = await tx.select({ id: businesses.id, plan: businesses.plan, isSuspended: businesses.isSuspended }).from(businesses)
      .where(eq(businesses.id, businessId)).for("update");
    if (!business || business.plan !== "pending" || business.isSuspended) return { granted: false, durationDays };
    const [priorGrant] = await tx.select({ id: trialGrants.id }).from(trialGrants)
      .where(eq(trialGrants.businessId, business.id)).limit(1);
    if (priorGrant) return { granted: false, durationDays };
    const [paidInvoice] = await tx.select({ id: subscriptionInvoices.id }).from(subscriptionInvoices)
      .where(and(eq(subscriptionInvoices.businessId, business.id), eq(subscriptionInvoices.status, "paid"))).limit(1);
    if (paidInvoice) return { granted: false, durationDays };

    const startsAt = new Date();
    await tx.insert(trialGrants).values({
      businessId: business.id,
      plan: "premium_plus",
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationDays * 86_400_000),
      featureSetVersion: "trial-v1:premium_plus",
      featureSnapshot,
      status: "active",
    });
    return { granted: true, durationDays };
  });
}
