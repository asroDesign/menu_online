import { desc } from "drizzle-orm";
import { db } from "@/db";
import { platformSmsCampaigns, platformSmsLogs } from "@/db/schema";
import { withAuth, HttpError, readJson } from "@/lib/auth";
import { getPlatformSms, runPlatformSmsAutomations } from "@/lib/platform-sms";

export const dynamic = "force-dynamic";

const handler = withAuth(async (req, auth) => {
  if (req.method === "GET") {
    const [items, logs] = await Promise.all([
      db.select().from(platformSmsCampaigns).orderBy(desc(platformSmsCampaigns.id)).limit(100),
      db.select().from(platformSmsLogs).orderBy(desc(platformSmsLogs.id)).limit(100),
    ]);
    return Response.json({ items, logs });
  }
  if (!(await getPlatformSms()).enabled) throw new HttpError(409, "برای زمان‌بندی طرح مناسبتی، ابتدا یک پنل پیامک را فعال کنید");
  const b = await readJson(req);
  const title = String(b.title ?? "").trim().slice(0, 100);
  if (title.length < 2) throw new HttpError(400, "عنوان طرح مناسبتی را وارد کنید");
  const scheduledAt = b.scheduledAt ? new Date(String(b.scheduledAt)) : new Date();
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() > Date.now() + 366 * 86400_000) throw new HttpError(400, "تاریخ ارسال نامعتبر است");
  const [row] = await db.insert(platformSmsCampaigns).values({ title, occasion: "occasion", scheduledAt, status: "scheduled", createdBy: auth.user.name }).returning();
  let result = null;
  if (scheduledAt <= new Date()) result = await runPlatformSmsAutomations();
  return Response.json({ item: row, result }, { status: 201 });
}, { admin: true, perm: "settings" });

export const GET = handler;
export const POST = handler;
