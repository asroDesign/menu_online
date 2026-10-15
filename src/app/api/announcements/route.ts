import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { getSupport } from "@/lib/app-settings";
import { withAuth } from "@/lib/auth";
import { effectivePlan } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

/** Banner data for the tenant dashboard: platform announcements + subscription state + support contact. */
export const GET = withAuth(async (_req, auth) => {
  const plan = effectivePlan(auth.business);
  const items = await db.select().from(announcements).where(and(eq(announcements.isActive, true), or(sql`${announcements.expiresAt} is null`, sql`${announcements.expiresAt} > now()`), or(eq(announcements.audience, "all"), eq(announcements.audience, `plan:${plan}`)))).orderBy(desc(announcements.id)).limit(5);
  const end = auth.business.subscriptionEndsAt;
  return Response.json({
    items: items.map((a) => ({ id: a.id, title: a.title, body: a.body, level: a.level })),
    subscription: { plan: auth.business.plan, effectivePlan: plan, endsAt: end, daysLeft: end ? Math.ceil((end.getTime() - Date.now()) / 86400_000) : null },
    support: await getSupport(),
  });
});
