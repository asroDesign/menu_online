import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, customerRewardCampaigns, customerRewardClaims, customers, products } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { publicCustomerData } from "@/lib/public-customer-data";
import { publicCustomerId } from "@/lib/public-customer-session";
import { rewardExpiresAt } from "@/lib/loyalty-rewards-core";
import { normalizeCustomerRewards } from "@/lib/customer-rewards-core";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getPublicMenu } from "@/lib/public-menu";

type Context = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const [business] = await db.select({ id: businesses.id, settings: businesses.settings }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
    if (!business || !await getPublicMenu(slug)) throw new HttpError(404, "منو پیدا نشد");
    const customerId = await publicCustomerId(slug, business.id);
    if (!customerId) throw new HttpError(401, "برای فعال‌کردن جایزه، ابتدا با شمارهٔ موبایل وارد پروفایل شوید");
    await enforceRateLimit(req, "customer-reward-claim-ip", String(business.id), 30, 60 * 60_000);
    await enforceRateLimit(req, "customer-reward-claim-customer", `${business.id}:${customerId}`, 10, 10 * 60_000);
    const body = await readJson(req);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new HttpError(404, "بارکد جایزه معتبر نیست یا غیرفعال شده است");

    const claim = await db.transaction(async (tx) => {
      const [customer] = await tx.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.businessId, business.id))).for("update").limit(1);
      if (!customer) throw new HttpError(401, "پروفایل مشتری معتبر نیست؛ دوباره وارد شوید");
      const [campaign] = await tx.select().from(customerRewardCampaigns)
        .where(and(eq(customerRewardCampaigns.businessId, business.id), eq(customerRewardCampaigns.token, token))).for("update").limit(1);
      if (!campaign || !campaign.isActive) throw new HttpError(404, "بارکد جایزه معتبر نیست یا غیرفعال شده است");
      if (campaign.rewardType === "free_item") {
        const [product] = campaign.productId ? await tx.select({ id: products.id }).from(products).where(and(
          eq(products.id, campaign.productId), eq(products.businessId, business.id), eq(products.isAvailable, true),
          sql`${products.price} > 0`, eq(products.sellingMode, "count"),
        )).limit(1) : [];
        if (!product) throw new HttpError(409, "آیتم این جایزه در حال حاضر در منو موجود نیست");
      }

      const [previous] = await tx.select().from(customerRewardClaims)
        .where(and(eq(customerRewardClaims.businessId, business.id), eq(customerRewardClaims.campaignId, campaign.id), eq(customerRewardClaims.customerId, customer.id))).limit(1);
      if (previous) {
        if (previous.status === "active" && previous.expiresAt.getTime() > Date.now()) return previous;
        if (previous.status === "active") {
          const [expired] = await tx.update(customerRewardClaims).set({ status: "expired" }).where(eq(customerRewardClaims.id, previous.id)).returning();
          return expired;
        }
        throw new HttpError(409, previous.status === "redeemed" ? "این بارکد قبلاً توسط شما استفاده شده است" : "مهلت این جایزه تمام شده است");
      }

      const [otherActive] = await tx.select().from(customerRewardClaims)
        .where(and(eq(customerRewardClaims.businessId, business.id), eq(customerRewardClaims.customerId, customer.id), eq(customerRewardClaims.status, "active"))).for("update").limit(1);
      if (otherActive && otherActive.expiresAt.getTime() <= Date.now()) {
        await tx.update(customerRewardClaims).set({ status: "expired" }).where(eq(customerRewardClaims.id, otherActive.id));
      } else if (otherActive) {
        throw new HttpError(409, "ابتدا جایزهٔ فعال فعلی را در سفارش بعدی استفاده کنید");
      }

      if (campaign.maxClaims > 0) {
        const [claimed] = await tx.select({ value: count() }).from(customerRewardClaims)
          .where(and(eq(customerRewardClaims.businessId, business.id), eq(customerRewardClaims.campaignId, campaign.id)));
        if (Number(claimed?.value ?? 0) >= campaign.maxClaims) throw new HttpError(409, "ظرفیت فعال‌سازی این جایزه تکمیل شده است");
      }

      const [created] = await tx.insert(customerRewardClaims).values({
        businessId: business.id,
        campaignId: campaign.id,
        customerId: customer.id,
        rewardType: campaign.rewardType,
        discountPercent: campaign.discountPercent,
        productId: campaign.productId,
        productName: campaign.productName,
        campaignName: campaign.name,
        activatedAt: new Date(),
        expiresAt: rewardExpiresAt(new Date(), campaign.expiresAfterDays),
        status: "active",
      }).returning();
      return created;
    });

    if (claim.status !== "active") throw new HttpError(409, "مهلت این جایزه تمام شده است");
    const rewardSettings = normalizeCustomerRewards((business.settings as Record<string, unknown> | null)?.customerRewards);
    const profile = await publicCustomerData(business.id, customerId, rewardSettings.pointValueToman);
    if (!profile) throw new HttpError(401, "پروفایل مشتری پیدا نشد");
    return Response.json({ profile, reward: {
      id: claim.id, campaignName: claim.campaignName, rewardType: claim.rewardType,
      discountPercent: claim.discountPercent, productId: claim.productId, productName: claim.productName,
      expiresAt: claim.expiresAt.toISOString(),
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
