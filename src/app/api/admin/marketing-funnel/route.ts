import { and, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { platformEvents } from "@/db/schema";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async (req) => {
  const requested = Number(new URL(req.url).searchParams.get("days"));
  const days = [7, 14, 30].includes(requested) ? requested : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);
  const rows = await db.select({ eventName: platformEvents.eventName, count: sql<number>`count(*)::int` })
    .from(platformEvents).where(gte(platformEvents.createdAt, since)).groupBy(platformEvents.eventName);
  const events = Object.fromEntries(rows.map((row) => [row.eventName, Number(row.count)]));
  const count = (name: string) => events[name] ?? 0;
  return Response.json({
    days,
    homeViews: count("home_view"),
    pricingViews: count("pricing_view"),
    demoRequestViews: count("demo_request_view"),
    demoPreviewViews: count("demo_preview_view"),
    demoRequestStarts: count("demo_request_start"),
    demoRequestCompletes: count("demo_request_complete"),
    signupStarts: count("signup_start"),
    signupCompletes: count("signup_complete"),
    checkoutStarts: count("checkout_start"),
    trialStarts: 0,
    definition: "شمارش رویدادهای ثبت‌شده در همین پنجره؛ کاربر یکتا یا اتصال بین مراحل محاسبه نمی‌شود. شروع پرداخت با تکمیل یا موفقیت پرداخت برابر نیست. trial در محصول فعال نیست.",
  }, { headers: { "Cache-Control": "no-store" } });
}, { admin: true, perm: "overview" });
