import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

/** Public phone numbers are not proof of customer identity; never expose membership or balance here. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
    if (!biz) throw new HttpError(404, "پیدا نشد");
    await enforceRateLimit(req, "public-customer-lookup", slug, 30, 60_000);
    return Response.json({ exists: false, balance: 0, verificationRequired: true });
  } catch (e) {
    return errorResponse(e);
  }
}
