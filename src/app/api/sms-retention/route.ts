import { HttpError, readJson, withAuth } from "@/lib/auth";
import { createRetentionRule, listRetentionRules } from "@/lib/sms-retention";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, auth) => {
  return Response.json({ items: await listRetentionRules(auth.business.id) }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "sms", manager: true });

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 16 * 1024);
  const item = await createRetentionRule(auth.business, auth.user.id, body);
  return Response.json({ item }, { status: 201 });
}, { feature: "sms", manager: true });
