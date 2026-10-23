import { and, desc, eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { db } from "@/db";
import { businesses, customerRewardClaims, customers, loyaltyWheelSettings, loyaltyWheelSpins } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { hasAny } from "@/lib/plans";
import { publicCustomerId } from "@/lib/public-customer-session";
import { eligibleWheelPrizes } from "@/lib/loyalty-wheel-service";
import { weightedWheelPrizeIndex } from "@/lib/loyalty-wheel-core";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getPublicMenu } from "@/lib/public-menu";

type Context = { params: Promise<{ slug: string }> };
const noStore = { "Cache-Control": "no-store" };

async function wheelFor(slug: string) {
  const [business] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (!business || business.isSuspended || !await getPublicMenu(slug)) throw new HttpError(404, "منو پیدا نشد");
  const features = await featuresOf(business);
  if (!hasAny(features, "loyalty")) throw new HttpError(404, "گردونه در دسترس نیست");
  const [settings] = await db.select().from(loyaltyWheelSettings).where(eq(loyaltyWheelSettings.businessId, business.id)).limit(1);
  const prizes = settings?.isEnabled ? await eligibleWheelPrizes(business.id) : [];
  return { business, settings, prizes };
}

function publicSpin(spin: typeof loyaltyWheelSpins.$inferSelect | undefined) {
  if (!spin) return null;
  return {
    id: spin.id,
    title: spin.prizeTitle,
    prizeType: spin.prizeType,
    snapshot: spin.rewardSnapshot,
    status: spin.status,
    expiresAt: spin.expiresAt?.toISOString() ?? null,
    createdAt: spin.createdAt.toISOString(),
  };
}

export async function GET(req: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const { business, settings, prizes } = await wheelFor(slug);
    await enforceRateLimit(req, "public-wheel-read", String(business.id), 90, 60_000);
    const customerId = await publicCustomerId(slug, business.id);
    let activeReward = null;
    let nextSpinAt: string | null = null;
    if (customerId) {
      const [active] = await db.select().from(loyaltyWheelSpins).where(and(
        eq(loyaltyWheelSpins.businessId, business.id), eq(loyaltyWheelSpins.customerId, customerId), eq(loyaltyWheelSpins.status, "active"),
      )).limit(1);
      if (active?.expiresAt && active.expiresAt <= new Date()) {
        await db.update(loyaltyWheelSpins).set({ status: "expired" }).where(and(eq(loyaltyWheelSpins.id, active.id), eq(loyaltyWheelSpins.status, "active")));
      } else activeReward = publicSpin(active);
      const [latest] = await db.select({ createdAt: loyaltyWheelSpins.createdAt }).from(loyaltyWheelSpins)
        .where(and(eq(loyaltyWheelSpins.businessId, business.id), eq(loyaltyWheelSpins.customerId, customerId)))
        .orderBy(desc(loyaltyWheelSpins.createdAt)).limit(1);
      if (latest && settings) {
        const eligibleAt = latest.createdAt.getTime() + settings.cooldownHours * 3_600_000;
        if (eligibleAt > Date.now()) nextSpinAt = new Date(eligibleAt).toISOString();
      }
    }
    return Response.json({ enabled: !!settings?.isEnabled && prizes.length > 0, segments: prizes.map(({ segment }) => segment), activeReward, nextSpinAt }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const { business, settings, prizes } = await wheelFor(slug);
    if (!settings?.isEnabled || !prizes.length) throw new HttpError(404, "گردونهٔ شانس این رستوران فعال نیست");
    const customerId = await publicCustomerId(slug, business.id);
    if (!customerId) throw new HttpError(401, "برای چرخاندن گردونه ابتدا با شمارهٔ تأییدشده وارد پروفایل شوید");
    await enforceRateLimit(req, "public-wheel-spin-ip", String(business.id), 30, 60 * 60_000);
    await enforceRateLimit(req, "public-wheel-spin-customer", `${business.id}:${customerId}`, 5, 10 * 60_000, false);
    const body = await readJson(req, 2 * 1024);
    const requestKey = typeof body.requestKey === "string" ? body.requestKey.trim() : "";
    if (!/^[a-f0-9-]{16,80}$/i.test(requestKey)) throw new HttpError(400, "شناسهٔ درخواست گردونه معتبر نیست");

    const outcome = await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      const [customer] = await tx.select({ id: customers.id }).from(customers).where(and(
        eq(customers.id, customerId), eq(customers.businessId, business.id),
      )).for("update").limit(1);
      if (!customer) throw new HttpError(401, "پروفایل مشتری معتبر نیست؛ دوباره وارد شوید");
      const [previous] = await tx.select().from(loyaltyWheelSpins).where(and(
        eq(loyaltyWheelSpins.businessId, business.id), eq(loyaltyWheelSpins.customerId, customerId), eq(loyaltyWheelSpins.requestKey, requestKey),
      )).limit(1);
      if (previous) {
        let replaySpin = previous;
        if (previous.status === "active" && previous.expiresAt && previous.expiresAt <= new Date()) {
          const [expired] = await tx.update(loyaltyWheelSpins).set({ status: "expired" })
            .where(and(eq(loyaltyWheelSpins.id, previous.id), eq(loyaltyWheelSpins.status, "active"))).returning();
          replaySpin = expired ?? previous;
        }
        const currentPrizes = await eligibleWheelPrizes(business.id, tx);
        const targetIndex = Math.max(0, currentPrizes.findIndex(({ prize }) => prize.id === replaySpin.prizeId));
        return { spin: replaySpin, segments: currentPrizes.map(({ segment }) => segment), targetIndex, replay: true };
      }

      const [active] = await tx.select().from(loyaltyWheelSpins).where(and(
        eq(loyaltyWheelSpins.businessId, business.id), eq(loyaltyWheelSpins.customerId, customerId), eq(loyaltyWheelSpins.status, "active"),
      )).for("update").limit(1);
      const now = new Date();
      if (active?.expiresAt && active.expiresAt <= now) {
        await tx.update(loyaltyWheelSpins).set({ status: "expired" }).where(and(eq(loyaltyWheelSpins.id, active.id), eq(loyaltyWheelSpins.status, "active")));
      } else if (active) {
        throw new HttpError(409, "یک جایزهٔ فعال دارید؛ ابتدا آن را در سفارش بعدی استفاده کنید");
      }
      const [otherReward] = await tx.select().from(customerRewardClaims).where(and(
        eq(customerRewardClaims.businessId, business.id), eq(customerRewardClaims.customerId, customerId), eq(customerRewardClaims.status, "active"),
      )).for("update").limit(1);
      if (otherReward?.expiresAt && otherReward.expiresAt <= now) {
        await tx.update(customerRewardClaims).set({ status: "expired" }).where(and(eq(customerRewardClaims.id, otherReward.id), eq(customerRewardClaims.status, "active")));
      } else if (otherReward) {
        throw new HttpError(409, "ابتدا جایزهٔ فعال باشگاه مشتریان را در سفارش بعدی استفاده کنید");
      }

      const [latest] = await tx.select({ createdAt: loyaltyWheelSpins.createdAt }).from(loyaltyWheelSpins)
        .where(and(eq(loyaltyWheelSpins.businessId, business.id), eq(loyaltyWheelSpins.customerId, customerId)))
        .orderBy(desc(loyaltyWheelSpins.createdAt)).limit(1);
      const waitUntil = latest && settings ? new Date(latest.createdAt.getTime() + settings.cooldownHours * 3_600_000) : null;
      if (waitUntil && waitUntil > now) throw new HttpError(429, `چرخش بعدی از ${waitUntil.toLocaleString("fa-IR")} امکان‌پذیر است`, { "Retry-After": String(Math.ceil((waitUntil.getTime() - now.getTime()) / 1000)) });

      const currentPrizes = await eligibleWheelPrizes(business.id, tx);
      if (!currentPrizes.length) throw new HttpError(409, "در حال حاضر جایزهٔ قابل‌ارائه‌ای در گردونه نیست");
      const totalWeight = currentPrizes.reduce((sum, item) => sum + item.prize.weight, 0);
      if (!Number.isSafeInteger(totalWeight) || totalWeight < 1 || totalWeight > 2_147_483_647) throw new HttpError(409, "تنظیم شانس جایزه‌ها معتبر نیست");
      const targetIndex = weightedWheelPrizeIndex(currentPrizes.map(({ prize }) => ({ weight: prize.weight })), randomInt(totalWeight));
      const selected = currentPrizes[targetIndex];
      const prizeType = selected.prize.prizeType;
      const status = prizeType === "no_prize" ? "no_prize" : prizeType === "message" ? "message" : "active";
      const expiresAt = status === "active" ? new Date(now.getTime() + (settings?.rewardExpiresAfterDays ?? 30) * 86_400_000) : null;
      const [spin] = await tx.insert(loyaltyWheelSpins).values({
        businessId: business.id, customerId, prizeId: selected.prize.id, requestKey,
        prizeType, prizeTitle: selected.prize.title, rewardSnapshot: selected.snapshot,
        status, expiresAt, createdAt: now,
      }).returning();
      return { spin, segments: currentPrizes.map(({ segment }) => segment), targetIndex, replay: false };
    });
    return Response.json({ spin: publicSpin(outcome.spin), segments: outcome.segments, targetIndex: outcome.targetIndex, replay: outcome.replay }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
