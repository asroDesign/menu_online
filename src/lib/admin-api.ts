import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAudit, announcements, businesses, categories, customers, diningTables, planFeatures, platformExpenses, platformAccounts, platformJournals, platformJournalLines, platformBankStatementEntries, platformChecks, products, staff,
  subscriptionInvoices, subscriptionPayments, promoCoupons, couponRedemptions, ticketMessages, tickets, users, sessions, affiliates, affiliateCommissions, affiliateWalletEntries,
  affiliateWithdrawals, blogPosts, tutorials, faqs, testimonials, leadRequests, platformAccountingDocuments, trialGrants,
} from "@/db/schema";
import { getBilling, getManagerNotifications, getPlatformBranding, getPlanList, getSetting, getSupport, setSetting } from "@/lib/app-settings";
import { DEFAULT_BRAND_COLOR, normalizeBrandColor } from "@/lib/brand-color";
import { adminCan, adminDept, hashPassword, HttpError, readJson, startImpersonation, type AuthContext } from "@/lib/auth";
import { ADMIN_DEPTS, permsOf, TICKET_DEPTS, type AdminPerm } from "@/lib/admin-meta";
import { effectivePlan, getPlanOverrides, invalidatePlanCache } from "@/lib/entitlements";
import { jMonthRange, jYearRange, toJ } from "@/lib/jalali";
import { normalizeRichContent } from "@/lib/rich-document";
import { FEATURES, PLAN_KEYS, planName } from "@/lib/plans";
import { isBillingTerm } from "@/lib/plan-pricing";
import { getPlatformSms, notifyPlatformManager, type PlatformSmsConfig, normalizedPhone } from "@/lib/platform-sms";
import { expenseAccountCode, listPlatformJournal, paymentAccountCode, postPlatformJournal } from "@/lib/platform-ledger";

const J = (d: unknown, s = 200) => Response.json(d, { status: s });
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v: unknown, d = 0) => { if (v === null || v === undefined || v === "") return d; const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const moneyNum = (v: unknown) => { if (typeof v === "number") return num(v); if (typeof v !== "string") return 0; const digits = v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))); return num(digits.replace(/[^0-9.-]/g, "")); };
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
      const { settings: _s, ...pub } = r.b;
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

  /* ---------------------------------------- platform general ledger */
  if (res === "ledger") {
    need(auth, "accounting");
    if (id === "accounts" && m === "GET") {
      const from = date(q.get("from")), to = date(q.get("to"));
      const result: any = await db.execute(sql`SELECT a.code,a.name,a.parent_code AS "parentCode",a.level,a.kind,a.normal_balance AS "normalBalance",a.is_system AS "isSystem",a.is_active AS "isActive",
        coalesce(sum(CASE WHEN j.id IS NULL THEN 0 ELSE l.debit END),0)::float8 AS debit,coalesce(sum(CASE WHEN j.id IS NULL THEN 0 ELSE l.credit END),0)::float8 AS credit
        FROM platform_accounts a LEFT JOIN platform_journal_lines l ON l.account_code=a.code
        LEFT JOIN platform_journals j ON j.id=l.journal_id AND (${from}::timestamptz IS NULL OR j.date >= ${from}) AND (${to}::timestamptz IS NULL OR j.date < ${to})
        WHERE a.is_active=true GROUP BY a.code ORDER BY a.code`);
      return J({ items: result.rows.map((row: any) => ({ ...row, debit: Number(row.debit), credit: Number(row.credit), balance: Number(row.debit) - Number(row.credit) })) });
    }
    if (id === "accounts" && m === "POST") {
      const b = await readJson(req);
      const code = str(b.code, 24), name = str(b.name, 120), parentCode = str(b.parentCode, 24);
      const requestedKind = typeof b.kind === "string" ? b.kind : "";
      const kind = (["asset","liability","equity","revenue","expense"] as string[]).includes(requestedKind) ? requestedKind : "";
      if (!/^[0-9]{3,24}$/.test(code) || !name || !kind) throw new HttpError(400, "کد، عنوان و ماهیت معتبر حساب را وارد کنید");
      let level = "کل";
      if (parentCode) {
        const [parent] = await db.select().from(platformAccounts).where(eq(platformAccounts.code, parentCode));
        if (!parent || !parent.isActive || parent.kind !== kind || !code.startsWith(parentCode)) throw new HttpError(400, "حساب بالادستی فعال و هم‌ماهیت را انتخاب کنید؛ کد حساب باید زیرمجموعهٔ کد والد باشد");
        const levels = ["کل","معین","تفصیلی"], parentLevel = levels.indexOf(parent.level);
        if (parentLevel < 0 || parentLevel >= 2) throw new HttpError(400, "حساب تفصیلی دیگر حساب زیرمجموعه نمی‌پذیرد");
        level = levels[parentLevel + 1];
      } else level = "کل";
      const normalBalance = ["asset","expense"].includes(kind) ? "debit" : "credit";
      const [account] = await db.insert(platformAccounts).values({ code, name, parentCode: parentCode || null, level, kind, normalBalance, isSystem: false }).onConflictDoNothing().returning();
      if (!account) throw new HttpError(409, "کد حساب تکراری است");
      await audit(auth, "افزودن حساب سامانه", "platform_account", code, name);
      return J({ item: account }, 201);
    }
    if (id === "journals" && m === "GET") {
      const rows = await db.select({ id: platformJournals.id }).from(platformJournals).orderBy(desc(platformJournals.documentNo)).limit(300);
      if (!rows.length) return J({ items: [] });
      const journals = await db.select().from(platformJournals).where(inArray(platformJournals.id, rows.map((row) => row.id)));
      const lines = await db.select({ journalId: platformJournalLines.journalId, lineNo: platformJournalLines.lineNo, accountCode: platformJournalLines.accountCode, accountName: platformAccounts.name, description: platformJournalLines.description, debit: platformJournalLines.debit, credit: platformJournalLines.credit }).from(platformJournalLines).innerJoin(platformAccounts, eq(platformAccounts.code, platformJournalLines.accountCode)).where(inArray(platformJournalLines.journalId, rows.map((row) => row.id))).orderBy(asc(platformJournalLines.journalId), asc(platformJournalLines.lineNo));
      const lineMap = new Map<number, typeof lines>();
      for (const line of lines) lineMap.set(line.journalId, [...(lineMap.get(line.journalId) ?? []), line]);
      const journalMap = new Map(journals.map((journal) => [journal.id, journal]));
      return J({ items: rows.flatMap(({ id: journalId }) => { const journal = journalMap.get(journalId); return journal ? [{ ...journal, lines: lineMap.get(journalId) ?? [] }] : []; }) });
    }
    if (id === "journals" && m === "POST") {
      const b = await readJson(req);
      const description = str(b.description, 500);
      const docDate = date(b.date);
      const lines = Array.isArray(b.lines) ? b.lines.slice(0, 100).map((line: any) => ({ accountCode: str(line.accountCode, 24), description: str(line.description, 240), debit: num(line.debit), credit: num(line.credit) })) : [];
      if (!description || !docDate || lines.length < 2 || lines.some((line: any) => !line.accountCode || line.debit < 0 || line.credit < 0 || (line.debit > 0) === (line.credit > 0))) throw new HttpError(400, "تاریخ، شرح و حداقل دو ردیف معتبر لازم است");
      const debit = lines.reduce((sum: number, line: any) => sum + line.debit, 0), credit = lines.reduce((sum: number, line: any) => sum + line.credit, 0);
      if (debit <= 0 || debit !== credit) throw new HttpError(400, "جمع بدهکار و بستانکار باید برابر و بیشتر از صفر باشد");
      const journal = await db.transaction(async (tx) => {
        const item = await postPlatformJournal(tx, { date: docDate, description, sourceType: "manual", createdBy: auth.user.name, lines });
        if (!item) throw new HttpError(409, "سند مشابه قبلاً ثبت شده است");
        return listPlatformJournal(tx, item.id);
      });
      await audit(auth, "ثبت سند دستی حسابداری سامانه", "platform_journal", journal?.documentNo ?? "", description);
      return J({ item: journal }, 201);
    }
    if (id === "journals" && act && m === "PATCH") {
      const b = await readJson(req);
      if (b.action !== "reverse") throw new HttpError(400, "عملیات سند نامعتبر است");
      const journalId = Number(act);
      const journal = await db.transaction(async (tx) => {
        const [original] = await tx.select().from(platformJournals).where(eq(platformJournals.id, journalId)).for("update");
        if (!original || original.status !== "posted") throw new HttpError(409, "فقط سند قطعی و فعال قابل برگشت است");
        const originalLines = await tx.select().from(platformJournalLines).where(eq(platformJournalLines.journalId, journalId));
        const reversal = await postPlatformJournal(tx, { description: `برگشت سند #${original.documentNo} · ${original.description}`, date: new Date(), sourceType: "manual", reversalOf: original.id, createdBy: auth.user.name, lines: originalLines.map((line) => ({ accountCode: line.accountCode, description: `برگشت · ${line.description}`, debit: line.credit, credit: line.debit })) });
        if (!reversal) throw new HttpError(409, "سند برگشتی قبلاً ثبت شده است");
        await tx.update(platformJournals).set({ status: "reversed" }).where(eq(platformJournals.id, original.id));
        return listPlatformJournal(tx, reversal.id);
      });
      await audit(auth, "برگشت سند حسابداری سامانه", "platform_journal", journal?.documentNo ?? journalId);
      return J({ item: journal });
    }
    if (id === "cheques" && m === "GET") {
      const result: any = await db.execute(sql`SELECT c.id,c.direction,c.check_number AS "checkNumber",c.serial_number AS "serialNumber",c.bank_name AS "bankName",c.branch,c.party_name AS "partyName",c.party_phone AS "partyPhone",c.national_id AS "nationalId",c.issue_date AS "issueDate",c.due_date AS "dueDate",c.amount,c.bank_account_code AS "bankAccountCode",c.counter_account_code AS "counterAccountCode",c.status,c.journal_id AS "journalId",c.settlement_journal_id AS "settlementJournalId",c.note,c.created_by AS "createdBy",b.name AS "bankAccountName",x.name AS "counterAccountName",j.document_no AS "journalDocumentNo",s.document_no AS "settlementDocumentNo"
        FROM platform_checks c JOIN platform_accounts b ON b.code=c.bank_account_code JOIN platform_accounts x ON x.code=c.counter_account_code
        LEFT JOIN platform_journals j ON j.id=c.journal_id LEFT JOIN platform_journals s ON s.id=c.settlement_journal_id ORDER BY c.due_date DESC,c.id DESC LIMIT 1000`);
      return J({ items: result.rows });
    }
    if (id === "cheques" && m === "POST") {
      const b = await readJson(req), direction = b.direction === "received" || b.direction === "issued" ? b.direction : "";
      const checkNumber = str(b.checkNumber, 80), serialNumber = str(b.serialNumber, 80), bankName = str(b.bankName, 100), branch = str(b.branch, 120), partyName = str(b.partyName, 120), partyPhone = str(b.partyPhone, 32), nationalId = str(b.nationalId, 16), issueDate = date(b.issueDate), dueDate = date(b.dueDate), amount = moneyNum(b.amount), bankAccountCode = str(b.bankAccountCode, 24), counterAccountCode = str(b.counterAccountCode, 24), note = str(b.note, 500);
      if (!direction || !checkNumber || !bankName || !partyName || !issueDate || !dueDate || dueDate < issueDate || amount <= 0 || !bankAccountCode || !counterAccountCode) throw new HttpError(400, "نوع چک، شماره، بانک، طرف حساب، تاریخ‌ها، مبلغ و حساب‌های مرتبط را کامل کنید");
      const createdCheck = await db.transaction(async (tx) => {
        const [bank] = await tx.select().from(platformAccounts).where(and(eq(platformAccounts.code, bankAccountCode), eq(platformAccounts.kind, "asset"), eq(platformAccounts.isActive, true), eq(platformAccounts.level, "تفصیلی")));
        const [bankChild] = await tx.select({ code: platformAccounts.code }).from(platformAccounts).where(eq(platformAccounts.parentCode, bankAccountCode)).limit(1);
        const [counter] = await tx.select().from(platformAccounts).where(and(eq(platformAccounts.code, counterAccountCode), eq(platformAccounts.isActive, true)));
        const [counterChild] = await tx.select({ code: platformAccounts.code }).from(platformAccounts).where(eq(platformAccounts.parentCode, counterAccountCode)).limit(1);
        if (!bank || bankChild || !counter || counterChild || ["10302","20201"].includes(counterAccountCode)) throw new HttpError(400, "حساب بانکی یا حساب مقابل باید فعال و در آخرین سطح کدینگ باشد");
        const [check] = await tx.insert(platformChecks).values({ direction, checkNumber, serialNumber, bankName, branch, partyName, partyPhone, nationalId, issueDate, dueDate, amount, bankAccountCode, counterAccountCode, note, createdBy: auth.user.name }).returning();
        const entry = await postPlatformJournal(tx, { sourceType: "platform_check", sourceId: check.id, date: issueDate, description: `${direction === "received" ? "دریافت" : "صدور"} چک ${checkNumber} · ${partyName}`, createdBy: auth.user.name, lines: direction === "received" ? [{ accountCode: "10302", description: `چک دریافتنی ${checkNumber}`, debit: amount }, { accountCode: counterAccountCode, description: `طرف حساب چک ${checkNumber}`, credit: amount }] : [{ accountCode: counterAccountCode, description: `طرف حساب چک ${checkNumber}`, debit: amount }, { accountCode: "20201", description: `چک پرداختنی ${checkNumber}`, credit: amount }] });
        if (!entry) throw new HttpError(409, "سند چک قبلاً ثبت شده است");
        const [saved] = await tx.update(platformChecks).set({ journalId: entry.id }).where(eq(platformChecks.id, check.id)).returning();
        return saved;
      });
      await audit(auth, direction === "received" ? "ثبت چک دریافتی سامانه" : "ثبت چک صادره سامانه", "platform_check", createdCheck.id, `${checkNumber} · ${amount}`);
      return J({ item: createdCheck }, 201);
    }
    if (id === "cheques" && act && m === "PATCH") {
      const checkId = Number(act), b = await readJson(req), action = str(b.action, 20);
      if (!["clear","return","void"].includes(action)) throw new HttpError(400, "وضعیت درخواستی چک معتبر نیست");
      const updated = await db.transaction(async (tx) => {
        const [check] = await tx.select().from(platformChecks).where(eq(platformChecks.id, checkId)).for("update");
        if (!check || !["registered","cleared"].includes(check.status)) throw new HttpError(409, "چک پیدا نشد یا تعیین تکلیف شده است");
        const reverse = async (journalId: number | null, label: string) => {
          if (!journalId) return;
          const [original] = await tx.select().from(platformJournals).where(eq(platformJournals.id, journalId)).for("update");
          if (!original || original.status !== "posted") return;
          const lines = await tx.select().from(platformJournalLines).where(eq(platformJournalLines.journalId, original.id));
          const reversed = await postPlatformJournal(tx, { sourceType: "manual", reversalOf: original.id, date: new Date(), description: `${label} · برگشت سند چک #${original.documentNo}`, createdBy: auth.user.name, lines: lines.map((line) => ({ accountCode: line.accountCode, description: `برگشت · ${line.description}`, debit: line.credit, credit: line.debit })) });
          if (!reversed) throw new HttpError(409, "سند برگشتی این چک قبلاً ثبت شده است");
          await tx.update(platformJournals).set({ status: "reversed" }).where(eq(platformJournals.id, original.id));
        };
        if (action === "clear") {
          if (check.status !== "registered") throw new HttpError(409, "این چک قبلاً تعیین تکلیف شده است");
          const entry = await postPlatformJournal(tx, { sourceType: "platform_check_settlement", sourceId: check.id, date: new Date(), description: `${check.direction === "received" ? "وصول" : "پرداخت"} چک ${check.checkNumber} · ${check.partyName}`, createdBy: auth.user.name, lines: check.direction === "received" ? [{ accountCode: check.bankAccountCode, description: `واریز چک ${check.checkNumber}`, debit: check.amount }, { accountCode: "10302", description: "انتقال از اسناد دریافتنی", credit: check.amount }] : [{ accountCode: "20201", description: "تسویه اسناد پرداختنی", debit: check.amount }, { accountCode: check.bankAccountCode, description: `پرداخت چک ${check.checkNumber}`, credit: check.amount }] });
          if (!entry) throw new HttpError(409, "سند تسویه چک قبلاً ثبت شده است");
          const [row] = await tx.update(platformChecks).set({ status: "cleared", settlementJournalId: entry.id }).where(eq(platformChecks.id, check.id)).returning();
          return row;
        }
        if (action === "return") {
          if (check.settlementJournalId && check.direction === "received") await reverse(check.settlementJournalId, "برگشت چک دریافتی");
          if (!check.settlementJournalId || check.direction === "received") await reverse(check.journalId, "برگشت چک");
          if (check.settlementJournalId && check.direction === "issued") await reverse(check.settlementJournalId, "برگشت پرداخت چک صادره");
          const [row] = await tx.update(platformChecks).set({ status: "returned" }).where(eq(platformChecks.id, check.id)).returning();
          return row;
        }
        if (check.settlementJournalId) await reverse(check.settlementJournalId, "ابطال تسویه چک");
        await reverse(check.journalId, "ابطال چک");
        const [row] = await tx.update(platformChecks).set({ status: "void" }).where(eq(platformChecks.id, check.id)).returning();
        return row;
      });
      await audit(auth, `تعیین وضعیت چک سامانه: ${action}`, "platform_check", checkId);
      return J({ item: updated });
    }
    if (id === "bank-statements" && m === "GET") {
      const accountCode = str(q.get("accountCode"), 24);
      const result: any = await db.execute(sql`SELECT e.id,e.account_code AS "accountCode",a.name AS "accountName",e.transaction_date AS "transactionDate",e.description,e.reference,e.amount,e.matched_journal_line_id AS "matchedJournalLineId",j.document_no AS "matchedDocumentNo",l.description AS "matchedLineDescription",e.created_by AS "createdBy"
        FROM platform_bank_statement_entries e JOIN platform_accounts a ON a.code=e.account_code LEFT JOIN platform_journal_lines l ON l.id=e.matched_journal_line_id LEFT JOIN platform_journals j ON j.id=l.journal_id
        WHERE (${accountCode}='' OR e.account_code=${accountCode}) ORDER BY e.transaction_date DESC,e.id DESC LIMIT 1000`);
      return J({ items: result.rows });
    }
    if (id === "bank-statements" && m === "POST") {
      const b = await readJson(req), accountCode = str(b.accountCode, 24);
      const rows = Array.isArray(b.items) ? b.items.slice(0, 500) : [];
      if (!accountCode || rows.length === 0) throw new HttpError(400, "حساب بانکی و حداقل یک ردیف صورت‌حساب لازم است");
      const [account] = await db.select().from(platformAccounts).where(and(eq(platformAccounts.code, accountCode), eq(platformAccounts.kind, "asset"), eq(platformAccounts.isActive, true)));
      if (!account || account.level !== "تفصیلی") throw new HttpError(400, "حساب بانکی تفصیلی و فعال را انتخاب کنید");
      const [child] = await db.select({ code: platformAccounts.code }).from(platformAccounts).where(eq(platformAccounts.parentCode, accountCode)).limit(1);
      if (child) throw new HttpError(400, "صورت‌حساب را به یک حساب بانکیِ بدون زیرحساب متصل کنید");
      const imported = await db.transaction(async (tx) => {
        let count = 0;
        for (const row of rows) {
          const transactionDate = date(row.date ?? row.transactionDate), amount = moneyNum(row.amount), description = str(row.description, 300), reference = str(row.reference, 120);
          if (!transactionDate || amount === 0) continue;
          const fingerprint = createHash("sha256").update([accountCode, transactionDate.toISOString(), amount, description, reference].join("\u0000")).digest("hex");
          const [inserted] = await tx.insert(platformBankStatementEntries).values({ accountCode, transactionDate, amount, description, reference, fingerprint, createdBy: auth.user.name }).onConflictDoNothing().returning({ id: platformBankStatementEntries.id });
          if (inserted) count++;
        }
        return count;
      });
      await audit(auth, "واردکردن صورت‌حساب بانکی سامانه", "platform_bank_statement", accountCode, `${imported} ردیف جدید`);
      return J({ imported, skipped: rows.length-imported }, 201);
    }
    if (id === "bank-candidates" && m === "GET") {
      const accountCode = str(q.get("accountCode"), 24), amount = moneyNum(q.get("amount"));
      if (!accountCode || amount === 0) return J({ items: [] });
      const incoming = amount > 0;
      const result: any = await db.execute(sql`SELECT l.id AS "journalLineId",j.document_no AS "documentNo",j.date,j.description,l.description AS "lineDescription",l.debit,l.credit
        FROM platform_journal_lines l JOIN platform_journals j ON j.id=l.journal_id
        WHERE l.account_code=${accountCode} AND j.status='posted' AND ${incoming ? sql`l.debit=${Math.abs(amount)} AND l.credit=0` : sql`l.credit=${Math.abs(amount)} AND l.debit=0`}
        AND NOT EXISTS (SELECT 1 FROM platform_bank_statement_entries e WHERE e.matched_journal_line_id=l.id)
        ORDER BY abs(extract(epoch from (j.date-${date(q.get("date")) ?? new Date()}::timestamptz))),j.document_no DESC LIMIT 100`);
      return J({ items: result.rows });
    }
    if (id === "bank-statements" && act && m === "PATCH") {
      const entryId = Number(act), b = await readJson(req);
      const row = await db.transaction(async (tx) => {
        const [entry] = await tx.select().from(platformBankStatementEntries).where(eq(platformBankStatementEntries.id, entryId)).for("update");
        if (!entry) throw new HttpError(404, "ردیف صورت‌حساب پیدا نشد");
        if (b.action === "unmatch") {
          const [updated] = await tx.update(platformBankStatementEntries).set({ matchedJournalLineId: null }).where(eq(platformBankStatementEntries.id, entry.id)).returning();
          return updated;
        }
        if (b.action !== "match") throw new HttpError(400, "عملیات تطبیق نامعتبر است");
        const lineId = num(b.journalLineId);
        const [line] = await tx.select({ line: platformJournalLines, journal: platformJournals }).from(platformJournalLines).innerJoin(platformJournals, eq(platformJournals.id, platformJournalLines.journalId)).where(and(eq(platformJournalLines.id, lineId), eq(platformJournalLines.accountCode, entry.accountCode), eq(platformJournals.status, "posted")));
        if (!line || (entry.amount > 0 ? Number(line.line.debit) !== entry.amount || Number(line.line.credit) !== 0 : Number(line.line.credit) !== Math.abs(entry.amount) || Number(line.line.debit) !== 0)) throw new HttpError(400, "مبلغ یا جهت ردیف دفتر با صورت‌حساب بانکی برابر نیست");
        const [duplicate] = await tx.select({ id: platformBankStatementEntries.id }).from(platformBankStatementEntries).where(eq(platformBankStatementEntries.matchedJournalLineId, lineId)).limit(1);
        if (duplicate && duplicate.id !== entry.id) throw new HttpError(409, "این ردیف دفتر قبلاً با صورت‌حساب دیگری تطبیق داده شده است");
        const [updated] = await tx.update(platformBankStatementEntries).set({ matchedJournalLineId: lineId }).where(eq(platformBankStatementEntries.id, entry.id)).returning();
        return updated;
      });
      await audit(auth, b.action === "match" ? "تطبیق ردیف بانکی" : "لغو تطبیق بانکی", "platform_bank_statement", row?.id ?? entryId);
      return J({ item: row });
    }
    if (id === "reports" && m === "GET") {
      const type = q.get("type") ?? "trial", from = date(q.get("from")), to = date(q.get("to"));
      const code = str(q.get("code"), 24);
      if (type === "account" && !code) return J({ items: [], account: null });
      const rows: any = await db.execute(sql`SELECT a.code,a.name,a.level,a.kind,
        coalesce(sum(l.debit) FILTER (WHERE (${from}::timestamptz IS NULL OR j.date >= ${from}) AND (${to}::timestamptz IS NULL OR j.date < ${to})),0)::float8 AS debit,
        coalesce(sum(l.credit) FILTER (WHERE (${from}::timestamptz IS NULL OR j.date >= ${from}) AND (${to}::timestamptz IS NULL OR j.date < ${to})),0)::float8 AS credit
        FROM platform_accounts a LEFT JOIN platform_journal_lines l ON l.account_code=a.code LEFT JOIN platform_journals j ON j.id=l.journal_id
        WHERE a.is_active=true GROUP BY a.code ORDER BY a.code`);
      const items = rows.rows.map((row: any) => ({ ...row, debit: Number(row.debit), credit: Number(row.credit), balance: Number(row.debit) - Number(row.credit) }));
      if (type === "profit-loss") {
        const profitRows = items.filter((row: any) => ["revenue","expense"].includes(row.kind));
        return J({ items: profitRows, revenue: profitRows.filter((row: any) => row.kind === "revenue").reduce((sum: number, row: any) => sum + row.credit - row.debit, 0), expenses: profitRows.filter((row: any) => row.kind === "expense").reduce((sum: number, row: any) => sum + row.debit - row.credit, 0) });
      }
      if (type === "account") {
        const [opening]: any[] = from ? (await db.execute(sql`SELECT coalesce(sum(l.debit-l.credit),0)::float8 AS balance FROM platform_journal_lines l JOIN platform_journals j ON j.id=l.journal_id WHERE l.account_code=${code} AND j.date < ${from}`)).rows : [{ balance: 0 }];
        const entries: any = await db.execute(sql`SELECT j.document_no AS "documentNo",j.date,j.description,j.status,l.description AS "lineDescription",l.debit,l.credit FROM platform_journal_lines l JOIN platform_journals j ON j.id=l.journal_id WHERE l.account_code=${code} AND (${from}::timestamptz IS NULL OR j.date >= ${from}) AND (${to}::timestamptz IS NULL OR j.date < ${to}) ORDER BY j.date,j.document_no,l.line_no`);
        let running = Number(opening.balance);
        const ledgerItems = entries.rows.map((entry: any) => { running += Number(entry.debit)-Number(entry.credit); return { ...entry, runningBalance: running }; });
        const debit = ledgerItems.reduce((sum: number, entry: any) => sum + Number(entry.debit), 0), credit = ledgerItems.reduce((sum: number, entry: any) => sum + Number(entry.credit), 0), balance = running;
        return J({ items: ledgerItems, account: { ...(items.find((item: any) => item.code === code) ?? {}), debit, credit, openingBalance: Number(opening.balance), balance, closingDebit: Math.max(balance,0), closingCredit: Math.max(-balance,0) } });
      }
      const openingRows: any = from ? await db.execute(sql`SELECT a.code,coalesce(sum(l.debit-l.credit) FILTER (WHERE j.id IS NOT NULL),0)::float8 AS balance FROM platform_accounts a LEFT JOIN platform_journal_lines l ON l.account_code=a.code LEFT JOIN platform_journals j ON j.id=l.journal_id AND j.date < ${from} WHERE a.is_active=true GROUP BY a.code`) : { rows: [] };
      const openingBalances = new Map<string,number>(openingRows.rows.map((row: any) => [String(row.code), Number(row.balance)] as [string,number]));
      const completeTrial = items.map((row: any) => {
        const openingBalance = openingBalances.get(row.code) ?? 0;
        const closingBalance = openingBalance + row.balance;
        return { ...row, openingBalance, openingDebit: Math.max(openingBalance,0), openingCredit: Math.max(-openingBalance,0), closingBalance, closingDebit: Math.max(closingBalance,0), closingCredit: Math.max(-closingBalance,0) };
      });
      return J({ items: completeTrial, debitTotal: completeTrial.reduce((sum: number,row: any)=>sum+row.closingDebit,0), creditTotal: completeTrial.reduce((sum: number,row: any)=>sum+row.closingCredit,0), turnoverDebitTotal: completeTrial.reduce((sum: number,row: any)=>sum+row.debit,0), turnoverCreditTotal: completeTrial.reduce((sum: number,row: any)=>sum+row.credit,0) });
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
      if (!isBillingTerm(months)) throw new HttpError(400, "دوره اشتراک باید ۱، ۳، ۶ یا ۱۲ ماهه باشد");
      const list = await getPlanList();
      const quote = list.find((p) => p.key === plan)!.terms[months];
      const additionalDiscount = Math.min(quote.total, Math.max(0, num(b.discount, 0)));
      const discount = quote.base - quote.total + additionalDiscount;
      const amount = b.amount !== undefined && b.amount !== "" ? Math.max(0, num(b.amount)) : quote.total - additionalDiscount;
      const [mx] = await db.select({ n: sql<number>`coalesce(max(${subscriptionInvoices.number}),1000)::int` }).from(subscriptionInvoices);
      const row = await db.transaction(async (tx) => {
        const [invoice] = await tx.insert(subscriptionInvoices).values({ number: mx.n + 1, businessId: biz.id, plan, months, amount, discount, note: str(b.note, 300), createdBy: auth.user.name }).returning();
        if (amount > 0) await postPlatformJournal(tx, { sourceType: "subscription_invoice", sourceId: invoice.id, date: invoice.createdAt, description: `صدور فاکتور اشتراک #${invoice.number} · ${biz.name}`, createdBy: auth.user.name, lines: [{ accountCode: "10301", description: `مطالبه فاکتور #${invoice.number}`, debit: amount }, { accountCode: "4010", description: `درآمد اشتراک · ${biz.name}`, credit: amount }] });
        return invoice;
      });
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
        const row = await db.transaction(async (tx) => {
          const [locked] = await tx.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.id, inv.id), eq(subscriptionInvoices.status, "unpaid"))).for("update");
          if (!locked) return null;
          const [source] = await tx.select().from(platformJournals).where(and(eq(platformJournals.sourceType, "subscription_invoice"), eq(platformJournals.sourceId, inv.id), eq(platformJournals.status, "posted"))).for("update");
          const [adjustment] = source ? [] : await tx.select().from(platformJournals).where(and(eq(platformJournals.sourceType, "manual"), eq(platformJournals.status, "posted"), ilike(platformJournals.description, `اصلاح مبلغ فاکتور #${locked.number}%`))).orderBy(desc(platformJournals.id)).limit(1).for("update");
          const accrual = source ?? adjustment;
          if (accrual) {
            const lines = await tx.select().from(platformJournalLines).where(eq(platformJournalLines.journalId, accrual.id));
            await postPlatformJournal(tx, { sourceType: "manual", reversalOf: accrual.id, date: new Date(), description: `برگشت فاکتور #${locked.number} برای اصلاح مبلغ`, createdBy: auth.user.name, lines: lines.map((line) => ({ accountCode: line.accountCode, description: `برگشت · ${line.description}`, debit: line.credit, credit: line.debit })) });
            await tx.update(platformJournals).set({ status: "reversed" }).where(eq(platformJournals.id, accrual.id));
          }
          const [updated] = await tx.update(subscriptionInvoices).set({ amount, note: b.note === undefined ? locked.note : str(b.note, 300) }).where(and(eq(subscriptionInvoices.id, locked.id), eq(subscriptionInvoices.status, "unpaid"))).returning();
          if (!updated) return null;
          if (amount > 0) await postPlatformJournal(tx, { sourceType: "manual", date: new Date(), description: `اصلاح مبلغ فاکتور #${updated.number}`, createdBy: auth.user.name, lines: [{ accountCode: "10301", description: `مطالبه اصلاح‌شده #${updated.number}`, debit: amount }, { accountCode: "4010", description: "درآمد اشتراک پس از اصلاح مبلغ", credit: amount }] });
          return updated;
        });
        if (!row) throw new HttpError(409, "فاکتور هم‌زمان تغییر کرد");
        await audit(auth, "ویرایش مبلغ فاکتور اشتراک", "invoice", row.number, `${inv.amount} ← ${amount} تومان`);
        return J({ item: row });
      }
      if (b.action === "void") {
        const pending = await db.update(subscriptionPayments).set({ status: "failed", detail: "فاکتور باطل شد" }).where(and(eq(subscriptionPayments.invoiceId, Number(id)), eq(subscriptionPayments.status, "pending"), sql`${subscriptionPayments.createdAt} < now() - interval '30 minutes'`)).returning({ id: subscriptionPayments.id });
        void pending;
        const [activePayment] = await db.select({ id: subscriptionPayments.id }).from(subscriptionPayments).where(and(eq(subscriptionPayments.invoiceId, Number(id)), eq(subscriptionPayments.status, "pending"))).limit(1);
        if (activePayment) throw new HttpError(409, "برای این فاکتور پرداخت در حال انجام است");
        const r = await db.transaction(async (tx) => {
          const [invoice] = await tx.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.id, Number(id)), eq(subscriptionInvoices.status, "unpaid"))).for("update");
          if (!invoice) return null;
          const [source] = await tx.select().from(platformJournals).where(and(eq(platformJournals.sourceType, "subscription_invoice"), eq(platformJournals.sourceId, invoice.id), eq(platformJournals.status, "posted"))).for("update");
          const [adjustment] = source ? [] : await tx.select().from(platformJournals).where(and(eq(platformJournals.sourceType, "manual"), eq(platformJournals.status, "posted"), ilike(platformJournals.description, `اصلاح مبلغ فاکتور #${invoice.number}%`))).orderBy(desc(platformJournals.id)).limit(1).for("update");
          const accrual = source ?? adjustment;
          if (accrual) {
            const lines = await tx.select().from(platformJournalLines).where(eq(platformJournalLines.journalId, accrual.id));
            await postPlatformJournal(tx, { sourceType: "manual", reversalOf: accrual.id, date: new Date(), description: `برگشت فاکتور باطل‌شده #${invoice.number}`, createdBy: auth.user.name, lines: lines.map((line) => ({ accountCode: line.accountCode, description: `برگشت · ${line.description}`, debit: line.credit, credit: line.debit })) });
            await tx.update(platformJournals).set({ status: "reversed" }).where(eq(platformJournals.id, accrual.id));
          }
          const [voided] = await tx.update(subscriptionInvoices).set({ status: "void" }).where(and(eq(subscriptionInvoices.id, invoice.id), eq(subscriptionInvoices.status, "unpaid"))).returning();
          return voided;
        });
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
      const category = str(b.category, 60) || "سایر", expenseDate = date(b.date) ?? new Date();
      const method = typeof b.paymentMethod === "string" && (["cash","transfer","card","online"] as string[]).includes(b.paymentMethod) ? b.paymentMethod : "transfer";
      const row = await db.transaction(async (tx) => {
        const [expense] = await tx.insert(platformExpenses).values({ category, amount, description: str(b.description, 300), date: expenseDate, paymentMethod: method, createdBy: auth.user.name }).returning();
        await postPlatformJournal(tx, { sourceType: "platform_expense", sourceId: expense.id, date: expense.date, description: `هزینه سامانه · ${expense.category}${expense.description ? ` · ${expense.description}` : ""}`, createdBy: auth.user.name, lines: [{ accountCode: expenseAccountCode(expense.category), description: expense.description || expense.category, debit: amount }, { accountCode: paymentAccountCode(method), description: "پرداخت هزینه سامانه", credit: amount }] });
        return expense;
      });
      await audit(auth, "ثبت هزینه", "expense", row.id, `${row.category}: ${amount}`);
      return J({ item: row }, 201);
    }
    if (m === "PATCH" && id) {
      const b = await readJson(req);
      const row = await db.transaction(async (tx) => {
        const [old] = await tx.select().from(platformExpenses).where(eq(platformExpenses.id, Number(id))).for("update");
        if (!old || old.status !== "active") throw new HttpError(404, "هزینهٔ فعال پیدا نشد");
        const [source] = await tx.select().from(platformJournals).where(and(eq(platformJournals.sourceType, "platform_expense"), eq(platformJournals.sourceId, old.id))).for("update");
        if (source && source.status === "posted") {
          const sourceLines = await tx.select().from(platformJournalLines).where(eq(platformJournalLines.journalId, source.id));
          const reverse = await postPlatformJournal(tx, { sourceType: "manual", reversalOf: source.id, date: new Date(), description: `برگشت هزینه #${old.id} برای اصلاح`, createdBy: auth.user.name, lines: sourceLines.map((line) => ({ accountCode: line.accountCode, description: `برگشت · ${line.description}`, debit: line.credit, credit: line.debit })) });
          if (!reverse) throw new HttpError(409, "برگشت هزینه قبلاً ثبت شده است");
          await tx.update(platformJournals).set({ status: "reversed" }).where(eq(platformJournals.id, source.id));
        }
        await tx.update(platformExpenses).set({ status: "void" }).where(eq(platformExpenses.id, old.id));
        const amount = b.amount === undefined ? old.amount : num(b.amount, -1);
        if (amount <= 0) throw new HttpError(400, "مبلغ نامعتبر است");
        const category = typeof b.category === "string" ? str(b.category, 60) || "سایر" : old.category;
        const description = typeof b.description === "string" ? str(b.description, 300) : old.description;
        const expenseDate = b.date ? date(b.date) ?? old.date : old.date;
        const method = typeof b.paymentMethod === "string" && (["cash","transfer","card","online"] as string[]).includes(b.paymentMethod) ? b.paymentMethod : old.paymentMethod;
        const [created] = await tx.insert(platformExpenses).values({ category, amount, description, date: expenseDate, paymentMethod: method, createdBy: auth.user.name }).returning();
        await postPlatformJournal(tx, { sourceType: "platform_expense", sourceId: created.id, date: created.date, description: `هزینه اصلاح‌شده · ${created.category}`, createdBy: auth.user.name, lines: [{ accountCode: expenseAccountCode(category), description, debit: amount }, { accountCode: paymentAccountCode(method), description: "پرداخت هزینه سامانه", credit: amount }] });
        return created;
      });
      if (!row) throw new HttpError(404, "پیدا نشد");
      await audit(auth, "اصلاح هزینه و ثبت سند جایگزین", "expense", row.id, `${row.category}: ${row.amount}`);
      return J({ item: row });
    }
    if (m === "DELETE" && id) {
      const row = await db.transaction(async (tx) => {
        const [expense] = await tx.select().from(platformExpenses).where(eq(platformExpenses.id, Number(id))).for("update");
        if (!expense || expense.status !== "active") throw new HttpError(404, "هزینهٔ فعال پیدا نشد");
        const [source] = await tx.select().from(platformJournals).where(and(eq(platformJournals.sourceType, "platform_expense"), eq(platformJournals.sourceId, expense.id))).for("update");
        if (source && source.status === "posted") {
          const sourceLines = await tx.select().from(platformJournalLines).where(eq(platformJournalLines.journalId, source.id));
          await postPlatformJournal(tx, { sourceType: "manual", reversalOf: source.id, date: new Date(), description: `برگشت هزینه سامانه #${expense.id} · ${expense.category}`, createdBy: auth.user.name, lines: sourceLines.map((line) => ({ accountCode: line.accountCode, description: `برگشت · ${line.description}`, debit: line.credit, credit: line.debit })) });
          await tx.update(platformJournals).set({ status: "reversed" }).where(eq(platformJournals.id, source.id));
        }
        const [voided] = await tx.update(platformExpenses).set({ status: "void" }).where(eq(platformExpenses.id, expense.id)).returning();
        return voided;
      });
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
    const exp = await db.select().from(platformExpenses).where(and(gte(platformExpenses.date, yr.start), eq(platformExpenses.status, "active")));
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
      const savedTrialPolicy = await getSetting("trialPolicy", { enabled: true, durationDays: 14, plan: "premium_plus" });
      const trialPolicy = { ...savedTrialPolicy, enabled: true, plan: "premium_plus" };
      const sms = await getPlatformSms();
      return J({ support: await getSupport(), managerNotifications: await getManagerNotifications(), billing: await getBilling(), platformBranding: await getPlatformBranding(), plans: await getPlanList(), planPrices: prices,
        platformPayments: payments, trialPolicy,
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
        const brandColor = v.brandColor === undefined ? DEFAULT_BRAND_COLOR : normalizeBrandColor(v.brandColor);
        if (siteName.length < 2) throw new HttpError(400, "نام سامانه باید حداقل دو نویسه باشد");
        if (logoUrl && !/^\/api\/files\/[a-f0-9]{24}$/.test(logoUrl)) throw new HttpError(400, "لوگوی سامانه باید از بخش بارگذاری انتخاب شود");
        if (!brandColor) throw new HttpError(400, "رنگ سازمانی باید یک کد شش‌رقمی معتبر باشد");
        await setSetting("platformBranding", { siteName, logoUrl, brandColor });
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
          const required = ["oldPrice", "sixMonthPrice", "sixMonthDiscount", "annualDiscount"];
          const keys = ["price", "oldPrice", "monthlyPrice", "monthlyDiscount", "threeMonthPrice", "threeMonthDiscount", "sixMonthPrice", "sixMonthDiscount", "annualDiscount"];
          if (!p || typeof p !== "object" || required.some(key => typeof p[key] !== "number")) throw new HttpError(400, "قیمت و تخفیف همه دوره‌ها را وارد کنید");
          const values: Record<string, number> = {};
          for (const key of keys) {
            if (p[key] === undefined) continue; // Older admin clients keep using the existing derived monthly prices.
            if (typeof p[key] !== "number") throw new HttpError(400, "قیمت هر دوره باید عددی باشد");
            values[key] = p[key];
          }
          const discounts = ["monthlyDiscount", "threeMonthDiscount", "sixMonthDiscount", "annualDiscount"];
          if (Object.values(values).some(n => !Number.isFinite(n) || n < 0 || n > 2000000000) || discounts.some(key => values[key] !== undefined && values[key] > 100)) throw new HttpError(400, "قیمت نامعتبر است؛ تخفیف باید بین صفر و صد باشد");
          out[k] = values;
        }
        await setSetting("planPrices", out);
      } else if (b.key === "platformPayments") {
        need(auth, "settings");
        const value = { zarinpalEnabled: Boolean(v.zarinpalEnabled), zarinpalMerchantId: str(v.zarinpalMerchantId, 80), zibalEnabled: Boolean(v.zibalEnabled), zibalMerchantId: str(v.zibalMerchantId, 80) };
        if (value.zarinpalEnabled && !value.zarinpalMerchantId || value.zibalEnabled && !value.zibalMerchantId) throw new HttpError(400, "شناسه پذیرنده هر درگاه فعال را وارد کنید");
        await setSetting("platformPayments", value);
      } else if (b.key === "trialPolicy") {
        need(auth, "settings");
        const durationDays = Number(v.durationDays);
        if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 60) throw new HttpError(400, "مدت دوره آزمایشی باید بین ۱ تا ۶۰ روز باشد");
        await setSetting("trialPolicy", { enabled: true, durationDays, plan: "premium_plus" });
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
    if (m === "GET" && act) {
      const itemId = Number(act);
      if (!Number.isSafeInteger(itemId) || itemId < 1) throw new HttpError(400, "شناسه محتوا نامعتبر است");
      const [item] = await db.select().from(table).where(eq((table as any).id, itemId)).limit(1);
      if (!item) throw new HttpError(404, "محتوا پیدا نشد");
      return J({ item });
    }
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
          ? { ...common, excerpt: str(b.excerpt, 600), content: normalizeRichContent(b.content), author: str(b.author, 100) || "تیم منوی دیجیتال", canonicalUrl: publicUrl(b.canonicalUrl), tags: Array.isArray(b.tags) ? [...new Set(b.tags.map((x: unknown) => str(x, 40)).filter(Boolean))].slice(0, 20) : [] }
          : { ...common, summary: str(b.summary, 600), content: normalizeRichContent(b.content), videoUrl: publicUrl(b.videoUrl), sortOrder: Math.max(0, num(b.sortOrder)) };
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
          await postPlatformJournal(tx, { sourceType: "affiliate_payout", sourceId: row.id, date: now, description: `تسویه پورسانت همکار فروش #${row.affiliateId}`, createdBy: auth.user.name, lines: [{ accountCode: "20101", description: "تسویه بدهی پورسانت", debit: row.amount }, { accountCode: "10201", description: "پرداخت بانکی پورسانت", credit: row.amount }] });
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
    await tx.update(trialGrants).set({ status: "converted", convertedAt: now }).where(and(eq(trialGrants.businessId, biz.id), inArray(trialGrants.status, ["active", "expired"])));

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
            await postPlatformJournal(tx, { sourceType: "affiliate_commission", sourceId: commission.id, date: now, description, createdBy: "سیستم", lines: [{ accountCode: "5070", description, debit: amount }, { accountCode: "20101", description, credit: amount }] });
          }
        }
      }
    }
    if (inv.amount > 0) {
      await postPlatformJournal(tx, { sourceType: "subscription_receipt", sourceId: inv.id, date: now, description: `دریافت فاکتور اشتراک #${inv.number} · ${biz.name}`, createdBy: auth?.user.name ?? "درگاه پرداخت", lines: [{ accountCode: paymentAccountCode(method), description: `دریافت · ${refNo || method}`, debit: inv.amount }, { accountCode: "10301", description: `تسویه مطالبه فاکتور #${inv.number}`, credit: inv.amount }] });
    }
    return { row, biz, owner, end };
  });
  if (auth) await audit(auth, "ثبت پرداخت فاکتور", "invoice", result.row.number, `${result.biz.name} · ${result.row.plan} تا ${result.end.toISOString().slice(0, 10)}`);
  await notifyPlatformManager({ kind: "plan_sale", name: result.biz.name, phone: result.biz.phone || result.owner?.phone || "", details: `${planName(result.row.plan)} · ${result.row.months} ماهه · ${result.row.amount.toLocaleString("fa-IR")} تومان · فاکتور #${result.row.number}` });
  return result.row;
}
