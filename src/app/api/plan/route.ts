import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, users } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { getPlanOverrides } from "@/lib/entitlements";
import { getPlanList } from "@/lib/app-settings";
import { PLAN_KEYS, planName, resolveFeatures } from "@/lib/plans";
import { notifyPlatformManager } from "@/lib/platform-sms";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, { business, features }) => {
  const ov = await getPlanOverrides();
  const matrix = Object.fromEntries(PLAN_KEYS.map((p) => [p, resolveFeatures(p, null, ov)]));
  return Response.json({ plan: business.plan, features, matrix, upgradeRequest: business.upgradeRequest, plans: await getPlanList(), endsAt: business.subscriptionEndsAt });
}, { allowUnpaid: true });

export const POST = withAuth(async (req, { business }) => {
  const b = await readJson(req);
  const plan = String(b.plan);
  if (!PLAN_KEYS.includes(plan as never)) throw new HttpError(400, "پلن نامعتبر است");
  if (plan === business.plan) throw new HttpError(400, "این پلن هم‌اکنون فعال است");
  const isNewRequest = business.upgradeRequest !== plan;
  await db.update(businesses).set({ upgradeRequest: plan }).where(eq(businesses.id, business.id));
  if (isNewRequest) {
    const [owner] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, business.userId)).limit(1);
    await notifyPlatformManager({ kind: "plan_request", name: business.name, phone: business.phone || owner?.phone || "", details: `درخواست ${planName(plan)} از پنل کسب‌وکار` });
  }
  return Response.json({ ok: true, upgradeRequest: plan });
}, { manager: true });
