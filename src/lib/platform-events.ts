import { randomUUID } from "node:crypto";
import { lt } from "drizzle-orm";
import { db } from "@/db";
import { platformEvents } from "@/db/schema";

export const PLATFORM_FUNNEL_EVENTS = [
  "home_view",
  "pricing_view",
  "demo_request_view",
  "demo_preview_view",
  "demo_request_start",
  "demo_request_complete",
  "signup_start",
  "signup_complete",
  "checkout_start",
] as const;

export type PlatformFunnelEvent = typeof PLATFORM_FUNNEL_EVENTS[number];
export type PublicPlatformFunnelEvent = Exclude<PlatformFunnelEvent, "demo_request_complete" | "signup_complete" | "checkout_start">;

let lastPruneAt = 0;

export async function recordPlatformEvent(eventName: PlatformFunnelEvent, eventId: string = randomUUID()) {
  const [event] = await db.insert(platformEvents).values({ eventId, eventName })
    .onConflictDoNothing().returning({ id: platformEvents.id });
  const now = Date.now();
  if (now - lastPruneAt >= 24 * 60 * 60_000) {
    lastPruneAt = now;
    void db.delete(platformEvents).where(lt(platformEvents.createdAt, new Date(now - 90 * 24 * 60 * 60_000))).catch(() => { lastPruneAt = 0; });
  }
  return Boolean(event);
}
