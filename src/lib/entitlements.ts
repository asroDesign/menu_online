import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { planFeatures, trialGrants } from "@/db/schema";
import { isTrialWindowActive } from "@/lib/trial-window";
import { FEATURES, resolveFeatures, type FeatureMap, type Level } from "@/lib/plans";

let cache: { at: number; map: Record<string, Record<string, Level>> } | null = null;

export async function getPlanOverrides() {
  if (cache && Date.now() - cache.at < 4000) return cache.map;
  const rows = await db.select().from(planFeatures);
  const map: Record<string, Record<string, Level>> = {};
  for (const r of rows) (map[r.plan] ??= {})[r.feature] = r.level as Level;
  cache = { at: Date.now(), map };
  return map;
}

export function invalidatePlanCache() {
  cache = null;
}

/** the plan actually in force: a lapsed paid subscription falls back to the basic plan */
export function effectivePlan(biz: { plan: string; subscriptionEndsAt?: Date | string | null }) {
  const end = biz.subscriptionEndsAt ? new Date(biz.subscriptionEndsAt).getTime() : null;
  return end !== null && end < Date.now() && biz.plan !== "basic" ? "basic" : biz.plan;
}

const noFeatures = () => Object.fromEntries(FEATURES.map(({ key }) => [key, "no"])) as FeatureMap;

export async function activeTrialOf(businessId: number, at = new Date()) {
  const [grant] = await db.select().from(trialGrants).where(and(eq(trialGrants.businessId, businessId), eq(trialGrants.status, "active"))).limit(1);
  if (!grant || grant.startsAt > at) return undefined;
  if (!isTrialWindowActive(grant.startsAt, grant.endsAt, at)) {
    await db.update(trialGrants).set({ status: "expired" }).where(and(eq(trialGrants.id, grant.id), eq(trialGrants.status, "active")));
    return undefined;
  }
  return grant;
}

export async function featuresOf(biz: { id?: number; plan: string; featureOverrides: unknown; subscriptionEndsAt?: Date | string | null }): Promise<FeatureMap> {
  if (biz.plan === "pending") {
    if (!biz.id) return noFeatures();
    const grant = await activeTrialOf(biz.id);
    if (!grant) return noFeatures();
    const saved = grant.featureSnapshot as Record<string, Level>;
    return Object.fromEntries(FEATURES.map(({ key }) => [key, ["yes", "custom", "no"].includes(saved?.[key]) ? saved[key] : "no"])) as FeatureMap;
  }
  return resolveFeatures(effectivePlan(biz), biz.featureOverrides as Record<string, boolean>, await getPlanOverrides());
}
