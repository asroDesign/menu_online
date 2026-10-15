/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAudit, announcements, businesses, categories, customers, diningTables, planFeatures, platformExpenses, products, staff,
  subscriptionInvoices, ticketMessages, tickets, users, sessions,
} from "@/db/schema";
import { getBilling, getPlanList, getSetting, getSupport, setSetting } from "@/lib/app-settings";
import { adminCan, adminDept, hashPassword, HttpError, readJson, startImpersonation, type AuthContext } from "@/lib/auth";
import { ADMIN_DEPTS, permsOf, TICKET_DEPTS, type AdminPerm } from "@/lib/admin-meta";
import { effectivePlan, getPlanOverrides, invalidatePlanCache } from "@/lib/entitlements";
import { jMonthRange, jYearRange, toJ } from "@/lib/jalali";
import { FEATURES, PLAN_KEYS } from "@/lib/plans";

const J = (d: unknown, s = 200) => Response.json(d, { status: s });
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v: unknown, d = 0) => { if (v === null || v === undefined || v === "") return d; const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const date = (v: unknown) => { if (v === null || v === "" || v === undefined) return null; const d = new Date(String(v)); if (isNaN(d.getTime())) throw new HttpError(400, "تاریخ نامعتبر است"); return d; };
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const genPassword = () => randomBytes(9).toString("base64url").slice(0, 10);
const EMAIL = /^\S+@\S+\.\S+$/;

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
      const months = Math.min(60, Math.max(1, num(b.months, 12)));
      const list = await getPlanList();
      const base = Math.round(((list.find((p) => p.key === plan)?.price ?? 0) * months) / 12);
      const discount = Math.max(0, num(b.discount, 0));
      const amount = b.amount !== undefined && b.amount !== "" ? Math.max(0, num(b.amount)) : Math.max(0, base - discount);
      const [mx] = await db.select({ n: sql<number>`coalesce(max(${subscriptionInvoices.number}),1000)::int` }).from(subscriptionInvoices);
      const [row] = await db.insert(subscriptionInvoices).values({ number: mx.n + 1, businessId: biz.id, plan, months, amount, discount, note: str(b.note, 300), createdBy: auth.user.name }).returning();
      await audit(auth, "صدور فاکتور اشتراک", "invoice", row.number, `${biz.name} · ${plan} · ${months} ماه`);
      if (b.markPaid) return J({ item: await payInvoice(auth, row.id, str(b.method, 20) || "transfer", str(b.refNo, 40), date(b.paidAt)) }, 201);
      return J({ item: row }, 201);
    }
    if (m === "PATCH" && id) {
      const b = await readJson(req);
      if (b.action === "pay") return J({ item: await payInvoice(auth, Number(id), str(b.method, 20) || "transfer", str(b.refNo, 40), date(b.paidAt)) });
      if (b.action === "void") {
        const [r] = await db.update(subscriptionInvoices).set({ status: "void" }).where(and(eq(subscriptionInvoices.id, Number(id)), eq(subscriptionInvoices.status, "unpaid"))).returning();
        if (!r) throw new HttpError(400, "فقط فاکتور پرداخت‌نشده قابل ابطال است");
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
      const prices = await getSetting<Record<string, { price?: number; oldPrice?: number }>>("planPrices", {});
      return J({ support: await getSupport(), billing: await getBilling(), plans: await getPlanList(), planPrices: prices });
    }
    if (m === "POST") {
      const b = await readJson(req);
      const v = (b.value && typeof b.value === "object" ? b.value : {}) as Record<string, unknown>;
      if (b.key === "support") { need(auth, "settings"); await setSetting("support", { phone: str(v.phone, 40), email: str(v.email, 120), hours: str(v.hours, 80) }); }
      else if (b.key === "billing") { if (!adminCan(auth, "settings") && !adminCan(auth, "accounting")) throw new HttpError(403, "دسترسی ندارید"); await setSetting("billing", { bank: str(v.bank, 60), owner: str(v.owner, 80), card: str(v.card, 30), sheba: str(v.sheba, 40), note: str(v.note, 400) }); }
      else if (b.key === "planPrices") {
        need(auth, "plans");
        const out: Record<string, { price: number; oldPrice: number }> = {};
        for (const k of PLAN_KEYS) { const p = v[k] as any; if (p) out[k] = { price: Math.max(0, num(p.price)), oldPrice: Math.max(0, num(p.oldPrice)) }; }
        await setSetting("planPrices", out);
      } else throw new HttpError(400, "کلید نامعتبر است");
      await audit(auth, "ویرایش تنظیمات سامانه", "settings", String(b.key));
      return J({ ok: true });
    }
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
  const [inv] = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.id, id));
  if (!inv) throw new HttpError(404, "فاکتور پیدا نشد");
  if (inv.status !== "unpaid") throw new HttpError(400, inv.status === "paid" ? "این فاکتور قبلاً پرداخت شده است" : "این فاکتور باطل شده است");
  const [biz] = await db.select().from(businesses).where(eq(businesses.id, inv.businessId));
  const now = new Date();
  const from = biz.subscriptionEndsAt && biz.subscriptionEndsAt > now && biz.plan === inv.plan ? biz.subscriptionEndsAt : now;
  const end = addMonths(from, inv.months);
  const [row] = await db.update(subscriptionInvoices).set({ status: "paid", method, refNo, paidAt: paidAt ?? now, periodStart: from, periodEnd: end }).where(and(eq(subscriptionInvoices.id, id), eq(subscriptionInvoices.status, "unpaid"))).returning();
  if (!row) throw new HttpError(409, "فاکتور هم‌زمان تغییر کرد");
  await db.update(businesses).set({ plan: inv.plan, subscriptionEndsAt: end, upgradeRequest: biz.upgradeRequest === inv.plan ? null : biz.upgradeRequest }).where(eq(businesses.id, biz.id));
  await audit(auth, "ثبت پرداخت فاکتور", "invoice", row.number, `${biz.name} · ${inv.plan} تا ${end.toISOString().slice(0, 10)}`);
  return row;
}
