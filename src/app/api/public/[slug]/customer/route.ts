import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, customers } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { normPhone } from "@/lib/orders";
import { hasAny } from "@/lib/plans";

/** Lets the order form know whether a phone number is a registered club member and how much cashback it has. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
    if (!biz) throw new HttpError(404, "پیدا نشد");
    if (!hasAny(await featuresOf(biz), "cashback")) return Response.json({ exists: false, balance: 0 });
    const phone = normPhone(new URL(req.url).searchParams.get("phone") ?? "");
    if (phone.length < 10) return Response.json({ exists: false, balance: 0 });
    const [c] = await db.select({ w: customers.walletBalance }).from(customers).where(and(eq(customers.businessId, biz.id), eq(customers.phone, phone)));
    return Response.json({ exists: !!c, balance: c?.w ?? 0 });
  } catch (e) {
    return errorResponse(e);
  }
}
