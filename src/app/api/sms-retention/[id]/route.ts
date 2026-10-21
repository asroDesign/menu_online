import { HttpError, readJson, withAuth } from "@/lib/auth";
import { updateRetentionRule } from "@/lib/sms-retention";

export const PATCH = withAuth<{ id: string }>(async (req, auth, { id }) => {
  const ruleId = Number(id);
  if (!Number.isSafeInteger(ruleId) || ruleId < 1) throw new HttpError(400, "شناسه کمپین معتبر نیست");
  const body = await readJson(req, 4 * 1024);
  const item = await updateRetentionRule(auth.business.id, ruleId, {
    ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
    ...(typeof body.title === "string" ? { title: body.title } : {}),
  });
  return Response.json({ item });
}, { feature: "sms", manager: true });
