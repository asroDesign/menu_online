import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, campaigns, customers, smsLogs, smsTemplates } from "@/db/schema";
import { featuresOf } from "@/lib/entitlements";
import { toJ } from "@/lib/jalali";
import { hasAny, type Settings } from "@/lib/plans";
import { mergeSeg, segmentOf } from "@/lib/segments";
import { expireUnpaid } from "@/lib/pos";
import { sendPattern } from "@/lib/sms-provider";
import { runRetentionAutomations } from "@/lib/sms-retention";

type Biz = typeof businesses.$inferSelect;
type Tpl = typeof smsTemplates.$inferSelect;
type Cust = { id: number | null; name: string; phone: string };

import { OCCASIONS, SMS_VARS } from "@/lib/sms-meta";
export { OCCASIONS, SMS_VARS };

export const smsCfgOf = (biz: Biz) => ((biz.settings ?? {}) as Settings).sms ?? { provider: "kavenegar" as const, apiKey: "" };

function render(tpl: Tpl, vars: Record<string, string>) {
  const map: Record<string, string> = { ...vars };
  for (const p of tpl.params) map[p.name] = vars[p.var] ?? "";
  return tpl.sampleText.replace(/\{(\w+)\}|#(\w+)#|%(\w+)/g, (m, a, b, c) => map[a ?? b ?? c] ?? m);
}

export { sendPattern } from "@/lib/sms-provider";

function varsFor(biz: Biz, c: Cust, extras: Record<string, string>) {
  const origin = extras.origin || smsCfgOf(biz).origin || "";
  return { customer_name: c.name || "مشتری گرامی", restaurant: biz.name, code: extras.code ?? "", discount: extras.discount ?? "", menu_link: origin ? `${origin}/m/${biz.slug}` : "" };
}

async function deliver(biz: Biz, tpl: Tpl, list: Cust[], o: { kind: string; campaignId?: number | null; extras: Record<string, string> }) {
  const cfg = smsCfgOf(biz);
  let sent = 0, failed = 0;
  for (let i = 0; i < list.length; i += 5) {
    const chunk = list.slice(i, i + 5);
    const results = await Promise.all(chunk.map((c) => sendPattern(cfg, tpl, c.phone, varsFor(biz, c, o.extras))));
    await db.insert(smsLogs).values(chunk.map((c, k) => ({ businessId: biz.id, campaignId: o.campaignId ?? null, customerId: c.id, kind: o.kind, phone: c.phone, provider: cfg.provider, status: results[k].status, detail: results[k].detail.slice(0, 300) })));
    for (const r of results) r.status === "failed" ? failed++ : sent++;
  }
  return { sent, failed };
}

export async function audience(biz: Biz, kind: string, numbers = ""): Promise<Cust[]> {
  if (kind === "manual") {
    const set = new Set(numbers.split(/[\s,،;\n]+/).map((x) => x.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "")).map((p) => (p.startsWith("98") ? "0" + p.slice(2) : p.length === 10 && p.startsWith("9") ? "0" + p : p)).filter((p) => p.length === 11));
    return [...set].map((phone) => ({ id: null, name: "", phone }));
  }
  if (kind.startsWith("seg:")) {
    const key = kind.slice(4);
    if (key === "referred") {
      const rows = await db.select({ id: customers.id, name: customers.name, phone: customers.phone })
        .from(customers).where(and(eq(customers.businessId, biz.id), eq(customers.smsOptIn, true), sql`${customers.referredByCustomerId} IS NOT NULL`)).limit(5000);
      return rows;
    }
    const cfg = mergeSeg(((biz.settings ?? {}) as Settings).segments);
    const rows = await db.select({ id: customers.id, name: customers.name, phone: customers.phone, ordersCount: customers.ordersCount, totalSpent: customers.totalSpent, lastOrderAt: customers.lastOrderAt }).from(customers).where(and(eq(customers.businessId, biz.id), eq(customers.smsOptIn, true))).limit(5000);
    return rows.filter((r) => segmentOf(r, cfg) === key).map(({ id, name, phone }) => ({ id, name, phone }));
  }
  const month = toJ(new Date()).jm;
  const cond = kind === "vip" ? sql`${customers.points} >= 800` : kind === "inactive" ? sql`${customers.ordersCount} <= 1` : kind === "birthday_month" ? sql`${customers.birthMonth} = ${month}` : sql`true`;
  const rows = await db.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers).where(and(eq(customers.businessId, biz.id), eq(customers.smsOptIn, true), cond)).limit(2000);
  return rows;
}

export async function runCampaign(biz: Biz, campaignId: number) {
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.businessId, biz.id)));
  if (!c || !c.templateId) return;
  const [tpl] = await db.select().from(smsTemplates).where(and(eq(smsTemplates.id, c.templateId), eq(smsTemplates.businessId, biz.id)));
  if (!tpl) { await db.update(campaigns).set({ status: "failed" }).where(eq(campaigns.id, c.id)); return; }
  const list = await audience(biz, c.audience, c.extras?.numbers ?? "");
  const r = await deliver(biz, tpl, list, { kind: "campaign", campaignId: c.id, extras: c.extras ?? {} });
  await db.update(campaigns).set({ status: r.sent === 0 && r.failed > 0 ? "failed" : "sent", sentCount: r.sent, failedCount: r.failed, recipients: list.length }).where(eq(campaigns.id, c.id));
}

export async function sendTest(biz: Biz, tplId: number, phone: string) {
  const [tpl] = await db.select().from(smsTemplates).where(and(eq(smsTemplates.id, tplId), eq(smsTemplates.businessId, biz.id)));
  if (!tpl) throw new Error("قالب پیدا نشد");
  if (!smsCfgOf(biz).apiKey) throw new Error("ابتدا کلید API پنل پیامک را در تب «اتصال پنل» ثبت کنید");
  const r = await deliver(biz, tpl, [{ id: null, name: "مشتری نمونه", phone }], { kind: "test", extras: { code: "TEST10", discount: "۱۰٪" } });
  return r;
}

/** Send only the approved static status pattern to the phone supplied with the reservation. */
export async function sendReservationStatusSms(biz: Biz, phone: string, status: "confirmed" | "cancelled") {
  if (!hasAny(await featuresOf(biz), "sms")) return { status: "skipped" as const, detail: "قابلیت پیامک در تعرفه فعال نیست" };
  const cfg = smsCfgOf(biz);
  if (!cfg.apiKey) return { status: "skipped" as const, detail: "کلید API پنل پیامک تنظیم نشده است" };

  const purpose = status === "confirmed" ? "reservation_confirmed" : "reservation_rejected";
  const [tpl] = await db.select().from(smsTemplates)
    .where(and(eq(smsTemplates.businessId, biz.id), eq(smsTemplates.purpose, purpose), eq(smsTemplates.isActive, true)))
    .orderBy(desc(smsTemplates.id)).limit(1);
  if (!tpl) return { status: "skipped" as const, detail: `قالب «${status === "confirmed" ? "تأیید رزرو" : "رد رزرو"}» تعریف نشده است` };

  const digits = phone.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
  const receptor = digits.startsWith("98") ? `0${digits.slice(2)}` : digits.length === 10 && digits.startsWith("9") ? `0${digits}` : digits;
  if (!/^09\d{9}$/.test(receptor)) return { status: "skipped" as const, detail: "شماره موبایل مشتری معتبر نیست" };

  const result = await sendPattern(cfg, tpl, receptor, {});
  try {
    await db.insert(smsLogs).values({ businessId: biz.id, campaignId: null, customerId: null, kind: purpose, phone: receptor, provider: cfg.provider, status: result.status, detail: result.detail.slice(0, 300) });
  } catch (error) {
    console.error("reservation SMS log failed", error);
  }
  return result;
}

let running = false;
/** Scheduled campaigns + birthday messages. Safe to call often (idempotent). */
export async function runAutomations() {
  if (running) return { campaigns: 0, birthdays: 0, retention: 0, expired: 0 };
  running = true;
  let nC = 0, nB = 0, nR = 0, nX = 0;
  try {
    nX = await expireUnpaid();
    const due = await db.update(campaigns).set({ status: "sending" }).where(and(eq(campaigns.status, "scheduled"), sql`${campaigns.scheduledAt} <= now()`)).returning();
    for (const c of due) {
      const [biz] = await db.select().from(businesses).where(eq(businesses.id, c.businessId));
      if (biz && !biz.isSuspended && hasAny(await featuresOf(biz), "sms")) { await runCampaign(biz, c.id); nC++; }
      else await db.update(campaigns).set({ status: "failed" }).where(eq(campaigns.id, c.id));
    }
    const { jm, jd } = toJ(new Date());
    const bizs = await db.select().from(businesses).where(sql`${businesses.settings}->'sms'->>'birthdayAuto' = 'true'`);
    for (const biz of bizs) {
      const cfg = smsCfgOf(biz);
      if (biz.isSuspended || !cfg.birthdayTemplateId || !cfg.apiKey) continue;
      const f = await featuresOf(biz);
      if (!hasAny(f, "sms") || !hasAny(f, "loyalty")) continue;
      const [tpl] = await db.select().from(smsTemplates).where(and(eq(smsTemplates.id, cfg.birthdayTemplateId), eq(smsTemplates.businessId, biz.id)));
      if (!tpl) continue;
      const cs = await db.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers).where(and(eq(customers.businessId, biz.id), eq(customers.birthMonth, jm), eq(customers.birthDay, jd), eq(customers.smsOptIn, true)));
      const since = new Date(Date.now() - 300 * 86400_000);
      const done = await db.select({ id: smsLogs.customerId }).from(smsLogs).where(and(eq(smsLogs.businessId, biz.id), eq(smsLogs.kind, "birthday"), gte(smsLogs.createdAt, since)));
      const skip = new Set(done.map((d) => d.id));
      const todo = cs.filter((c) => !skip.has(c.id));
      if (todo.length) { await deliver(biz, tpl, todo, { kind: "birthday", extras: { code: cfg.birthdayCode ?? "", discount: cfg.birthdayDiscount ?? "" } }); nB += todo.length; }
    }
    nR = await runRetentionAutomations();
  } catch (e) {
    console.error("automation failed", e);
  } finally {
    running = false;
  }
  return { campaigns: nC, birthdays: nB, retention: nR, expired: nX };
}
void desc;
