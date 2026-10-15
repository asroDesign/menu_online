import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, surveyResponses, surveys } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { hasAny } from "@/lib/plans";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const [sv] = await db.select().from(surveys).where(eq(surveys.id, Number(id)));
    if (!sv || !sv.isActive) throw new HttpError(404, "نظرسنجی پیدا نشد");
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, sv.businessId));
    if (!hasAny(await featuresOf(biz), "surveys")) throw new HttpError(403, "نظرسنجی فعال نیست");
    const b = await readJson(req);
    const answers = b.answers && typeof b.answers === "object" ? (b.answers as Record<string, unknown>) : {};
    const clean: Record<string, unknown> = {};
    for (const q of sv.questions as { id: string }[]) {
      const v = answers[q.id];
      if (typeof v === "number" || (typeof v === "string" && v.trim())) clean[q.id] = typeof v === "string" ? v.trim().slice(0, 1000) : v;
    }
    if (!Object.keys(clean).length) throw new HttpError(400, "لطفاً حداقل به یک سؤال پاسخ دهید");
    await db.insert(surveyResponses).values({ surveyId: sv.id, businessId: sv.businessId, answers: clean, customerName: String(b.customerName ?? "").slice(0, 80) });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
