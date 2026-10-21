import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, customers, discountCodes, smsLogs, smsRetentionDeliveries, smsRetentionMembers, smsRetentionRules, smsTemplates } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { fromJ, toJ } from "@/lib/jalali";
import { hasAny, type Settings } from "@/lib/plans";
import { mergeSeg, segmentOf } from "@/lib/segments";
import { sendPattern } from "@/lib/sms-provider";
import { normalizeIranMobile, retentionEligibility, segmentTransitionMatches, type RetentionSegment, type RetentionTrigger } from "@/lib/sms-retention-core";

type Biz = typeof businesses.$inferSelect;
type Rule = typeof smsRetentionRules.$inferSelect;
type Template = typeof smsTemplates.$inferSelect;
const VALID_SEGMENTS = ["vip", "loyal", "regular", "new", "at_risk", "lost", "none"] as const;
const MARKETING_KINDS = ["campaign", "birthday", "occasion", "retention"];
const SCAN_BATCH = 250;

function localSms(biz: Biz) {
  return ((biz.settings ?? {}) as Settings).sms ?? { provider: "kavenegar" as const, apiKey: "" };
}

function nextSendAtTehran(now: Date, hour: number) {
  const { jy, jm, jd } = toJ(now);
  const currentHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", hour12: false }).format(now));
  const today = fromJ(jy, jm, jd, hour, 0, 0);
  return currentHour <= hour ? today : fromJ(jy, jm, jd, hour + 24, 0, 0);
}

function boundedInt(value: unknown, min: number, max: number, fallback: number, label: string) {
  const n = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new HttpError(400, `${label} باید بین ${min} و ${max} باشد`);
  return n;
}

export async function createRetentionRule(biz: Biz, actorId: number, input: Record<string, unknown>) {
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 100) : "";
  const triggerType = input.triggerType as RetentionTrigger;
  if (!title) throw new HttpError(400, "نام کمپین را وارد کنید");
  if (!["inactive_days", "segment_enter", "segment_exit"].includes(triggerType)) throw new HttpError(400, "نوع محرک کمپین معتبر نیست");
  const inactiveDays = triggerType === "inactive_days" ? boundedInt(input.inactiveDays, 1, 365, 30, "روز عدم خرید") : null;
  const rawSegment = String(input.segmentKey ?? "");
  const segmentKey = triggerType === "inactive_days" ? null : rawSegment as RetentionSegment;
  if (triggerType !== "inactive_days" && !VALID_SEGMENTS.includes(rawSegment as RetentionSegment)) throw new HttpError(400, "گروه مشتری معتبر نیست");
  const templateId = boundedInt(input.templateId, 1, Number.MAX_SAFE_INTEGER, 0, "قالب پیامک");
  const [template] = await db.select().from(smsTemplates).where(and(eq(smsTemplates.id, templateId), eq(smsTemplates.businessId, biz.id), eq(smsTemplates.isActive, true))).limit(1);
  if (!template || !["promo", "occasion"].includes(template.purpose)) throw new HttpError(400, "یک قالب فعال تبلیغاتی یا مناسبتی انتخاب کنید");
  const cooldownDays = boundedInt(input.cooldownDays, 1, 90, 30, "فاصله ارسال مجدد");
  const maxMarketingSms30Days = boundedInt(input.maxMarketingSms30Days, 1, 20, 4, "سقف پیام تبلیغاتی ماهانه");
  const sendHourTehran = boundedInt(input.sendHourTehran, 0, 23, 10, "ساعت ارسال");
  const attributionDays = boundedInt(input.attributionDays, 1, 30, 7, "پنجره انتساب");
  const discountCode = typeof input.discountCode === "string" ? input.discountCode.trim().toUpperCase().slice(0, 30) : "";
  const discountLabel = typeof input.discountLabel === "string" ? input.discountLabel.trim().slice(0, 40) : "";
  if (discountCode) {
    const [coupon] = await db.select().from(discountCodes).where(and(eq(discountCodes.businessId, biz.id), eq(discountCodes.code, discountCode), eq(discountCodes.isActive, true))).limit(1);
    if (!coupon || (coupon.expiresAt && coupon.expiresAt <= new Date()) || (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses)) throw new HttpError(400, "کد تخفیف فعال و قابل استفاده‌ای در همین کسب‌وکار پیدا نشد");
  }
  const [activeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(smsRetentionRules).where(and(eq(smsRetentionRules.businessId, biz.id), eq(smsRetentionRules.isActive, true)));
  if (Number(activeCount.count) >= 20) throw new HttpError(409, "حداکثر ۲۰ کمپین فعال بازگشت مشتری مجاز است");
  const [rule] = await db.insert(smsRetentionRules).values({
    businessId: biz.id, title, triggerType, inactiveDays, segmentKey, templateId, cooldownDays,
    maxMarketingSms30Days, sendHourTehran, attributionDays, discountCode, discountLabel, createdBy: actorId,
  }).returning();
  return rule;
}

export async function updateRetentionRule(businessId: number, ruleId: number, input: { isActive?: boolean; title?: string }) {
  if (!Number.isSafeInteger(ruleId) || ruleId < 1) throw new HttpError(400, "شناسه کمپین معتبر نیست");
  const values: Partial<typeof smsRetentionRules.$inferInsert> = { updatedAt: new Date() };
  if (typeof input.isActive === "boolean") values.isActive = input.isActive;
  if (typeof input.title === "string") {
    const title = input.title.trim().slice(0, 100);
    if (!title) throw new HttpError(400, "نام کمپین را وارد کنید");
    values.title = title;
  }
  const [rule] = await db.update(smsRetentionRules).set(values).where(and(eq(smsRetentionRules.id, ruleId), eq(smsRetentionRules.businessId, businessId))).returning();
  if (!rule) throw new HttpError(404, "کمپین پیدا نشد");
  return rule;
}

export async function listRetentionRules(businessId: number) {
  const rules = await db.select().from(smsRetentionRules).where(eq(smsRetentionRules.businessId, businessId)).orderBy(desc(smsRetentionRules.id)).limit(100);
  if (!rules.length) return [];
  const ruleIds = rules.map((rule) => rule.id);
  const statusRows = await db.select({ ruleId: smsRetentionDeliveries.ruleId, status: smsRetentionDeliveries.status, count: sql<number>`count(*)::int` })
    .from(smsRetentionDeliveries).where(and(eq(smsRetentionDeliveries.businessId, businessId), inArray(smsRetentionDeliveries.ruleId, ruleIds)))
    .groupBy(smsRetentionDeliveries.ruleId, smsRetentionDeliveries.status);
  const attributedResult = await db.execute(sql`
    WITH eligible_touches AS (
      SELECT d.rule_id, o.id AS order_id, o.total, row_number() OVER (PARTITION BY o.id ORDER BY d.sent_at DESC, d.id DESC) AS touch_rank
      FROM sms_retention_deliveries d
      JOIN sms_retention_rules r ON r.id = d.rule_id AND r.business_id = d.business_id
      JOIN orders o ON o.business_id = d.business_id AND o.customer_id = d.customer_id
      WHERE d.business_id = ${businessId} AND d.status = 'sent' AND d.sent_at IS NOT NULL
        AND o.status = 'paid' AND o.payment_status = 'paid'
        AND o.created_at >= d.sent_at
        AND o.created_at <= d.sent_at + (r.attribution_days * interval '1 day')
    )
    SELECT rule_id, count(*)::int AS conversions, coalesce(sum(total), 0)::bigint AS attributed_revenue
    FROM eligible_touches WHERE touch_rank = 1 GROUP BY rule_id
  `);
  const counts = new Map<number, Record<string, number>>();
  for (const row of statusRows) counts.set(row.ruleId, { ...(counts.get(row.ruleId) ?? {}), [row.status]: row.count });
  const attribution = new Map<number, { conversions: number; attributedRevenue: number }>();
  for (const row of (attributedResult as unknown as { rows: { rule_id: number; conversions: number; attributed_revenue: number | string }[] }).rows) {
    attribution.set(Number(row.rule_id), { conversions: Number(row.conversions), attributedRevenue: Number(row.attributed_revenue) });
  }
  return rules.map((rule) => ({ ...rule, counts: counts.get(rule.id) ?? {}, ...(attribution.get(rule.id) ?? { conversions: 0, attributedRevenue: 0 }) }));
}

function queueValues(rule: Rule, customer: typeof customers.$inferSelect, triggerKey: string, expectedSegment: string | null, scheduledAt: Date) {
  return {
    businessId: rule.businessId, ruleId: rule.id, customerId: customer.id, triggerKey, triggerType: rule.triggerType,
    anchorOrderAt: customer.lastOrderAt, expectedSegment, status: "queued", attempts: 0, scheduledAt, detail: "",
  } as const;
}

async function scanRule(biz: Biz, rule: Rule, now: Date) {
  const rows = await db.select().from(customers)
    .where(and(eq(customers.businessId, biz.id), sql`${customers.id} > ${rule.scanCursorCustomerId}`))
    .orderBy(asc(customers.id)).limit(SCAN_BATCH);
  if (!rows.length) {
    await db.update(smsRetentionRules).set({ scanCursorCustomerId: 0, updatedAt: now }).where(and(eq(smsRetentionRules.id, rule.id), eq(smsRetentionRules.businessId, biz.id)));
    return 0;
  }
  const sendAt = nextSendAtTehran(now, rule.sendHourTehran);
  const segmentConfig = mergeSeg((biz.settings as Settings | null)?.segments);
  let enqueued = 0;
  for (const customer of rows) {
    const current = segmentOf(customer, segmentConfig, now.getTime());
    if (rule.triggerType === "inactive_days") {
      const anchor = customer.lastOrderAt ?? customer.createdAt;
      const threshold = now.getTime() - Number(rule.inactiveDays) * 86_400_000;
      if (anchor.getTime() <= threshold && customer.smsOptIn && normalizeIranMobile(customer.phone)) {
        const triggerKey = customer.lastOrderAt ? `order:${customer.lastOrderAt.toISOString()}` : `created:${customer.createdAt.toISOString()}`;
        const inserted = await db.insert(smsRetentionDeliveries).values(queueValues(rule, customer, triggerKey, null, sendAt)).onConflictDoNothing().returning({ id: smsRetentionDeliveries.id });
        enqueued += inserted.length;
      }
      continue;
    }
    await db.transaction(async (tx) => {
      const [member] = await tx.select().from(smsRetentionMembers)
        .where(and(eq(smsRetentionMembers.businessId, biz.id), eq(smsRetentionMembers.ruleId, rule.id), eq(smsRetentionMembers.customerId, customer.id))).for("update").limit(1);
      if (!member) {
        await tx.insert(smsRetentionMembers).values({ businessId: biz.id, ruleId: rule.id, customerId: customer.id, currentSegment: current }).onConflictDoNothing();
        return;
      }
      if (member.currentSegment === current) return;
      const previous = member.currentSegment as RetentionSegment;
      await tx.update(smsRetentionMembers).set({ currentSegment: current, updatedAt: now }).where(eq(smsRetentionMembers.id, member.id));
      const matches = segmentTransitionMatches(rule.triggerType as "segment_enter" | "segment_exit", rule.segmentKey as RetentionSegment, previous, current);
      if (matches && customer.smsOptIn && normalizeIranMobile(customer.phone)) {
        const inserted = await tx.insert(smsRetentionDeliveries).values(queueValues(rule, customer, `transition:${randomUUID()}`, current, sendAt)).onConflictDoNothing().returning({ id: smsRetentionDeliveries.id });
        enqueued += inserted.length;
      }
    });
  }
  const nextCursor = rows.length < SCAN_BATCH ? 0 : rows[rows.length - 1].id;
  await db.update(smsRetentionRules).set({ scanCursorCustomerId: nextCursor, updatedAt: now })
    .where(and(eq(smsRetentionRules.id, rule.id), eq(smsRetentionRules.businessId, biz.id)));
  return enqueued;
}

function skipMessage(reason: string) {
  const messages: Record<string, string> = {
    opt_out: "مشتری دریافت پیامک تبلیغاتی را غیرفعال کرده است",
    invalid_phone: "شماره موبایل معتبر نیست",
    purchase_after_trigger: "پس از ایجاد محرک خریدی ثبت شده است",
    segment_changed: "مشتری دیگر در وضعیت هدف کمپین نیست",
    cooldown: "فاصله مجاز با پیام تبلیغاتی قبلی رعایت نشده است",
    frequency_cap: "سقف پیام تبلیغاتی ۳۰ روز اخیر پر شده است",
  };
  return messages[reason] ?? "ارسال از نظر مجوز یا وضعیت مخاطب رد شد";
}

async function runDelivery(biz: Biz, rule: Rule, template: Template, delivery: typeof smsRetentionDeliveries.$inferSelect, customer: typeof customers.$inferSelect, now: Date) {
  const [claimed] = await db.update(smsRetentionDeliveries).set({ status: "sending", claimedAt: now, attempts: sql`${smsRetentionDeliveries.attempts} + 1`, detail: "" })
    .where(and(eq(smsRetentionDeliveries.id, delivery.id), eq(smsRetentionDeliveries.businessId, biz.id), eq(smsRetentionDeliveries.status, "queued"))).returning();
  if (!claimed) return 0;
  const settings = (biz.settings ?? {}) as Settings;
  const eligibility = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [currentCustomer] = await tx.select().from(customers)
      .where(and(eq(customers.id, customer.id), eq(customers.businessId, biz.id))).for("update").limit(1);
    if (!currentCustomer) {
      await tx.update(smsRetentionDeliveries).set({ status: "skipped", detail: "مشتری دیگر در این کسب‌وکار وجود ندارد" }).where(eq(smsRetentionDeliveries.id, delivery.id));
      return null;
    }
    const cooldownFrom = new Date(now.getTime() - rule.cooldownDays * 86_400_000);
    const [priorRetention] = await tx.select({ id: smsRetentionDeliveries.id }).from(smsRetentionDeliveries)
      .where(and(
        eq(smsRetentionDeliveries.businessId, biz.id), eq(smsRetentionDeliveries.customerId, currentCustomer.id),
        lt(smsRetentionDeliveries.id, delivery.id),
        or(eq(smsRetentionDeliveries.status, "sending"), and(eq(smsRetentionDeliveries.status, "sent"), gte(smsRetentionDeliveries.sentAt, cooldownFrom))),
      )).limit(1);
    if (priorRetention) {
      await tx.update(smsRetentionDeliveries).set({ status: "skipped", detail: "پیام بازگشت دیگری برای این مشتری در حال ارسال است یا تازه ارسال شده است" }).where(eq(smsRetentionDeliveries.id, delivery.id));
      return null;
    }
    const segment = segmentOf(currentCustomer, mergeSeg(settings.segments), now.getTime());
    const [recent] = await tx.select({ createdAt: smsLogs.createdAt }).from(smsLogs)
      .where(and(eq(smsLogs.businessId, biz.id), eq(smsLogs.customerId, currentCustomer.id), inArray(smsLogs.kind, MARKETING_KINDS), eq(smsLogs.status, "sent"), gte(smsLogs.createdAt, new Date(now.getTime() - 30 * 86_400_000))))
      .orderBy(desc(smsLogs.createdAt)).limit(1);
    const [countRow] = await tx.select({ count: sql<number>`count(*)::int` }).from(smsLogs)
      .where(and(eq(smsLogs.businessId, biz.id), eq(smsLogs.customerId, currentCustomer.id), inArray(smsLogs.kind, MARKETING_KINDS), eq(smsLogs.status, "sent"), gte(smsLogs.createdAt, new Date(now.getTime() - 30 * 86_400_000))));
    const result = retentionEligibility({
      smsOptIn: currentCustomer.smsOptIn, phone: currentCustomer.phone, lastOrderAt: currentCustomer.lastOrderAt, anchorOrderAt: delivery.anchorOrderAt,
      currentSegment: segment, expectedSegment: delivery.expectedSegment, lastMarketingAt: recent?.createdAt ?? null,
      marketingCount30Days: Number(countRow.count), cooldownDays: rule.cooldownDays, maxMarketingSms30Days: rule.maxMarketingSms30Days, now,
    });
    if (!result.eligible) {
      await tx.update(smsRetentionDeliveries).set({ status: "skipped", detail: skipMessage(result.reason) }).where(eq(smsRetentionDeliveries.id, delivery.id));
      return null;
    }
    return { customer: currentCustomer, phone: result.phone };
  });
  if (!eligibility) return 1;
  if (rule.discountCode) {
    const [coupon] = await db.select().from(discountCodes).where(and(eq(discountCodes.businessId, biz.id), eq(discountCodes.code, rule.discountCode), eq(discountCodes.isActive, true))).limit(1);
    if (!coupon || (coupon.expiresAt && coupon.expiresAt <= now) || (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses)) {
      await db.update(smsRetentionDeliveries).set({ status: "skipped", detail: "کد تخفیف دیگر فعال یا قابل استفاده نیست" }).where(eq(smsRetentionDeliveries.id, delivery.id));
      return 1;
    }
  }
  const cfg = localSms(biz);
  const origin = cfg.origin ?? "";
  const vars = {
    customer_name: customer.name || "مشتری گرامی", restaurant: biz.name,
    code: rule.discountCode, discount: rule.discountLabel,
    menu_link: origin ? `${origin}/m/${biz.slug}` : "",
  };
  const result = await sendPattern(cfg, template, eligibility.phone, { ...vars, customer_name: eligibility.customer.name || "مشتری گرامی" });
  await db.insert(smsLogs).values({ businessId: biz.id, campaignId: null, customerId: eligibility.customer.id, kind: "retention", phone: eligibility.phone, provider: cfg.provider, status: result.status, detail: result.detail.slice(0, 300) });
  if (result.status === "sent") {
    await db.update(smsRetentionDeliveries).set({ status: "sent", sentAt: now, detail: result.detail.slice(0, 300) }).where(eq(smsRetentionDeliveries.id, delivery.id));
    return 1;
  }
  const uncertain = result.detail.startsWith("خطای شبکه:");
  const retry = !uncertain && claimed.attempts < 3;
  await db.update(smsRetentionDeliveries).set({
    status: uncertain ? "uncertain" : retry ? "queued" : "failed",
    scheduledAt: retry ? new Date(now.getTime() + claimed.attempts * 5 * 60_000) : claimed.scheduledAt,
    claimedAt: null, detail: result.detail.slice(0, 300),
  }).where(eq(smsRetentionDeliveries.id, delivery.id));
  return 1;
}

/** Called from the existing SMS cron. DB uniqueness and atomic claims allow multiple workers safely. */
export async function runRetentionAutomations(now = new Date()) {
  // A timeout after provider acceptance is deliberately not retried: that delivery is marked uncertain.
  await db.update(smsRetentionDeliveries).set({ status: "uncertain", detail: "پاسخ worker پس از شروع ارسال دریافت نشد؛ برای جلوگیری از پیام تکراری retry خودکار انجام نشد" })
    .where(and(eq(smsRetentionDeliveries.status, "sending"), lt(smsRetentionDeliveries.claimedAt, new Date(now.getTime() - 30 * 60_000))));
  const rules = await db.select().from(smsRetentionRules).where(eq(smsRetentionRules.isActive, true)).orderBy(asc(smsRetentionRules.id)).limit(500);
  let processed = 0;
  for (const rule of rules) {
    const [biz] = await db.select().from(businesses).where(and(eq(businesses.id, rule.businessId), eq(businesses.isSuspended, false))).limit(1);
    if (!biz || !localSms(biz).apiKey || !hasAny(await featuresOf(biz), "sms")) continue;
    await scanRule(biz, rule, now);
  }
  const due = await db.select({ delivery: smsRetentionDeliveries, rule: smsRetentionRules, customer: customers, business: businesses, template: smsTemplates })
    .from(smsRetentionDeliveries)
    .innerJoin(smsRetentionRules, and(eq(smsRetentionRules.id, smsRetentionDeliveries.ruleId), eq(smsRetentionRules.businessId, smsRetentionDeliveries.businessId)))
    .innerJoin(customers, and(eq(customers.id, smsRetentionDeliveries.customerId), eq(customers.businessId, smsRetentionDeliveries.businessId)))
    .innerJoin(businesses, eq(businesses.id, smsRetentionDeliveries.businessId))
    .innerJoin(smsTemplates, and(eq(smsTemplates.id, smsRetentionRules.templateId), eq(smsTemplates.businessId, smsRetentionRules.businessId)))
    .where(and(eq(smsRetentionDeliveries.status, "queued"), sql`${smsRetentionDeliveries.scheduledAt} <= ${now}`, eq(smsRetentionRules.isActive, true), eq(smsTemplates.isActive, true)))
    .orderBy(asc(smsRetentionDeliveries.scheduledAt)).limit(100);
  for (const row of due) {
    if (row.business.isSuspended || !localSms(row.business).apiKey || !hasAny(await featuresOf(row.business), "sms")) {
      await db.update(smsRetentionDeliveries).set({ status: "skipped", detail: "سرویس پیامک یا دسترسی این کسب‌وکار فعال نیست" }).where(and(eq(smsRetentionDeliveries.id, row.delivery.id), eq(smsRetentionDeliveries.status, "queued")));
      continue;
    }
    processed += await runDelivery(row.business, row.rule, row.template, row.delivery, row.customer, now);
  }
  return processed;
}

export { normalizeIranMobile };
