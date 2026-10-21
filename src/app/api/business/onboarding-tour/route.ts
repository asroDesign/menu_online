import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";

export const POST = withAuth(async (req, auth) => {
  if (auth.role !== "owner") throw new HttpError(403, "ثبت وضعیت راه‌اندازی فقط برای مالک رستوران مجاز است");
  const body = await readJson(req);
  if (body.action !== "complete" && body.action !== "dismiss") throw new HttpError(400, "وضعیت راه‌اندازی نامعتبر است");

  await db.update(businesses)
    .set({ setupTourCompletedAt: new Date() })
    .where(eq(businesses.id, auth.business.id));
  return Response.json({ ok: true });
}, { manager: true });
