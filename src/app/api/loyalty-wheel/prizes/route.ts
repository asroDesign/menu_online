import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { loyaltyWheelPrizes } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { parseWheelPrizeInput } from "@/lib/loyalty-wheel-admin";

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 12 * 1024);
  const values = await parseWheelPrizeInput(body, auth.business.id);
  const item = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${auth.business.id + 9123000})`);
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(loyaltyWheelPrizes)
      .where(eq(loyaltyWheelPrizes.businessId, auth.business.id));
    if (Number(count?.count ?? 0) >= 16) throw new HttpError(409, "حداکثر ۱۶ جایزه برای هر کسب‌وکار قابل تعریف است تا نوشته‌های گردونه روی گوشی خوانا بمانند");
    const [created] = await tx.insert(loyaltyWheelPrizes).values({ businessId: auth.business.id, ...values, isActive: true }).returning();
    return created;
  });
  return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, { feature: "loyalty", manager: true });
