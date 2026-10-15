import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { featuresOf } from "@/lib/entitlements";
import { posOnline } from "@/lib/pos";
import { hasAny, type Settings } from "@/lib/plans";

export const dynamic = "force-dynamic";

/** Is a card terminal reachable right now? (kiosk checks this before offering card payment) */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
  if (!biz) return Response.json({ online: false });
  const st = ((biz.settings ?? {}) as Settings).kiosk;
  const on = !!st?.allowPos && hasAny(await featuresOf(biz), ["kiosk", "tablet_pos"]);
  return Response.json({ online: on && (await posOnline(biz.id, st?.posDeviceId)) });
}
