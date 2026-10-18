import { runAutomations } from "@/lib/sms";
import { runPlatformSmsAutomations } from "@/lib/platform-sms";

export const dynamic = "force-dynamic";

/** External cron hook: GET /api/cron/sms?key=$CRON_SECRET */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || new URL(req.url).searchParams.get("key") !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ ok: true, restaurants: await runAutomations(), platform: await runPlatformSmsAutomations() });
}
