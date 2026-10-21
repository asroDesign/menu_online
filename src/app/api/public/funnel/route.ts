import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PLATFORM_FUNNEL_EVENTS, recordPlatformEvent, type PublicPlatformFunnelEvent } from "@/lib/platform-events";

const allowed = new Set<string>(PLATFORM_FUNNEL_EVENTS.filter((name) =>
  !["demo_request_complete", "signup_complete", "checkout_start"].includes(name),
));

export async function POST(req: Request) {
  try {
    await enforceRateLimit(req, "platform-funnel", "website", 60, 60_000);
    await enforceRateLimit(req, "platform-funnel-global", "website", 1800, 60_000, false);
    const body = await readJson(req, 2 * 1024);
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    const eventName = typeof body.name === "string" ? body.name : "";
    if (!allowed.has(eventName) || !/^[0-9a-f-]{36}$/i.test(eventId))
      throw new HttpError(400, "رویداد قیف نامعتبر است");
    const inserted = await recordPlatformEvent(eventName as PublicPlatformFunnelEvent, eventId);
    return Response.json({ accepted: inserted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
