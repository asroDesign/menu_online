import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { menuImportJobs } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";

export const GET = withAuth<{ id: string }>(async (_req, auth, { id }) => {
  const jobId = Number(id);
  if (!Number.isSafeInteger(jobId) || jobId < 1) throw new HttpError(404, "پیش‌نمایش پیدا نشد.");
  const [item] = await db.select().from(menuImportJobs).where(and(eq(menuImportJobs.id, jobId), eq(menuImportJobs.businessId, auth.business.id)));
  if (!item) throw new HttpError(404, "پیش‌نمایش پیدا نشد.");
  return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "menu_import", manager: true });
