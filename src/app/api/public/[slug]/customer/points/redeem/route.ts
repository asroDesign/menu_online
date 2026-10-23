import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, customerPointEntries, customers } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { addCustomerPoints } from "@/lib/customer-points";
import { normalizeCustomerRewards } from "@/lib/customer-rewards-core";
import { addWalletEntry } from "@/lib/orders";
import { publicCustomerData } from "@/lib/public-customer-data";
import { publicCustomerId } from "@/lib/public-customer-session";
import { getPublicMenu } from "@/lib/public-menu";
import { enforceRateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const [business] = await db.select({ id: businesses.id, settings: businesses.settings }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
    if (!business || !await getPublicMenu(slug)) throw new HttpError(404, "منو پیدا نشد");
    const customerId = await publicCustomerId(slug, business.id);
    if (!customerId) throw new HttpError(401, "برای تبدیل امتیاز، ابتدا با شماره موبایل وارد پروفایل شوید");
    await enforceRateLimit(req, "customer-points-redeem", `${business.id}:${customerId}`, 10, 10 * 60_000);

    const body = await readJson(req);
    const points = Number(body.points);
    const requestKey = typeof body.requestKey === "string" ? body.requestKey.trim() : "";
    if (!Number.isSafeInteger(points) || points < 1 || points > 100_000_000) throw new HttpError(400, "تعداد امتیاز برای تبدیل معتبر نیست");
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestKey)) throw new HttpError(400, "شناسهٔ درخواست تبدیل معتبر نیست");

    const rewardSettings = normalizeCustomerRewards((business.settings as Record<string, unknown> | null)?.customerRewards);
    if (rewardSettings.pointValueToman < 1) throw new HttpError(409, "مدیر رستوران هنوز ارزش تبدیل امتیاز را تنظیم نکرده است");
    const amountToman = points * rewardSettings.pointValueToman;
    if (!Number.isSafeInteger(amountToman) || amountToman < 1 || amountToman > 2_147_483_647) throw new HttpError(400, "مبلغ تبدیل از سقف کیف پول بیشتر است");

    const idempotencyKey = `points-redeem:${business.id}:${customerId}:${requestKey}`;
    await db.transaction(async (tx) => {
      const [existing] = await tx.select({ customerId: customerPointEntries.customerId, amount: customerPointEntries.amount }).from(customerPointEntries)
        .where(and(eq(customerPointEntries.businessId, business.id), eq(customerPointEntries.idempotencyKey, idempotencyKey))).limit(1);
      if (existing) {
        if (existing.customerId !== customerId || existing.amount !== -points) throw new HttpError(409, "این شناسهٔ تبدیل قبلاً برای درخواست دیگری استفاده شده است");
        return;
      }
      const [customer] = await tx.select({ points: customers.points }).from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.businessId, business.id))).for("update").limit(1);
      if (!customer) throw new HttpError(401, "حساب مشتری پیدا نشد؛ دوباره وارد شوید");
      if (customer.points < points) throw new HttpError(409, "امتیازهای در دسترس برای این تبدیل کافی نیست");
      await addCustomerPoints(tx as unknown as typeof db, {
        businessId: business.id, customerId, amount: -points, kind: "redeem", idempotencyKey,
        note: `تبدیل ${points} امتیاز به ${amountToman} تومان`,
      });
      await addWalletEntry(business.id, customerId, amountToman, "earn", null,
        `تبدیل ${points} امتیاز باشگاه`, `${idempotencyKey}:wallet`, tx as unknown as typeof db);
    });

    const profile = await publicCustomerData(business.id, customerId, rewardSettings.pointValueToman);
    if (!profile) throw new HttpError(401, "حساب مشتری پیدا نشد؛ دوباره وارد شوید");
    return Response.json({ profile, converted: { points, amountToman } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
