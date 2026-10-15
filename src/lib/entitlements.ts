import { db } from "@/db";
import { planFeatures } from "@/db/schema";
import { resolveFeatures, type FeatureMap, type Level } from "@/lib/plans";

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

export async function featuresOf(biz: { plan: string; featureOverrides: unknown; subscriptionEndsAt?: Date | string | null }): Promise<FeatureMap> {
  return resolveFeatures(effectivePlan(biz), biz.featureOverrides as Record<string, boolean>, await getPlanOverrides());
}
