import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, staff, users } from "@/db/schema";
import { logInfo } from "@/lib/logger";

export function webPushPublicKey() {
  const key = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
  return /^[A-Za-z0-9_-]{80,100}$/.test(key) ? key : "";
}

export function webPushIsConfigured() {
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() ?? "";
  return !!webPushPublicKey() && /^[A-Za-z0-9_-]{40,60}$/.test(privateKey) && /^(mailto:[^\s]+|https:\/\/[^\s]+)$/.test(subject);
}

export async function sendWaiterCallPush(input: {
  businessId: number;
  requestId: number;
  tableName: string;
  kind: "call" | "message";
}) {
  const publicKey = webPushPublicKey();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() ?? "";
  if (!publicKey || !webPushIsConfigured()) return { delivered: 0, configured: false };

  const targets = await db.select({
    id: pushSubscriptions.id,
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
  }).from(pushSubscriptions)
    .innerJoin(users, and(eq(users.id, pushSubscriptions.userId), eq(users.businessId, pushSubscriptions.businessId)))
    .innerJoin(staff, and(eq(staff.userId, users.id), eq(staff.businessId, pushSubscriptions.businessId)))
    .where(and(
      eq(pushSubscriptions.businessId, input.businessId),
      eq(users.businessId, input.businessId),
      eq(users.role, "staff"),
      eq(users.staffRole, "waiter"),
      eq(users.isActive, true),
      eq(staff.role, "waiter"),
      eq(staff.isActive, true),
    ));
  if (!targets.length) return { delivered: 0, configured: true };

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify({
    type: "waiter-call",
    requestId: input.requestId,
    title: input.kind === "message" ? "پیام تازه از مشتری" : "مشتری گارسون را صدا می‌زند",
    body: `میز ${input.tableName} درخواست حضور گارسون دارد.`,
    url: "/dashboard/waiter",
  });
  const results = await Promise.all(targets.map(async (target) => {
    try {
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
        TTL: 90,
        urgency: "high",
        topic: `wc-${input.requestId}`,
        timeout: 5000,
      });
      return true;
    } catch (error) {
      const statusCode = Number((error as { statusCode?: unknown })?.statusCode ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id)).catch(() => {
          logInfo("push.waiter_subscription_cleanup_failed", { businessId: input.businessId, requestId: input.requestId });
        });
      } else {
        logInfo("push.waiter_call_delivery_failed", { businessId: input.businessId, requestId: input.requestId, statusCode });
      }
      return false;
    }
  }));
  return { delivered: results.filter(Boolean).length, configured: true };
}
