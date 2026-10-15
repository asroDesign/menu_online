import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { validateDiscount } from "@/lib/orders";
import { hasAny } from "@/lib/plans";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
    if (!biz) throw new HttpError(404, "پیدا نشد");
    if (!hasAny(await featuresOf(biz), "discount")) throw new HttpError(403, "کد تخفیف فعال نیست");
    const u = new URL(req.url);
    const d = await validateDiscount(biz, u.searchParams.get("code") ?? "", Number(u.searchParams.get("subtotal")) || 0);
    return Response.json({ code: d.code, amount: d.amount });
  } catch (e) {
    return errorResponse(e);
  }
}
