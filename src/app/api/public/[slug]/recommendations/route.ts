import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { settingsOf } from "@/lib/orders";
import { hasAny } from "@/lib/plans";
import { recommendFor } from "@/lib/registry-b";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
    if (!biz) throw new HttpError(404, "پیدا نشد");
    if (!hasAny(await featuresOf(biz), "cross_sell")) return Response.json({ items: [] });
    const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map(Number).filter(Number.isInteger).slice(0, 20);
    const items = await recommendFor(biz.id, ids, settingsOf(biz).crossSellAuto !== false);
    return Response.json({ items: items.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, price: p.price, imageUrl: p.imageUrl })) });
  } catch (e) {
    return errorResponse(e);
  }
}
