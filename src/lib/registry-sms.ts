/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, customers, smsLogs, smsTemplates } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { makeCrud } from "@/lib/crud";
import { audience, runAutomations, runCampaign, SMS_VARS, sendTest, smsCfgOf } from "@/lib/sms";

const J = (data: unknown, status = 200) => Response.json(data, { status });
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

const templates = makeCrud({
  table: smsTemplates,
  feature: "sms",
  order: [desc(smsTemplates.id)],
  spec: {
    purpose: { type: "enum", values: ["birthday", "occasion", "promo", "service"] },
    title: { type: "string", required: true, max: 80 },
    templateId: { type: "string", required: true, max: 80 },
    params: { type: "json" },
    sampleText: { type: "string", max: 600 },
    isActive: { type: "bool" },
  },
  validate: async (_b, data) => {
    if ("params" in data) {
      const arr = Array.isArray(data.params) ? (data.params as { name?: string; var?: string }[]) : [];
      if (arr.length > 5) throw new HttpError(400, "حداکثر ۵ پارامتر برای هر قالب مجاز است");
      data.params = arr.map((p) => ({ name: str(p.name, 30), var: String(p.var) })).filter((p) => p.var in SMS_VARS);
    }
  },
});

export const smsRegistry: Record<string, any> = {
  smstemplates: templates,

  smscampaigns: {
    list: withAuth(
      async (_req, { business }) => {
        const rows = await db.select({ c: campaigns, t: smsTemplates.title }).from(campaigns).leftJoin(smsTemplates, eq(smsTemplates.id, campaigns.templateId)).where(and(eq(campaigns.businessId, business.id), eq(campaigns.channel, "sms"))).orderBy(desc(campaigns.id)).limit(100);
        return J({ items: rows.map((r) => ({ ...r.c, templateTitle: r.t ?? "—" })) });
      },
      { feature: "sms" },
    ),
    create: withAuth(
      async (req, { business }) => {
        const b = await readJson(req);
        const [tpl] = await db.select().from(smsTemplates).where(and(eq(smsTemplates.id, Number(b.templateId)), eq(smsTemplates.businessId, business.id)));
        if (!tpl) throw new HttpError(400, "قالب پیامک را انتخاب کنید");
        if (!smsCfgOf(business).apiKey) throw new HttpError(400, "ابتدا کلید API پنل پیامک را در تب «اتصال پنل» ثبت کنید");
        const aud = ["all", "vip", "inactive", "birthday_month", "manual"].includes(String(b.audience)) || /^seg:[a-z_]+$/.test(String(b.audience)) ? String(b.audience) : "all";
        const numbers = str(b.numbers, 4000);
        const list = await audience(business, aud, numbers);
        if (!list.length) throw new HttpError(400, "گیرنده‌ای برای این گروه پیدا نشد");
        const when = b.scheduleAt ? new Date(String(b.scheduleAt)) : null;
        if (when && isNaN(when.getTime())) throw new HttpError(400, "زمان ارسال نامعتبر است");
        const scheduled = !!when && when.getTime() > Date.now() + 60_000;
        const [row] = await db.insert(campaigns).values({
          businessId: business.id, channel: "sms", kind: tpl.purpose === "service" ? "service" : "promo", audience: aud,
          body: tpl.sampleText, title: str(b.title, 100) || tpl.title, templateId: tpl.id, recipients: list.length,
          status: scheduled ? "scheduled" : "sending", scheduledAt: scheduled ? when : null,
          extras: { code: str(b.code, 30).toUpperCase(), discount: str(b.discount, 25), origin: str(b.origin, 120), numbers },
        }).returning();
        if (!scheduled) void runCampaign(business, row.id).catch((e) => console.error("campaign failed", e));
        return J({ item: { ...row, templateTitle: tpl.title } }, 201);
      },
      { feature: "sms", manager: true },
    ),
    remove: withAuth<{ id: string }>(
      async (_req, { business }, { id }) => {
        const [row] = await db.delete(campaigns).where(and(eq(campaigns.id, Number(id)), eq(campaigns.businessId, business.id), eq(campaigns.status, "scheduled"))).returning({ id: campaigns.id });
        if (!row) throw new HttpError(400, "فقط کمپین‌های زمان‌بندی‌شده قابل حذف هستند");
        return J({ ok: true });
      },
      { feature: "sms", manager: true },
    ),
  },

  smslogs: {
    list: withAuth(
      async (_req, { business }) => {
        const rows = await db.select({ l: smsLogs, name: customers.name }).from(smsLogs).leftJoin(customers, eq(customers.id, smsLogs.customerId)).where(eq(smsLogs.businessId, business.id)).orderBy(desc(smsLogs.id)).limit(200);
        const [st] = await db.select({ sent: sql<number>`count(*) filter (where status='sent')::int`, sim: sql<number>`count(*) filter (where status='simulated')::int`, failed: sql<number>`count(*) filter (where status='failed')::int` }).from(smsLogs).where(eq(smsLogs.businessId, business.id));
        return J({ items: rows.map((r) => ({ ...r.l, customerName: r.name ?? "" })), stats: st });
      },
      { feature: "sms" },
    ),
  },

  smstest: {
    create: withAuth(
      async (req, { business }) => {
        const b = await readJson(req);
        const phone = String(b.phone ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
        if (phone.length < 10) throw new HttpError(400, "شماره موبایل معتبر نیست");
        const r = await sendTest(business, Number(b.templateId), phone.startsWith("98") ? "0" + phone.slice(2) : phone.length === 10 ? "0" + phone : phone).catch((e) => { throw new HttpError(400, (e as Error).message); });
        return J({ item: { id: 1, ...r } }, 201);
      },
      { feature: "sms", manager: true },
    ),
  },

  smsauto: {
    create: withAuth(async () => J({ item: { id: 1, ...(await runAutomations()) } }, 201), { feature: "sms", manager: true }),
  },
};
