import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { webPushIsConfigured, webPushPublicKey } from "@/lib/web-push";

export const dynamic = "force-dynamic";
const maxAge = { "Cache-Control": "no-store" };

function requireWaiter(role: string) {
  if (role !== "waiter") throw new HttpError(403, "اعلان خارج از برنامه فقط برای حساب گارسون فعال است");
}

function parseSubscription(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "اطلاعات اشتراک اعلان معتبر نیست");
  const candidate = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof candidate.endpoint === "string" ? candidate.endpoint.trim() : "";
  const p256dh = typeof candidate.keys?.p256dh === "string" ? candidate.keys.p256dh : "";
  const auth = typeof candidate.keys?.auth === "string" ? candidate.keys.auth : "";
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new HttpError(400, "نشانی اشتراک اعلان معتبر نیست"); }
  const hostname = parsed.hostname.toLowerCase();
  const trustedPushHost = hostname === "fcm.googleapis.com"
    || hostname === "push.services.mozilla.com"
    || hostname === "updates.push.services.mozilla.com"
    || hostname === "web.push.apple.com"
    || hostname.endsWith(".notify.windows.com");
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443") || !trustedPushHost || endpoint.length > 2048) {
    throw new HttpError(400, "نشانی اشتراک اعلان باید از سرویس مجاز Push و روی HTTPS باشد");
  }
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,100}$/.test(auth)) throw new HttpError(400, "کلیدهای رمزنگاری اشتراک اعلان معتبر نیستند");
  return { endpoint, p256dh, auth };
}

export const GET = withAuth(async (_req, auth) => {
  requireWaiter(auth.role);
  const [subscription] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(and(
    eq(pushSubscriptions.businessId, auth.business.id),
    eq(pushSubscriptions.userId, auth.user.id),
  )).limit(1);
  return Response.json({ configured: webPushIsConfigured(), publicKey: webPushPublicKey(), subscribed: !!subscription }, { headers: maxAge });
}, { feature: "waiter_call", roles: ["waiter"] });

export const POST = withAuth(async (req, auth) => {
  requireWaiter(auth.role);
  if (!webPushIsConfigured()) throw new HttpError(503, "ارسال اعلان خارج از برنامه هنوز در تنظیمات سامانه فعال نشده است");
  const body = await readJson(req, 12_000);
  const subscription = parseSubscription(body.subscription);
  const [existing] = await db.select({ businessId: pushSubscriptions.businessId, userId: pushSubscriptions.userId }).from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, subscription.endpoint)).limit(1);
  if (existing && (existing.businessId !== auth.business.id || existing.userId !== auth.user.id)) {
    throw new HttpError(409, "این دستگاه قبلاً به حساب دیگری متصل شده است؛ ابتدا اعلان دستگاه قبلی را لغو کنید");
  }
  await db.insert(pushSubscriptions).values({
    businessId: auth.business.id,
    userId: auth.user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: { p256dh: subscription.p256dh, auth: subscription.auth, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300), updatedAt: new Date() },
  });
  return Response.json({ subscribed: true }, { status: 201, headers: maxAge });
}, { feature: "waiter_call", roles: ["waiter"] });

export const DELETE = withAuth(async (req, auth) => {
  requireWaiter(auth.role);
  const body = await readJson(req, 4096);
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint || endpoint.length > 2048) throw new HttpError(400, "نشانی اشتراک اعلان معتبر نیست");
  await db.delete(pushSubscriptions).where(and(
    eq(pushSubscriptions.businessId, auth.business.id),
    eq(pushSubscriptions.userId, auth.user.id),
    eq(pushSubscriptions.endpoint, endpoint),
  ));
  return Response.json({ subscribed: false }, { headers: maxAge });
}, { feature: "waiter_call", roles: ["waiter"] });
