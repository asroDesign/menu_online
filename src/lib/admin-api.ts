/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAudit, announcements, businesses, categories, customers, diningTables, planFeatures, platformExpenses, products, staff,
  subscriptionInvoices, subscriptionPayments, promoCoupons, couponRedemptions, ticketMessages, tickets, users, sessions, affiliates, affiliateCommissions, affiliateWalletEntries,
  affiliateWithdrawals, blogPosts, tutorials, faqs, testimonials, leadRequests, platformAccountingDocuments,
} from "@/db/schema";
import { getBilling, getManagerNotifications, getPlatformBranding, getPlanList, getSetting, getSupport, setSetting } from "@/lib/app-settings";
import { adminCan, adminDept, hashPassword, HttpError, readJson, startImpersonation, type AuthContext } from "@/lib/auth";
import { ADMIN_DEPTS, permsOf, TICKET_DEPTS, type AdminPerm } from "@/lib/admin-meta";
import { effectivePlan, getPlanOverrides, invalidatePlanCache } from "@/lib/entitlements";
import { jMonthRange, jYearRange, toJ } from "@/lib/jalali";
import { FEATURES, PLAN_KEYS, planName } from "@/lib/plans";
import { getPlatformSms, notifyPlatformManager, type PlatformSmsConfig, normalizedPhone } from "@/lib/platform-sms";

const J = (d: unknown, s = 200) => Response.json(d, { status: s });
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v: unknown, d = 0) => { if (v === null || v === undefined || v === "") return d; const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const date = (v: unknown) => { if (v === null || v === "" || v === undefined) return null; const d = new Date(String(v)); if (isNaN(d.getTime())) throw new HttpError(400, "تاریخ نامعتبر است"); return d; };
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const genPassword = () => randomBytes(9).toString("base64url").slice(0, 10);
const EMAIL = /^\S+@\S+\.\S+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const publicUrl = (v: unknown, max = 500) => {
  const value = str(v, max);
  if (!value) return "";
  if (value.startsWith("/api/files/") && /^\/api\/files\/[a-f0-9]{24}$/.test(value)) return value;
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? value : ""; } catch { return ""; }
};

async function audit(auth: AuthContext, action: string, targetType = "", targetId: string | number = "", detail = "") {
  await db.insert(adminAudit).values({ adminId: auth.user.id, adminName: auth.user.name, action, targetType, targetId: String(targetId), detail: detail.slice(0, 400) });
}
const need = (auth: AuthContext, p: AdminPerm) => { if (!adminCan(auth, p)) throw new HttpError(403, "شما به این بخش از پنل مدیریت دسترسی ندارید"); };

export async function handleAdmin(req: Request, auth: AuthContext, path: string[]): Promise<Response> {
  const [res, id, act] = path;
  const m = req.method;
  const q = new URL(req.url).searchParams;

  /* ------------------------------------------------------------ me */
  if (res === "me") return J({ id: auth.user.id, name: auth.user.name, email: auth.user.email, dept: adminDept(auth), perms: permsOf(adminDept(auth)), businessId: auth.business.id });

  /* --------------------------------------------------------- stats */
  if (res === "stats" && m === "GET") {
    need(auth, "overview");
    const rows = await db.select({ b: businesses, role: users.role }).from(businesses).innerJoin(users, eq(users.id, businesses.userId));
    const tenants = rows.filter((r) => r.role !== "admin").map((r) => r.b);
    const now = Date.now();
    const gm: any = await db.execute(sql`select business_id as id, count(*)::int as n, coalesce(sum(total),0)::float8 as gmv from orders where payment_status='paid' and created_at >= now() - interval '30 days' group by business_id`);
    const daily: any = await db.execute(sql`select to_char(created_at at time zone 'Asia/Tehran','YYYY-MM-DD') as d, count(*)::int as n, coalesce(sum(total),0)::float8 as gmv from orders where payment_status='paid' and created_at >= now() - interval '14 days' group by 1 order by 1`);
    const tot: any = await db.execute(sql`select count(*)::int as n, coalesce(sum(total),0)::float8 as gmv from orders where payment_status='paid'`);
    const { jy, jm } = toJ(new Date());
    const yr = jYearRange(jy), mr = jMonthRange(jy, jm);
    const inv = await db.select().from(subscriptionInvoices).where(or(eq(subscriptionInvoices.status, "unpaid"), gte(subscriptionInvoices.paidAt, yr.start))!);
    const paid = inv.filter((i) => i.status === "paid" && i.paidAt);
    const sum = (a: typeof inv) => a.reduce((s, i) => s + i.amount, 0);
    const tk = await db.select({ dept: tickets.department, st: tickets.status, assigned: sql<boolean>`${tickets.assignedTo} is not null`, n: sql<number>`count(*)::int` }).from(tickets).groupBy(tickets.department, tickets.status, sql`${tickets.assignedTo} is not null`);
    const byPlan: Record<string, number> = {};
    for (const t of tenants) { const p = effectivePlan(t); byPlan[p] = (byPlan[p] ?? 0) + 1; }
    const days: Record<string, number> = {};
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" });
    for (let i = 29; i >= 0; i--) days[fmt.format(now - i * 86400_000)] = 0;
    for (const t of tenants) { const k = fmt.format(t.createdAt); if (k in days) days[k]++; }
    const g30 = new Map<number, { n: number; gmv: number }>(gm.rows.map((r: any) => [Number(r.id), { n: Number(r.n), gmv: Number(r.gmv) }]));
    return J({
      tenants: { total: tenants.length, active: tenants.filter((t) => !t.isSuspended).length, suspended: tenants.filter((t) => t.isSuspended).length, newThisMonth: tenants.filter((t) => t.createdAt >= mr.start).length },
      byPlan,
      orders: { total: Number(tot.rows[0].n), gmvTotal: Number(tot.rows[0].gmv), gmv30: [...g30.values()].reduce((s, x) => s + x.gmv, 0), n30: [...g30.values()].reduce((s, x) => s + x.n, 0) },
      daily: daily.rows.map((r: any) => ({ d: r.d, n: Number(r.n), gmv: Number(r.gmv) })),
      signups: Object.entries(days).map(([d, n]) => ({ d, n })),
      revenue: { month: sum(paid.filter((i) => i.paidAt! >= mr.start && i.paidAt! <= mr.end)), year: sum(paid), unpaid: sum(inv.filter((i) => i.status === "unpaid")), unpaidCount: inv.filter((i) => i.status === "unpaid").length },
      expiring: tenants.filter((t) => t.subscriptionEndsAt && t.plan !== "basic" && t.subscriptionEndsAt.getTime() > now && t.subscriptionEndsAt.getTime() < now + 14 * 86400_000).map((t) => ({ id: t.id, name: t.name, plan: t.plan, endsAt: t.subscriptionEndsAt })),
      expired: tenants.filter((t) => t.subscriptionEndsAt && t.plan !== "basic" && t.subscriptionEndsAt.getTime() < now).map((t) => ({ id: t.id, name: t.name, plan: t.plan, endsAt: t.subscriptionEndsAt })),
      upgradeRequests: tenants.filter((t) => t.upgradeRequest).map((t) => ({ id: t.id, name: t.name, plan: t.plan, to: t.upgradeRequest })),
      tickets: tk.map((r) => ({ dept: r.dept, status: r.st, unassigned: !r.assigned, n: r.n })),
      top: tenants.map((t) => ({ id: t.id, name: t.name, plan: t.plan, ...(g30.get(t.id) ?? { n: 0, gmv: 0 }) })).sort((a, b) => b.gmv - a.gmv).slice(0, 6),
    });
  }

  /* ---------------------------------------------------- businesses */
  if (res === "businesses") {
    if (m === "GET" && !id) {
      need(auth, "businesses");
      const rows = await db.select({ b: businesses, ownerName: users.name, ownerEmail: users.email, role: users.role, ownerActive: users.isActive }).from(businesses).innerJoin(users, eq(users.id, businesses.userId)).orderBy(asc(businesses.id));
      const oc: any = await db.execute(sql`select business_id as id, count(*)::int as n, max(created_at) as last, coalesce(sum(total) filter (where payment_status='paid' and created_at >= now() - interval '30 days'),0)::float8 as gmv30 from orders group by business_id`);
      const om = new Map<number, any>(oc.rows.map((r: any) => [Number(r.id), r]));
      return J({
        items: rows.map((r) => {
          const o = om.get(r.b.id);
          return { id: r.b.id, name: r.b.name, slug: r.b.slug, plan: r.b.plan, effectivePlan: effectivePlan(r.b), featureOverrides: r.b.featureOverrides, isSuspended: r.b.isSuspended, upgradeRequest: r.b.upgradeRequest, customDomain: r.b.customDomain, domainStatus: r.b.domainStatus, createdAt: r.b.createdAt, subscriptionEndsAt: r.b.subscriptionEndsAt, adminNote: r.b.adminNote, ownerName: r.ownerName, ownerEmail: r.ownerEmail, ownerActive: r.ownerActive, isAdmin: r.role === "admin", ordersCount: o ? Number(o.n) : 0, lastOrderAt: o?.last ?? null, gmv30: o ? Number(o.gmv30) : 0 };
        }),
      });
    }
    if (m === "GET" && id) {
      need(auth, "businesses");
      const [r] = await db.select({ b: businesses, ownerName: users.name, ownerEmail: users.email, ownerId: users.id, role: users.role }).from(businesses).innerJoin(users, eq(users.id, businesses.userId)).where(eq(businesses.id, Number(id)));
      if (!r) throw new HttpError(404, "کسب‌وکار پیدا نشد");
      const cnt = async (t: any, col: any) => (await db.select({ n: sql<number>`count(*)::int` }).from(t).where(eq(col, r.b.id)))[0].n;
      const [prods, cats, tbls, stf, custs] = await Promise.all([cnt(products, products.businessId), cnt(categories, categories.businessId), cnt(diningTables, diningTables.businessId), cnt(staff, staff.businessId), cnt(customers, customers.businessId)]);
      const agg: any = await db.execute(sql`select count(*)::int as n, coalesce(sum(total) filter (where payment_status='paid'),0)::float8 as gmv, max(created_at) as last from orders where business_id = ${r.b.id}`);
      const invs = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.businessId, r.b.id)).orderBy(desc(subscriptionInvoices.id)).limit(20);
      const tks = await db.select().from(tickets).where(eq(tickets.businessId, r.b.id)).orderBy(desc(tickets.updatedAt)).limit(10);
      const { settings: _s, ...pub } = r.b; // eslint-disable-line @typescript-eslint/no-unused-vars
      return J({ business: { ...pub, effectivePlan: effectivePlan(r.b) }, owner: { id: r.ownerId, name: r.ownerName, email: r.ownerEmail, isAdmin: r.role === "admin" }, usage: { products: prods, categories: cats, tables: tbls, staff: stf, customers: custs, orders: Number(agg.rows[0].n), gmv: Number(agg.rows[0].gmv), lastOrderAt: agg.rows[0].last }, invoices: invs, tickets: tks });
    }
    if (m === "POST" && !id) {
      need(auth, "businesses_write");
      const b = await readJson(req);
      const name = str(b.name, 80), bizName = str(b.businessName, 80), email = str(b.email, 120).toLowerCase(), password = String(b.password ?? "") || genPassword();
      if (!name || !bizName) throw new HttpError(400, "نام مالک و نام کسب‌وکار را وارد کنید");
      if (!EMAIL.test(email)) throw new HttpError(400, "ایمیل معتبر نیست");
      if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد");
      const plan = PLAN_KEYS.includes(b.plan as never) ? String(b.plan) : "basic";
      const months = Math.min(60, Math.max(0, num(b.months, 0)));
      const [u] = await db.insert(users).values({ name, email, passwordHash: hashPassword(password) }).returning();
      const [biz] = await db.insert(businesses).values({ userId: u.id, name: bizName, slug: `shop-${randomBytes(3).toString("hex")}`, description: "به منوی دیجیتال ما خوش آمدید!", plan, subscriptionEndsAt: months > 0 && plan !== "basic" ? addMonths(new Date(), months) : null }).returning();
      await audit(auth, "ایجاد کسب‌وکار", "business", biz.id, `${bizName} (${plan})`);
      return J({ item: { id: biz.id, slug: biz.slug, email, password } }, 201);
    }
    if (m === "PATCH" && id) {
      need(auth, "businesses_write");
      const b = await readJson(req);
      const [cur] = await db.select().from(businesses).where(eq(businesses.id, Number(id)));
      if (!cur) throw new HttpError(404, "کسب‌وکار پیدا نشد");
      const set: Record<string, unknown> = {};
      const notes: string[] = [];
      if (typeof b.plan === "string") { if (!PLAN_KEYS.includes(b.plan as never)) throw new HttpError(400, "پلن نامعتبر است"); set.plan = b.plan; if (cur.upgradeRequest === b.plan) set.upgradeRequest = null; notes.push(`پلن ← ${b.plan}`); }
      if (b.featureOverrides && typeof b.featureOverrides === "object") {
        const clean: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(b.featureOverrides as Record<string, unknown>)) if (FEATURES.some((f) => f.key === k) && typeof v === "boolean") clean[k] = v;
        set.featureOverrides = clean; notes.push("استثناهای دسترسی");
      }
      if (typeof b.isSuspended === "boolean") { if (cur.id === auth.business.id) throw new HttpError(400, "نمی‌توانید حساب خودتان را مسدود کنید"); set.isSuspended = b.isSuspended; notes.push(b.isSuspended ? "مسدود" : "رفع مسدودی"); }
      if (b.rejectUpgrade) { set.upgradeRequest = null; notes.push("رد درخواست ارتقا"); }
      if (b.approveUpgrade && cur.upgradeRequest) { set.plan = cur.upgradeRequest; set.upgradeRequest = null; notes.push(`تأیید ارتقا به ${cur.upgradeRequest}`); }
      if (["none", "pending", "verified"].includes(String(b.domainStatus))) set.domainStatus = b.domainStatus;
      if ("subscriptionEndsAt" in b) { set.subscriptionEndsAt = date(b.subscriptionEndsAt); notes.push("تاریخ پایان اشتراک"); }
      if (typeof b.adminNote === "string") set.adminNote = str(b.adminNote, 1000);
      if (typeof b.name === "string" && b.name.trim()) set.name = str(b.name, 80);
      if (!Object.keys(set).length) throw new HttpError(400, "تغییری ارسال نشد");
      await db.update(businesses).set(set).where(eq(businesses.id, cur.id));
      await audit(auth, "ویرایش کسب‌وکار", "business", cur.id, `${cur.name}: ${notes.join("، ") || "ویرایش"}`);
      return J({ ok: true });
    }
    if (m === "POST" && id && act === "impersonate") {
      need(auth, "impersonate");
      const [r] = await db.select({ b: businesses, role: users.role, active: users.isActive }).from(businesses).innerJoin(users, eq(users.id, businesses.userId)).where(eq(businesses.id, Number(id)));
      if (!r) throw new HttpError(404, "کسب‌وکار پیدا نشد");
      if (r.role === "admin") throw new HttpError(400, "ورود به حساب مدیران مجاز نیست");
      if (!r.active) throw new HttpError(400, "حساب مالک غیرفعال است");
      await audit(auth, "ورود به‌جای کاربر", "business", r.b.id, r.b.name);
      await startImpersonation(r.b.userId);
      return J({ ok: true });
    }
    if (m === "POST" && id && act === "reset-password") {
      need(auth, "businesses_write");
      const b = await readJson(req).catch(() => ({}) as Record<string, unknown>);
      const [r] = await db.select({ b: businesses, role: users.role }).from(businesses).innerJoin(users, eq(users.id, businesses.userId)).where(eq(businesses.id, Number(id)));
      if (!r) throw new HttpError(404, "کسب‌وکار پیدا نشد");
      if (r.role === "admin") throw new HttpError(400, "رمز مدیران از بخش «کاربران و تیم» تغییر می‌کند");
      const password = str(b.password, 100) || genPassword();
      if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد");
      await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, r.b.userId));
      await db.delete(sessions).where(eq(sessions.userId, r.b.userId));
      await audit(auth, "بازنشانی رمز مالک", "business", r.b.id, r.b.name);
      return J({ password });
    }
    if (m === "DELETE" && id) {
      need(auth, "businesses_write");
      if (adminDept(auth) !== "super") throw new HttpError(403, "حذف کسب‌وکار فقط برای مدیر کل مجاز است");
      const b = await readJson(req).catch(() => ({}) as Record<string, unknown>);
      const [r] = await db.select({ b: businesses, role: users.role }).from(businesses).innerJoin(users, eq(users.id, businesses.userId)).where(eq(businesses.id, Number(id)));
      if (!r) throw new HttpError(404, "کسب‌وکار پیدا نشد");
      if (r.role === "admin" || r.b.id === auth.business.id) throw new HttpError(400, "این کسب‌وکار قابل حذف نیست");
      if (str(b.confirm, 60) !== r.b.slug) throw new HttpError(400, "برای تأیید حذف، آدرس منو (slug) را دقیق وارد کنید");
      await db.delete(users).where(or(eq(users.id, r.b.userId), eq(users.businessId, r.b.id))!);
      await audit(auth, "حذف کسب‌وکار", "business", r.b.id, `${r.b.name} (${r.b.slug})`);
      return J({ ok: true });
    }
  }

  /* --------------------------------------------------------- plans */
  if (res === "plans") {
    need(auth, "plans");
    if (m === "GET") return J({ overrides: await getPlanOverrides(), plans: await getPlanList(), features: FEATURES });
    if (m === "POST") {
      const b = await readJson(req);
      const plan = String(b.plan), feature = String(b.feature);
      if (!PLAN_KEYS.includes(plan as never) || !FEATURES.some((f) => f.key === feature)) throw new HttpError(400, "درخواست نامعتبر است");
      if (b.level === null) await db.delete(planFeatures).where(and(eq(planFeatures.plan, plan), eq(planFeatures.feature, feature)));
      else {
        if (!["yes", "no", "custom"].includes(String(b.level))) throw new HttpError(400, "سطح نامعتبر است");
        await db.insert(planFeatures).values({ plan, feature, level: String(b.level) }).onConflictDoUpdate({ target: [planFeatures.plan, planFeatures.feature], set: { level: String(b.level) } });
      }
      invalidatePlanCache();
      await audit(auth, "ویرایش ماتریس پلن", "plan", plan, `${feature} ← ${b.level ?? "پیش‌فرض"}`);
      return J({ ok: true });
    }
  }

  /* ------------------------------------------- invoices (subscriptions) */
  if (res === "coupons") {
    need(auth, "plans");
    if (m === "GET") return J({ items: await db.select().from(promoCoupons).orderBy(desc(promoCoupons.id)).limit(300) });
    if (m === "POST" || (m === "PATCH" && id)) {
      const b = await readJson(req);
      const code = str(b.code, 32).toUpperCase();
      const kind = b.kind === "fixed" ? "fixed" : "percent";
      const value = num(b.value, -1);
      const planKeys = Array.isArray(b.planKeys) ? [...new Set(b.planKeys.map((x: unknown) => str(x, 30)).filter((x: string) => PLAN_KEYS.includes(x as never)))] : [];
      const startsAt = date(b.startsAt), endsAt = date(b.endsAt);
      const maxRedemptions = b.maxRedemptions === "" || b.maxRedemptions == null ? null : num(b.maxRedemptions, 0);
      if (!/^[A-Z0-9_-]{3,32}$/.test(code) || value <= 0 || value > 2_000_000_000_000 || (kind === "percent" && value > 100)) throw new HttpError(400, "کد و مقدار تخفیف را معتبر وارد کنید");
      if (startsAt && endsAt && endsAt <= startsAt) throw new HttpError(400, "پایان اعتبار باید پس از شروع آن باشد");
      if (maxRedemptions !== null && maxRedemptions < 1) throw new HttpError(400, "سقف استفاده باید عددی مثبت باشد");
      const values = { code, kind, value, planKeys, startsAt, endsAt, maxRedemptions, isActive: b.isActive !== false };
      const [row] = m === "POST"
        ? await db.insert(promoCoupons).values({ ...values, createdBy: auth.user.name }).returning()
        : await db.update(promoCoupons).set(values).where(eq(promoCoupons.id, Number(id))).returning();
      if (!row) throw new HttpError(404, "کد تخفیف پیدا نشد");
      await audit(auth, m === "POST" ? "ایجاد کد تخفیف" : "ویرایش کد تخفیف", "coupon", row.id, row.code);
      return J({ item: row }, m === "POST" ? 201 : 200);
    }
    if (m === "DELETE" && id) {
      const [row] = await db.update(promoCoupons).set({ isActive: false }).where(eq(promoCoupons.id, Number(id))).returning();
      if (!row) throw new HttpError(404, "کد تخفیف پیدا نشد");
      await audit(auth, "غیرفعال‌سازی کد تخفیف", "coupon", row.id, row.code);
      return J({ item: row });
    }
  }

  /* ------------------------------------------- invoices (subscriptions) */
  if (res === "invoices") {
    need(auth, "accounting");
    if (m === "GET") {
      const conds = [] as any[];
      if (q.get("status")) conds.push(eq(subscriptionInvoices.status, q.get("status")!));
      if (q.get("business")) conds.push(eq(subscriptionInvoices.businessId, Number(q.get("business"))));
      const term = (q.get("q") ?? "").trim();
      if (term) conds.push(or(ilike(businesses.name, `%${term}%`), eq(subscriptionInvoices.number, Number(term) || -1))!);
      const rows = await db.select({ i: subscriptionInvoices, name: businesses.name }).from(subscriptionInvoices).innerJoin(businesses, eq(businesses.id, subscriptionInvoices.businessId)).where(conds.length ? and(...conds) : undefined).orderBy(desc(subscriptionInvoices.id)).limit(300);
      return J({ items: rows.map((r) => ({ ...r.i, businessName: r.name })) });
    }
    if (m === "POST" && !id) {
      const b = await readJson(req);
      const [biz] = await db.select().from(businesses).where(eq(businesses.id, Number(b.businessId)));
      if (!biz) throw new HttpError(404, "کسب‌وکار پیدا نشد");
      const plan = String(b.plan);
      if (!PLAN_KEYS.includes(plan as never)) throw new HttpError(400, "پلن نامعتبر است");
      const months = num(b.months, 12);
      if (months !== 6 && months !== 12) throw new HttpError(400, "دوره اشتراک باید شش‌ماهه یا سالانه باشد");
      const list = await getPlanList();
      const quote = list.find((p) => p.key === plan)!.terms[months];
      const additionalDiscount = Math.min(quote.total, Math.max(0, num(b.discount, 0)));
      const discount = quote.base - quote.total + additionalDiscount;
      const amount = b.amount !== undefined && b.amount !== "" ? Math.max(0, num(b.amount)) : quote.total - additionalDiscount;
      const [mx] = await db.select({ n: sql<number>`coalesce(max(${subscriptionInvoices.number}),1000)::int` }).from(subscriptionInvoices);
      const [row] = await db.insert(subscriptionInvoices).values({ number: mx.n + 1, businessId: biz.id, plan, months, amount, discount, note: str(b.note, 300), createdBy: auth.user.name }).returning();
      await audit(auth, "صدور فاکتور اشتراک", "invoice", row.number, `${biz.name} · ${plan} · ${months} ماه`);
      if (b.markPaid) return J({ item: await payInvoice(auth, row.id, str(b.method, 20) || "transfer", str(b.refNo, 40), date(b.paidAt)) }, 201);
      return J({ item: row }, 201);
    }
    if (m === "PATCH" && id) {
      const b = await readJson(req);
      if (b.action === "pay") return J({ item: await payInvoice(auth, Number(id), str(b.method, 20) || "transfer", str(b.refNo, 40), date(b.paidAt)) });
      if (b.action === "adjust") {
        const amount = num(b.amount, -1);
        if (amount <= 0 || amount > 2_000_000_000_000) throw new HttpError(400, "مبلغ فاکتور باید بیشتر از صفر و در محدوده مجاز باشد");
        const [inv] = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.id, Number(id)));
        if (!inv || inv.status !== "unpaid") throw new HttpError(400, "فقط مبلغ فاکتور پرداخت‌نشده قابل تغییر است");
        await db.update(subscriptionPayments).set({ status: "failed", detail: "مهلت پرداخت پایان یافت" }).where(and(eq(subscriptionPayments.invoiceId, inv.id), eq(subscriptionPayments.status, "pending"), sql`${subscriptionPayments.createdAt} < now() - interval '30 minutes'`));
        const [pending] = await db.select({ id: subscriptionPayments.id }).from(subscriptionPayments).where(and(eq(subscriptionPayments.invoiceId, inv.id), eq(subscriptionPayments.status, "pending"))).limit(1);
        if (pending) throw new HttpError(409, "برای این فاکتور پرداخت در حال انجام است؛ ابتدا آن را لغو یا تعیین تکلیف کنید");
        const [row] = await db.update(subscriptionInvoices).set({ amount, note: b.note === undefined ? inv.note : str(b.note, 300) }).where(and(eq(subscriptionInvoices.id, inv.id), eq(subscriptionInvoices.status, "unpaid"))).returning();
        if (!row) throw new HttpError(409, "فاکتور هم‌زمان تغییر کرد");
        await audit(auth, "ویرایش مبلغ فاکتور اشتراک", "invoice", row.number, `${inv.amount} ← ${amount} تومان`);
        return J({ item: row });
      }
      if (b.action === "void") {
        const pending = await db.update(subscriptionPayments).set({ status: "failed", detail: "فاکتور باطل شد" }).where(and(eq(subscriptionPayments.invoiceId, Number(id)), eq(subscriptionPayments.status, "pending"), sql`${subscriptionPayments.createdAt} < now() - interval '30 minutes'`)).returning({ id: subscriptionPayments.id });
        void pending;
        const [activePayment] = await db.select({ id: subscriptionPayments.id }).from(subscriptionPayments).where(and(eq(subscriptionPayments.invoiceId, Number(id)), eq(subscriptionPayments.status, "pending"))).limit(1);
        if (activePayment) throw new HttpError(409, "برای این فاکتور پرداخت در حال انجام است");
        const [r] = await db.update(subscriptionInvoices).set({ status: "void" }).where(and(eq(subscriptionInvoices.id, Number(id)), eq(subscriptionInvoices.status, "unpaid"))).returning();
        if (!r) throw new HttpError(400, "فقط فاکتور پرداخت‌نشده قابل ابطال است");
        await db.update(couponRedemptions).set({ status: "released" }).where(and(eq(couponRedemptions.invoiceId, r.id), eq(couponRedemptions.status, "reserved")));
        await audit(auth, "ابطال فاکتور", "invoice", r.number);
        return J({ item: r });
      }
      throw new HttpError(400, "عملیات نامعتبر است");
    }
  }

  /* --------------------------------------------------------- expenses */
  if (res === "expenses") {
    need(auth, "accounting");
    if (m === "GET") return J({ items: await db.select().from(platformExpenses).orderBy(desc(platformExpenses.date)).limit(300) });
    if (m === "POST") {
      const b = await readJson(req);
      const amount = num(b.amount);
      if (amount <= 0) throw new HttpError(400, "مبلغ هزینه را وارد کنید");
      const [row] = await db.insert(platformExpenses).values({ category: str(b.category, 60) || "سایر", amount, description: str(b.description, 300), date: date(b.date) ?? new Date(), createdBy: auth.user.name }).returning();
      await audit(auth, "ثبت هزینه", "expense", row.id, `${row.category}: ${amount}`);
      return J({ item: row }, 201);
    }
    if (m === "PATCH" && id) {
      const b = await readJson(req);
      const set: Record<string, unknown> = {};
      if (b.amount !== undefined) { if (num(b.amount) <= 0) throw new HttpError(400, "مبلغ نامعتبر است"); set.amount = num(b.amount); }
      if (typeof b.category === "string") set.category = str(b.category, 60) || "سایر";
      if (typeof b.description === "string") set.description = str(b.description, 300);
      if (b.date) set.date = date(b.date);
      if (!Object.keys(set).length) throw new HttpError(400, "تغییری ارسال نشد");
      const [row] = await db.update(platformExpenses).set(set).where(eq(platformExpenses.id, Number(id))).returning();
      if (!row) throw new HttpError(404, "پیدا نشد");
      return J({ item: row });
    }
    if (m === "DELETE" && id) {
      const [row] = await db.delete(platformExpenses).where(eq(platformExpenses.id, Number(id))).returning();
      if (!row) throw new HttpError(404, "پیدا نشد");
      await audit(auth, "حذف هزینه", "expense", row.id, `${row.category}: ${row.amount}`);
      return J({ ok: true });
    }
  }

  /* -------------------------------------------- accounting report */
  if (res === "accounting" && m === "GET") {
    need(auth, "accounting");
    const jy = num(q.get("year"), toJ(new Date()).jy);
    const yr = jYearRange(jy);
    const inv = await db.select({ i: subscriptionInvoices, name: businesses.name }).from(subscriptionInvoices).innerJoin(businesses, eq(businesses.id, subscriptionInvoices.businessId)).where(or(eq(subscriptionInvoices.status, "unpaid"), and(eq(subscriptionInvoices.status, "paid"), gte(subscriptionInvoices.paidAt, yr.start))!)!);
    const exp = await db.select().from(platformExpenses).where(gte(platformExpenses.date, yr.start));
    const months = Array.from({ length: 12 }, (_, k) => ({ month: k + 1, revenue: 0, expenses: 0, invoices: 0 }));
    const byPlan: Record<string, { amount: number; n: number }> = {}, byMethod: Record<string, number> = {}, byCat: Record<string, number> = {};
    let revenue = 0, expenses = 0;
    for (const { i } of inv) {
      if (i.status !== "paid" || !i.paidAt || i.paidAt > yr.end) continue;
      const t = toJ(i.paidAt);
      months[t.jm - 1].revenue += i.amount; months[t.jm - 1].invoices++;
      revenue += i.amount;
      (byPlan[i.plan] ??= { amount: 0, n: 0 }).amount += i.amount; byPlan[i.plan].n++;
      byMethod[i.method || "other"] = (byMethod[i.method || "other"] ?? 0) + i.amount;
    }
    for (const e of exp) { if (e.date > yr.end) continue; months[toJ(e.date).jm - 1].expenses += e.amount; expenses += e.amount; byCat[e.category] = (byCat[e.category] ?? 0) + e.amount; }
    const unpaid = inv.filter(({ i }) => i.status === "unpaid").map(({ i, name }) => ({ id: i.id, number: i.number, businessName: name, plan: i.plan, amount: i.amount, createdAt: i.createdAt }));
    return J({ year: jy, revenue, expenses, net: revenue - expenses, months, byPlan, byMethod, byCategory: Object.entries(byCat).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount), unpaid, unpaidTotal: unpaid.reduce((s, u) => s + u.amount, 0) });
  }

  /* --------------------------------------------------------- tickets */
  if (res === "agents" && m === "GET") {
    need(auth, "tickets");
    const rows = await db.select({ id: users.id, name: users.name, dept: users.staffRole }).from(users).where(and(eq(users.role, "admin"), eq(users.isActive, true)));
    return J({ items: rows.map((r) => ({ id: r.id, name: r.name, dept: r.dept ?? "super" })) });
  }
  if (res === "tickets") {
    need(auth, "tickets");
    if (m === "GET" && !id) {
      const conds = [] as any[];
      if (q.get("dept")) conds.push(eq(tickets.department, q.get("dept")!));
      if (q.get("status")) conds.push(eq(tickets.status, q.get("status")!));
      const asg = q.get("assigned");
      if (asg === "me") conds.push(eq(tickets.assignedTo, auth.user.id)); else if (asg === "none") conds.push(sql`${tickets.assignedTo} is null`);
      const term = (q.get("q") ?? "").trim();
      if (term) conds.push(or(ilike(tickets.subject, `%${term}%`), ilike(businesses.name, `%${term}%`), eq(tickets.id, Number(term) || -1))!);
      const rows = await db.select({ t: tickets, biz: businesses.name, agent: users.name }).from(tickets).innerJoin(businesses, eq(businesses.id, tickets.businessId)).leftJoin(users, eq(users.id, tickets.assignedTo)).where(conds.length ? and(...conds) : undefined).orderBy(desc(tickets.updatedAt)).limit(300);
      const msgs = rows.length ? await db.select().from(ticketMessages).where(and(inArray(ticketMessages.ticketId, rows.map((r) => r.t.id)), eq(ticketMessages.internal, false))).orderBy(asc(ticketMessages.id)) : [];
      const counts = await db.select({ dept: tickets.department, st: tickets.status, n: sql<number>`count(*)::int` }).from(tickets).groupBy(tickets.department, tickets.status);
      return J({ items: rows.map((r) => { const mm = msgs.filter((x) => x.ticketId === r.t.id); const last = mm[mm.length - 1]; return { ...r.t, businessName: r.biz, agentName: r.agent ?? "", messageCount: mm.length, lastMessage: last?.body ?? "", lastFrom: last?.authorRole ?? "" }; }), counts });
    }
    if (m === "GET" && id) {
      const [r] = await db.select({ t: tickets, biz: businesses, agent: users.name }).from(tickets).innerJoin(businesses, eq(businesses.id, tickets.businessId)).leftJoin(users, eq(users.id, tickets.assignedTo)).where(eq(tickets.id, Number(id)));
      if (!r) throw new HttpError(404, "تیکت پیدا نشد");
      const messages = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, r.t.id)).orderBy(asc(ticketMessages.id));
      const prev = await db.select({ id: tickets.id, subject: tickets.subject, status: tickets.status }).from(tickets).where(and(eq(tickets.businessId, r.biz.id), ne(tickets.id, r.t.id))).orderBy(desc(tickets.id)).limit(5);
      return J({ ticket: { ...r.t, agentName: r.agent ?? "", businessName: r.biz.name, businessSlug: r.biz.slug, plan: r.biz.plan }, messages, others: prev });
    }
    if (m === "PATCH" && id) {
      const b = await readJson(req);
      const [t] = await db.select().from(tickets).where(eq(tickets.id, Number(id)));
      if (!t) throw new HttpError(404, "تیکت پیدا نشد");
      const name = auth.user.name;
      const set: Record<string, unknown> = { updatedAt: new Date() };
      const ev: (typeof ticketMessages.$inferInsert)[] = [];
      let transferred = false;
      if (typeof b.department === "string" && b.department !== t.department) {
        if (!(b.department in TICKET_DEPTS)) throw new HttpError(400, "دپارتمان نامعتبر است");
        const reason = str(b.transferNote, 300);
        ev.push({ ticketId: t.id, authorRole: "system", authorName: name, internal: false, body: `تیکت از «${TICKET_DEPTS[t.department]?.label ?? t.department}» به «${TICKET_DEPTS[b.department].label}» ارجاع شد (توسط ${name})${reason ? ` — ${reason}` : ""}` });
        set.department = b.department; set.assignedTo = null; transferred = true;
        if (t.status === "closed") set.status = "open";
      }
      if ("assignedTo" in b && (!transferred || b.assignedTo)) {
        if (b.assignedTo === null || b.assignedTo === "") { if (t.assignedTo) { set.assignedTo = null; ev.push({ ticketId: t.id, authorRole: "system", authorName: name, internal: true, body: `${name} تخصیص تیکت را برداشت` }); } }
        else {
          const [ag] = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.id, Number(b.assignedTo)), eq(users.role, "admin"), eq(users.isActive, true)));
          if (!ag) throw new HttpError(400, "کارشناس نامعتبر است");
          if (ag.id !== t.assignedTo) { set.assignedTo = ag.id; ev.push({ ticketId: t.id, authorRole: "system", authorName: name, internal: true, body: ag.id === auth.user.id ? `${name} تیکت را برعهده گرفت` : `تیکت توسط ${name} به ${ag.name} تخصیص یافت` }); }
        }
      }
      const note = str(b.note, 3000);
      if (note) ev.push({ ticketId: t.id, authorRole: "note", authorName: name, internal: true, body: note });
      const reply = str(b.reply, 3000);
      if (reply) {
        ev.push({ ticketId: t.id, authorRole: "support", authorName: name, internal: false, body: reply });
        set.status = "answered";
        if (!t.assignedTo && !("assignedTo" in set)) set.assignedTo = auth.user.id;
      }
      if (["open", "answered", "closed"].includes(String(b.status))) { set.status = b.status; if (b.status === "closed" && t.status !== "closed") ev.push({ ticketId: t.id, authorRole: "system", authorName: name, internal: false, body: `تیکت توسط ${name} بسته شد` }); }
      if (["low", "normal", "high"].includes(String(b.priority))) set.priority = b.priority;
      if (ev.length) await db.insert(ticketMessages).values(ev);
      const [row] = await db.update(tickets).set(set).where(eq(tickets.id, t.id)).returning();
      if (transferred) await audit(auth, "ارجاع تیکت", "ticket", t.id, `${t.department} → ${set.department}`);
      return J({ item: row });
    }
  }

  /* ----------------------------------------------------------- users */
  if (res === "users") {
    need(auth, "users");
    if (m === "GET") {
      const conds = [] as any[];
      if (q.get("role")) conds.push(eq(users.role, q.get("role")!));
      const term = (q.get("q") ?? "").trim();
      if (term) conds.push(or(ilike(users.name, `%${term}%`), ilike(users.email, `%${term}%`))!);
      const rows = await db.select({ u: users, biz: businesses.name }).from(users).leftJoin(businesses, or(eq(businesses.userId, users.id), eq(businesses.id, users.businessId))).where(conds.length ? and(...conds) : undefined).orderBy(asc(users.id)).limit(400);
      return J({ items: rows.map((r) => ({ id: r.u.id, name: r.u.name, email: r.u.email, role: r.u.role, dept: r.u.staffRole, isActive: r.u.isActive, createdAt: r.u.createdAt, businessName: r.biz ?? "" })) });
    }
    if (m === "POST" && !id) {
      const b = await readJson(req);
      const name = str(b.name, 80), email = str(b.email, 120).toLowerCase(), password = String(b.password ?? "") || genPassword(), dept = String(b.dept);
      if (!name || !EMAIL.test(email)) throw new HttpError(400, "نام و ایمیل معتبر لازم است");
      if (!(dept in ADMIN_DEPTS)) throw new HttpError(400, "دپارتمان نامعتبر است");
      if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد");
      const [u] = await db.insert(users).values({ name, email, passwordHash: hashPassword(password), role: "admin", staffRole: dept, businessId: auth.business.id }).returning();
      await audit(auth, "افزودن عضو تیم مدیریت", "user", u.id, `${name} · ${dept}`);
      return J({ item: { id: u.id, email, password } }, 201);
    }
    if (m === "PATCH" && id) {
      const b = await readJson(req);
      const [u] = await db.select().from(users).where(eq(users.id, Number(id)));
      if (!u) throw new HttpError(404, "کاربر پیدا نشد");
      if (u.id === auth.user.id && (b.isActive === false || b.dept)) throw new HttpError(400, "نمی‌توانید وضعیت یا دپارتمان خودتان را تغییر دهید");
      const set: Record<string, unknown> = {};
      let generated: string | undefined;
      if (typeof b.isActive === "boolean") set.isActive = b.isActive;
      if (typeof b.name === "string" && b.name.trim()) set.name = str(b.name, 80);
      if (b.dept !== undefined) { if (u.role !== "admin" || !(String(b.dept) in ADMIN_DEPTS)) throw new HttpError(400, "دپارتمان نامعتبر است"); set.staffRole = String(b.dept); }
      if (b.resetPassword || b.password) {
        generated = str(b.password, 100) || genPassword();
        if (generated.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد");
        set.passwordHash = hashPassword(generated);
      }
      if (!Object.keys(set).length) throw new HttpError(400, "تغییری ارسال نشد");
      await db.update(users).set(set).where(eq(users.id, u.id));
      if (set.isActive === false || set.passwordHash) await db.delete(sessions).where(eq(sessions.userId, u.id));
      await audit(auth, "ویرایش کاربر", "user", u.id, `${u.email}: ${Object.keys(set).filter((k) => k !== "passwordHash").join("، ")}${set.passwordHash ? " + رمز" : ""}`);
      return J({ ok: true, password: generated });
    }
    if (m === "DELETE" && id) {
      const [u] = await db.select().from(users).where(eq(users.id, Number(id)));
      if (!u || u.role !== "admin") throw new HttpError(400, "فقط اعضای تیم مدیریت قابل حذف هستند");
      if (u.id === auth.user.id) throw new HttpError(400, "نمی‌توانید خودتان را حذف کنید");
      const [owner] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.userId, u.id));
      if (owner) throw new HttpError(400, "این حساب مالک یک کسب‌وکار است و قابل حذف نیست");
      await db.update(tickets).set({ assignedTo: null }).where(eq(tickets.assignedTo, u.id));
      await db.delete(users).where(eq(users.id, u.id));
      await audit(auth, "حذف عضو تیم مدیریت", "user", u.id, u.email);
      return J({ ok: true });
    }
  }

  /* --------------------------------------------------- announcements */
  if (res === "announcements") {
    need(auth, "announcements");
    if (m === "GET") return J({ items: await db.select().from(announcements).orderBy(desc(announcements.id)).limit(100) });
    if (m === "POST" || (m === "PATCH" && id)) {
      const b = await readJson(req);
      const set: Record<string, unknown> = {};
      if (m === "POST" || b.title !== undefined) { const t = str(b.title, 120); if (!t) throw new HttpError(400, "عنوان اطلاعیه را وارد کنید"); set.title = t; }
      if (b.body !== undefined) set.body = str(b.body, 1000);
      if (["info", "warning", "success"].includes(String(b.level))) set.level = b.level;
      if (b.audience !== undefined) { if (!/^(all|plan:(basic|premium|premium_plus))$/.test(String(b.audience))) throw new HttpError(400, "مخاطب نامعتبر است"); set.audience = b.audience; }
      if ("expiresAt" in b) set.expiresAt = date(b.expiresAt);
      if (typeof b.isActive === "boolean") set.isActive = b.isActive;
      if (m === "POST") { const [row] = await db.insert(announcements).values({ ...(set as any), createdBy: auth.user.name }).returning(); await audit(auth, "ثبت اطلاعیه", "announcement", row.id, row.title); return J({ item: row }, 201); }
      const [row] = await db.update(announcements).set(set).where(eq(announcements.id, Number(id))).returning();
      if (!row) throw new HttpError(404, "پیدا نشد");
      return J({ item: row });
    }
    if (m === "DELETE" && id) {
      const [row] = await db.delete(announcements).where(eq(announcements.id, Number(id))).returning();
      if (!row) throw new HttpError(404, "پیدا نشد");
      await audit(auth, "حذف اطلاعیه", "announcement", row.id, row.title);
      return J({ ok: true });
    }
  }

  /* -------------------------------------------------------- settings */
  if (res === "settings") {
    if (m === "GET") {
      need(auth, "settings");
      const prices = await getSetting<Record<string, { price?: number; oldPrice?: number }>>("planPrices", {});
      const payments = await getSetting("platformPayments", { zarinpalEnabled: false, zarinpalMerchantId: "", zibalEnabled: false, zibalMerchantId: "" });
      const sms = await getPlatformSms();
      return J({ support: await getSupport(), managerNotifications: await getManagerNotifications(), billing: await getBilling(), platformBranding: await getPlatformBranding(), plans: await getPlanList(), planPrices: prices,
        platformPayments: payments,
        platformSms: { ...sms, smsirApiKey: "", kavenegarApiKey: "", hasSmsirKey: !!sms.smsirApiKey, hasKavenegarKey: !!sms.kavenegarApiKey },
      });
    }
    if (m === "POST") {
      const b = await readJson(req);
      const v = (b.value && typeof b.value === "object" ? b.value : {}) as Record<string, unknown>;
      if (b.key === "platformBranding") {
        need(auth, "settings");
        const siteName = str(v.siteName, 80);
        const logoUrl = str(v.logoUrl, 64);
        if (siteName.length < 2) throw new HttpError(400, "نام سامانه باید حداقل دو نویسه باشد");
        if (logoUrl && !/^\/api\/files\/[a-f0-9]{24}$/.test(logoUrl)) throw new HttpError(400, "لوگوی سامانه باید از بخش بارگذاری انتخاب شود");
        await setSetting("platformBranding", { siteName, logoUrl });
      }
      else if (b.key === "managerNotifications") {
        need(auth, "settings");
        const phone = str(v.phone, 40);
        if (phone && !normalizedPhone(phone)) throw new HttpError(400, "شماره اطلاع‌رسانی مدیر معتبر نیست");
        await setSetting("managerNotifications", { phone });
      }
      else if (b.key === "support") { need(auth, "settings"); await setSetting("support", { phone: str(v.phone, 40), email: str(v.email, 120), hours: str(v.hours, 80) }); }
      else if (b.key === "billing") { if (!adminCan(auth, "settings") && !adminCan(auth, "accounting")) throw new HttpError(403, "دسترسی ندارید"); await setSetting("billing", { bank: str(v.bank, 60), owner: str(v.owner, 80), card: str(v.card, 30), sheba: str(v.sheba, 40), note: str(v.note, 400) }); }
      else if (b.key === "planPrices") {
        need(auth, "plans");
        const out: Record<string, Record<string, number>> = {};
        for (const k of PLAN_KEYS) {
          const p = v[k] as Record<string, unknown> | undefined;
          if (!p || typeof p !== "object" || ["oldPrice", "sixMonthPrice", "sixMonthDiscount", "annualDiscount"].some(key => typeof p[key] !== "number")) throw new HttpError(400, "قیمت و تخفیف همه دوره‌ها را وارد کنید");
          const values = Object.fromEntries(["price", "oldPrice", "sixMonthPrice", "sixMonthDiscount", "annualDiscount"].map(key => [key, Number(p[key] ?? 0)]));
          if (Object.values(values).some(n => !Number.isFinite(n) || n < 0 || n > 2000000000) || values.sixMonthDiscount > 100 || values.annualDiscount > 100) throw new HttpError(400, "قیمت نامعتبر است؛ تخفیف باید بین صفر و صد باشد");
          out[k] = values;
        }
        await setSetting("planPrices", out);
      } else if (b.key === "platformPayments") {
        need(auth, "settings");
        const value = { zarinpalEnabled: Boolean(v.zarinpalEnabled), zarinpalMerchantId: str(v.zarinpalMerchantId, 80), zibalEnabled: Boolean(v.zibalEnabled), zibalMerchantId: str(v.zibalMerchantId, 80) };
        if (value.zarinpalEnabled && !value.zarinpalMerchantId || value.zibalEnabled && !value.zibalMerchantId) throw new HttpError(400, "شناسه پذیرنده هر درگاه فعال را وارد کنید");
        await setSetting("platformPayments", value);
      } else if (b.key === "platformSms") {
        need(auth, "settings");
        const old = await getPlatformSms();
        const provider = v.provider === "smsir" ? "smsir" : "kavenegar";
        const templates = {} as PlatformSmsConfig["templates"];
        for (const key of ["otp", "renewal", "occasion", "adminAlert"] as const) {
          const raw = (v.templates as any)?.[key] ?? {};
          const defaults = key === "otp" ? ["code"] : key === "renewal" ? ["business", "plan", "days"] : key === "occasion" ? ["business", "plan", "occasion"] : ["event", "name", "phone", "details"];
          const params = Array.isArray(raw.params) ? raw.params.map((x: unknown) => str(x, 30).replace(/[^a-zA-Z0-9_]/g, "")).filter(Boolean).slice(0, 5) : defaults;
          const smsirId = str(raw.smsirId, 30);
          if (smsirId && !/^\d+$/.test(smsirId)) throw new HttpError(400, "شناسه الگوی sms.ir باید عددی باشد");
          templates[key] = { kavenegarId: str(raw.kavenegarId, 100), smsirId, params };
        }
        const smsirApiKey = v.clearSmsirKey ? "" : str(v.smsirApiKey, 500) || old.smsirApiKey;
        const kavenegarApiKey = v.clearKavenegarKey ? "" : str(v.kavenegarApiKey, 500) || old.kavenegarApiKey;
        const renewalDays = Math.min(60, Math.max(1, num(v.renewalDays, 7)));
        await setSetting("platformSms", { enabled: Boolean(v.enabled), provider, smsirApiKey, kavenegarApiKey, renewalDays, templates });
      } else throw new HttpError(400, "کلید نامعتبر است");
      await audit(auth, "ویرایش تنظیمات سامانه", "settings", String(b.key), b.key === "platformSms" ? `درگاه فعال: ${str(v.provider, 20)}` : "");
      return J({ ok: true });
    }
  }

  /* --------------------------------------------------------- website content */
  if (res === "content") {
    need(auth, "content");
    const collection = id;
    const table = collection === "posts" ? blogPosts : collection === "tutorials" ? tutorials : collection === "faqs" ? faqs : collection === "testimonials" ? testimonials : null;
    if (!table) throw new HttpError(404, "بخش محتوا پیدا نشد");
    if (m === "GET" && !act) {
      const items = collection === "posts" || collection === "tutorials"
        ? await db.select().from(table).orderBy(desc((table as any).updatedAt ?? (table as any).id)).limit(500)
        : await db.select().from(table).orderBy(asc((table as any).sortOrder ?? (table as any).id)).limit(500);
      return J({ items });
    }
    if ((m === "POST" && !act) || (m === "PATCH" && act)) {
      const b = await readJson(req);
      const title = str(b.title, 180);
      if (collection === "posts" || collection === "tutorials") {
        const slug = str(b.slug, 120).toLowerCase();
        if (!title || !SLUG.test(slug)) throw new HttpError(400, "عنوان و نشانی انگلیسی معتبر با خط تیره وارد کنید");
        const status = b.status === "published" ? "published" : "draft";
        const publishedAt = status === "published" ? (date(b.publishedAt) ?? new Date()) : null;
        const common = { slug, title, status, publishedAt, updatedAt: new Date(), metaTitle: str(b.metaTitle, 180), metaDescription: str(b.metaDescription, 320), noIndex: Boolean(b.noIndex), category: str(b.category, 80) || (collection === "posts" ? "عمومی" : "راهنمای شروع"), coverImage: publicUrl(b.coverImage) };
        const values = collection === "posts"
          ? { ...common, excerpt: str(b.excerpt, 600), content: str(b.content, 60000), author: str(b.author, 100) || "تیم منوی دیجیتال", canonicalUrl: publicUrl(b.canonicalUrl), tags: Array.isArray(b.tags) ? [...new Set(b.tags.map((x: unknown) => str(x, 40)).filter(Boolean))].slice(0, 20) : [] }
          : { ...common, summary: str(b.summary, 600), content: str(b.content, 60000), videoUrl: publicUrl(b.videoUrl), sortOrder: Math.max(0, num(b.sortOrder)) };
        if (collection === "posts" && b.canonicalUrl && !(values as any).canonicalUrl) throw new HttpError(400, "نشانی canonical باید URL امن http یا https باشد");
        if (collection === "tutorials" && b.videoUrl && !(values as any).videoUrl) throw new HttpError(400, "نشانی ویدیو معتبر نیست");
        const [row] = m === "POST"
          ? await db.insert(table).values(values as any).returning()
          : await db.update(table).set(values as any).where(eq((table as any).id, Number(act))).returning();
        if (!row) throw new HttpError(404, "محتوا پیدا نشد");
        await audit(auth, m === "POST" ? "ایجاد محتوای سایت" : "ویرایش محتوای سایت", collection, row.id, title);
        return J({ item: row }, m === "POST" ? 201 : 200);
      }
      if (collection === "faqs") {
        const values = { question: str(b.question, 400), answer: str(b.answer, 6000), category: str(b.category, 80) || "عمومی", isPublished: b.isPublished !== false, sortOrder: Math.max(0, num(b.sortOrder)) };
        if (!values.question || !values.answer) throw new HttpError(400, "پرسش و پاسخ را وارد کنید");
        const [row] = m === "POST" ? await db.insert(faqs).values(values).returning() : await db.update(faqs).set(values).where(eq(faqs.id, Number(act))).returning();
        if (!row) throw new HttpError(404, "پرسش پیدا نشد");
        await audit(auth, m === "POST" ? "ایجاد سوال متداول" : "ویرایش سوال متداول", "faq", row.id, values.question);
        return J({ item: row }, m === "POST" ? 201 : 200);
      }
      const values = { name: str(b.name, 100), title: str(b.title, 120), businessName: str(b.businessName, 120), body: str(b.body, 2000), rating: Math.min(5, Math.max(1, num(b.rating, 5))), imageUrl: publicUrl(b.imageUrl), isPublished: Boolean(b.isPublished), sortOrder: Math.max(0, num(b.sortOrder)) };
      if (!values.name || !values.body) throw new HttpError(400, "نام و متن نظر را وارد کنید");
      const [row] = m === "POST" ? await db.insert(testimonials).values(values).returning() : await db.update(testimonials).set(values).where(eq(testimonials.id, Number(act))).returning();
      if (!row) throw new HttpError(404, "نظر پیدا نشد");
      await audit(auth, m === "POST" ? "ایجاد نظر مشتری" : "ویرایش نظر مشتری", "testimonial", row.id, values.name);
      return J({ item: row }, m === "POST" ? 201 : 200);
    }
    if (m === "DELETE" && act) {
      const [row] = await db.delete(table).where(eq((table as any).id, Number(act))).returning({ id: (table as any).id });
      if (!row) throw new HttpError(404, "محتوا پیدا نشد");
      await audit(auth, "حذف محتوای سایت", collection, row.id);
      return J({ ok: true });
    }
  }

  /* --------------------------------------------------------- inbound leads */
  if (res === "leads") {
    need(auth, "tickets");
    if (m === "GET" && !id) {
      const conditions = [] as any[];
      if (q.get("status")) conditions.push(eq(leadRequests.status, q.get("status")!));
      if (q.get("kind")) conditions.push(eq(leadRequests.kind, q.get("kind")!));
      return J({ items: await db.select().from(leadRequests).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(leadRequests.createdAt)).limit(500) });
    }
    if (m === "PATCH" && id) {
      const b = await readJson(req);
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (b.status !== undefined) {
        if (!["new", "contacted", "qualified", "closed"].includes(String(b.status))) throw new HttpError(400, "وضعیت درخواست معتبر نیست");
        set.status = String(b.status);
      }
      if (b.assignedTo !== undefined) set.assignedTo = b.assignedTo === null || b.assignedTo === "" ? null : num(b.assignedTo);
      if (typeof b.adminNote === "string") set.adminNote = str(b.adminNote, 1200);
      const [row] = await db.update(leadRequests).set(set).where(eq(leadRequests.id, Number(id))).returning();
      if (!row) throw new HttpError(404, "درخواست پیدا نشد");
      await audit(auth, "پیگیری درخواست وب‌سایت", "lead", row.id, row.status);
      return J({ item: row });
    }
  }

  /* --------------------------------------------------------- affiliate program */
  if (res === "affiliates") {
    need(auth, "affiliates");
    if (m === "GET" && !id) {
      const rows = await db.select({ id: affiliates.id, name: affiliates.name, email: affiliates.email, phone: affiliates.phone, status: affiliates.status, referralCode: affiliates.referralCode, channel: affiliates.channel, website: affiliates.website, introduction: affiliates.introduction, commissionPercent: affiliates.commissionPercent, attributionDays: affiliates.attributionDays, minimumWithdrawal: affiliates.minimumWithdrawal, bankName: affiliates.bankName, accountHolder: affiliates.accountHolder, cardNumber: affiliates.cardNumber, sheba: affiliates.sheba, createdAt: affiliates.createdAt, approvedAt: affiliates.approvedAt }).from(affiliates).orderBy(desc(affiliates.createdAt)).limit(500);
      const balances = await db.select({ affiliateId: affiliateWalletEntries.affiliateId, amount: sql<number>`coalesce(sum(${affiliateWalletEntries.amount}),0)::bigint` }).from(affiliateWalletEntries).groupBy(affiliateWalletEntries.affiliateId);
      const totals = new Map(balances.map(x => [x.affiliateId, Number(x.amount)]));
      return J({ items: rows.map(x => ({ ...x, balance: totals.get(x.id) ?? 0 })) });
    }
    if (m === "PATCH" && id) {
      const b = await readJson(req);
      const set: Record<string, unknown> = {};
      if (b.status !== undefined) {
        if (!["pending", "active", "rejected", "suspended"].includes(String(b.status))) throw new HttpError(400, "وضعیت همکار فروش معتبر نیست");
        set.status = String(b.status);
        if (b.status === "active") set.approvedAt = new Date();
      }
      if (b.commissionPercent !== undefined) {
        const p = num(b.commissionPercent, -1);
        if (p < 0 || p > 50) throw new HttpError(400, "پورسانت باید بین صفر تا ۵۰ درصد باشد");
        set.commissionPercent = p;
      }
      if (b.attributionDays !== undefined) {
        const n = num(b.attributionDays, -1);
        if (n < 1 || n > 365) throw new HttpError(400, "مدت انتساب باید بین ۱ تا ۳۶۵ روز باشد");
        set.attributionDays = n;
      }
      if (b.minimumWithdrawal !== undefined) set.minimumWithdrawal = Math.max(0, num(b.minimumWithdrawal));
      if (!Object.keys(set).length) throw new HttpError(400, "تغییری برای ذخیره ارسال نشد");
      const [row] = await db.update(affiliates).set(set).where(eq(affiliates.id, Number(id))).returning({ id: affiliates.id, name: affiliates.name, status: affiliates.status, commissionPercent: affiliates.commissionPercent, attributionDays: affiliates.attributionDays, minimumWithdrawal: affiliates.minimumWithdrawal, referralCode: affiliates.referralCode });
      if (!row) throw new HttpError(404, "همکار فروش پیدا نشد");
      await audit(auth, "ویرایش همکار فروش", "affiliate", row.id, `${row.name}: ${row.status}`);
      return J({ item: row });
    }
  }

  if (res === "affiliate-withdrawals") {
    need(auth, "affiliates");
    if (m === "GET" && !id) {
      const items = await db.select({ withdrawal: affiliateWithdrawals, affiliateName: affiliates.name, affiliateEmail: affiliates.email }).from(affiliateWithdrawals).innerJoin(affiliates, eq(affiliates.id, affiliateWithdrawals.affiliateId)).orderBy(desc(affiliateWithdrawals.createdAt)).limit(500);
      return J({ items: items.map(x => ({ ...x.withdrawal, affiliateName: x.affiliateName, affiliateEmail: x.affiliateEmail })) });
    }
    if (m === "PATCH" && id) {
      const b = await readJson(req);
      const action = String(b.action);
      if (!["pay", "reject"].includes(action)) throw new HttpError(400, "عملیات برداشت نامعتبر است");
      const done = await db.transaction(async tx => {
        const [current] = await tx.select().from(affiliateWithdrawals).where(eq(affiliateWithdrawals.id, Number(id))).for("update");
        if (!current) throw new HttpError(404, "درخواست برداشت پیدا نشد");
        if (current.status !== "pending") throw new HttpError(409, "این درخواست قبلاً بررسی شده است");
        const now = new Date();
        const [row] = await tx.update(affiliateWithdrawals).set({ status: action === "pay" ? "paid" : "rejected", payoutReference: str(b.payoutReference, 80), adminNote: str(b.adminNote, 600), decidedAt: now }).where(and(eq(affiliateWithdrawals.id, current.id), eq(affiliateWithdrawals.status, "pending"))).returning();
        if (!row) throw new HttpError(409, "درخواست هم‌زمان تغییر کرد");
        if (action === "reject") {
          await tx.insert(affiliateWalletEntries).values({ affiliateId: row.affiliateId, kind: "withdrawal_release", amount: row.amount, referenceType: "withdrawal", referenceId: row.id, description: "آزادسازی موجودی درخواست ردشده" }).onConflictDoNothing();
        } else {
          await tx.insert(platformAccountingDocuments).values({ sourceType: "affiliate_payout", sourceId: row.id, date: now, description: `پرداخت پورسانت همکار فروش #${row.affiliateId}`, debitAccount: "بدهی به بازاریاب", creditAccount: "بانک/صندوق", amount: row.amount, createdBy: auth.user.name }).onConflictDoNothing();
        }
        return row;
      });
      await audit(auth, action === "pay" ? "پرداخت برداشت همکار فروش" : "رد درخواست برداشت", "affiliate_withdrawal", done.id, `${done.amount} تومان`);
      return J({ item: done });
    }
  }

  if (res === "accounting-documents" && m === "GET") {
    need(auth, "accounting");
    const items = await db.select({ document: platformAccountingDocuments, sourceRef: platformAccountingDocuments.sourceId }).from(platformAccountingDocuments).orderBy(desc(platformAccountingDocuments.date)).limit(500);
    return J({ items: items.map(x => x.document) });
  }

  /* ----------------------------------------------------------- audit */
  if (res === "audit" && m === "GET") {
    need(auth, "audit");
    const term = (q.get("q") ?? "").trim();
    const rows = await db.select().from(adminAudit).where(term ? or(ilike(adminAudit.action, `%${term}%`), ilike(adminAudit.detail, `%${term}%`), ilike(adminAudit.adminName, `%${term}%`)) : undefined).orderBy(desc(adminAudit.id)).limit(300);
    return J({ items: rows });
  }

  throw new HttpError(404, "پیدا نشد");
}

/** Mark an invoice paid and extend the subscription. */
async function payInvoice(auth: AuthContext, id: number, method: string, refNo: string, paidAt: Date | null) {
  return settleInvoice(auth, id, method, refNo, paidAt);
}

export async function settleSubscriptionInvoice(id: number, method: string, refNo: string, paymentId?: string) {
  return settleInvoice(null, id, method, refNo, new Date(), paymentId);
}

async function settleInvoice(auth: AuthContext | null, id: number, method: string, refNo: string, paidAt: Date | null, paymentId?: string) {
  const result = await db.transaction(async (tx) => {
    if (!paymentId) await tx.update(subscriptionPayments).set({ status: "failed", detail: "مهلت پرداخت پایان یافت" }).where(and(eq(subscriptionPayments.invoiceId, id), eq(subscriptionPayments.status, "pending"), sql`${subscriptionPayments.createdAt} < now() - interval '30 minutes'`));
    const [payment] = paymentId ? await tx.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, paymentId)).for("update") : [];
    if (paymentId && (!payment || payment.status !== "pending")) throw new HttpError(409, "این پرداخت قبلاً بررسی شده است");
    const [inv] = await tx.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.id, id)).for("update");
    if (!inv) throw new HttpError(404, "فاکتور پیدا نشد");
    if (inv.status !== "unpaid") throw new HttpError(400, inv.status === "paid" ? "این فاکتور قبلاً پرداخت شده است" : "این فاکتور باطل شده است");
    if (!paymentId) {
      const [activePayment] = await tx.select({ id: subscriptionPayments.id }).from(subscriptionPayments).where(and(eq(subscriptionPayments.invoiceId, inv.id), eq(subscriptionPayments.status, "pending"))).limit(1);
      if (activePayment) throw new HttpError(409, "برای این فاکتور پرداخت آنلاین در حال انجام است");
    }
    if (payment && (payment.invoiceId !== inv.id || payment.amount !== inv.amount)) throw new HttpError(409, "مبلغ یا فاکتور پرداخت با فاکتور فعلی هم‌خوانی ندارد");
    const [biz] = await tx.select().from(businesses).where(eq(businesses.id, inv.businessId));
    if (!biz) throw new HttpError(404, "کسب‌وکار پیدا نشد");
    const [owner] = await tx.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, biz.userId)).limit(1);
    const now = paidAt ?? new Date();
    const from = biz.subscriptionEndsAt && biz.subscriptionEndsAt > now && biz.plan === inv.plan ? biz.subscriptionEndsAt : now;
    const end = addMonths(from, inv.months);
    const [row] = await tx.update(subscriptionInvoices).set({ status: "paid", method, refNo, paidAt: now, periodStart: from, periodEnd: end }).where(and(eq(subscriptionInvoices.id, id), eq(subscriptionInvoices.status, "unpaid"))).returning();
    if (!row) throw new HttpError(409, "فاکتور هم‌زمان تغییر کرد");
    if (payment) {
      await tx.update(subscriptionPayments).set({ status: "paid", refNo, detail: "پرداخت توسط درگاه تأیید شد", verifiedAt: now }).where(eq(subscriptionPayments.id, payment.id));
      await tx.update(subscriptionPayments).set({ status: "failed", detail: "فاکتور با درگاه دیگری پرداخت شد" }).where(and(eq(subscriptionPayments.invoiceId, inv.id), eq(subscriptionPayments.status, "pending"), ne(subscriptionPayments.id, payment.id)));
    }
    await tx.update(businesses).set({ plan: inv.plan, subscriptionEndsAt: end, upgradeRequest: biz.upgradeRequest === inv.plan ? null : biz.upgradeRequest }).where(eq(businesses.id, biz.id));

    const [redemption] = await tx.update(couponRedemptions).set({ status: "redeemed" }).where(and(eq(couponRedemptions.invoiceId, inv.id), eq(couponRedemptions.status, "reserved"))).returning();
    if (redemption) await tx.update(promoCoupons).set({ redemptions: sql`${promoCoupons.redemptions} + 1` }).where(eq(promoCoupons.id, redemption.couponId));

    // Record affiliate commission only on a paid subscription invoice. The unique invoice key and
    // the surrounding transaction keep wallet and accounting entries exactly-once.
    if (biz.affiliateId && inv.amount > 0) {
      const [affiliate] = await tx.select().from(affiliates).where(and(eq(affiliates.id, biz.affiliateId), eq(affiliates.status, "active")));
      if (affiliate && affiliate.commissionPercent > 0) {
        const amount = Math.round(inv.amount * affiliate.commissionPercent / 100);
        if (amount > 0) {
          const [commission] = await tx.insert(affiliateCommissions).values({ affiliateId: affiliate.id, businessId: biz.id, invoiceId: inv.id, saleAmount: inv.amount, commissionPercent: affiliate.commissionPercent, amount }).onConflictDoNothing().returning();
          if (commission) {
            const description = `پورسانت ${affiliate.commissionPercent}٪ فاکتور اشتراک #${inv.number} · ${biz.name}`;
            await tx.insert(affiliateWalletEntries).values({ affiliateId: affiliate.id, kind: "commission", amount, referenceType: "commission", referenceId: commission.id, description });
            await tx.insert(platformExpenses).values({ category: "پورسانت فروش", amount, description, date: now, createdBy: "سیستم همکاری در فروش" });
            await tx.insert(platformAccountingDocuments).values({ sourceType: "affiliate_commission", sourceId: commission.id, date: now, description, debitAccount: "هزینه پورسانت فروش", creditAccount: "بدهی به بازاریاب", amount, createdBy: "سیستم" });
          }
        }
      }
    }
    return { row, biz, owner, end };
  });
  if (auth) await audit(auth, "ثبت پرداخت فاکتور", "invoice", result.row.number, `${result.biz.name} · ${result.row.plan} تا ${result.end.toISOString().slice(0, 10)}`);
  await notifyPlatformManager({ kind: "plan_sale", name: result.biz.name, phone: result.biz.phone || result.owner?.phone || "", details: `${planName(result.row.plan)} · ${result.row.months} ماهه · ${result.row.amount.toLocaleString("fa-IR")} تومان · فاکتور #${result.row.number}` });
  return result.row;
}
