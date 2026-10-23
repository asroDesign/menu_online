/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { accAccounts, couriers, diningTables, orders, pagers, posRequests, stockMovements, suppliers, users } from "@/db/schema";
import { accountStatement, accountTotals, ensureSupplierAccount, payFromAccountId, postDocument, C } from "@/lib/accounting";
import { HttpError, hashPassword, readJson, withAuth } from "@/lib/auth";
import { startOfDayTehran } from "@/lib/jalali";
import { approvePosRequest, createPosRequest, expirePosRequests, posDeviceForChannel } from "@/lib/pos";

const J = (d: unknown, s = 200) => Response.json(d, { status: s });
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const FEAT = ["inventory", "accounting"];
const WRITERS = ["warehouse", "accountant"];

async function withBalances(bizId: number, rows: (typeof suppliers.$inferSelect)[]) {
  const t = await accountTotals(bizId, rows.map((r) => r.accountId).filter((x): x is number => !!x));
  return rows.map((r) => { const v = r.accountId ? t.get(r.accountId) : undefined; return { ...r, purchased: v?.c ?? 0, paid: v?.d ?? 0, balance: (v?.c ?? 0) - (v?.d ?? 0) }; });
}

const supplierFields = (b: Record<string, unknown>) => ({
  name: str(b.name, 100), contactPerson: str(b.contactPerson, 80), phone: str(b.phone, 30), address: str(b.address, 300),
  taxId: str(b.taxId, 40), bankInfo: str(b.bankInfo, 80), note: str(b.note, 300),
});

async function courierRows(bizId: number, rows: (typeof couriers.$inferSelect)[]) {
  if (!rows.length) return [];
  const since = startOfDayTehran(new Date());
  const [us, act, done] = await Promise.all([
    db.select({ id: users.id, email: users.email, active: users.isActive }).from(users).where(inArray(users.id, rows.map((r) => r.userId).filter((x): x is number => !!x).concat(0))),
    db.select({ id: orders.courierId, n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.businessId, bizId), inArray(orders.deliveryStatus, ["assigned", "picked_up"]))).groupBy(orders.courierId),
    db.select({ id: orders.courierId, st: orders.deliveryStatus, n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.businessId, bizId), gte(orders.deliveryFinishedAt, since))).groupBy(orders.courierId, orders.deliveryStatus),
  ]);
  return rows.map((r) => {
    const u = us.find((x) => x.id === r.userId);
    const d = done.filter((x) => x.id === r.id);
    return { ...r, email: u?.email ?? "", hasLogin: !!u, activeCount: act.find((a) => a.id === r.id)?.n ?? 0, deliveredToday: d.find((x) => x.st === "delivered")?.n ?? 0, failedToday: d.filter((x) => x.st === "not_home" || x.st === "failed").reduce((s, x) => s + x.n, 0) };
  });
}
const COURIER_STATUS = ["available", "busy", "off"];

export const registryC: Record<string, any> = {
  couriers: {
    list: withAuth(async (_req, { business }) => {
      const rows = await db.select().from(couriers).where(eq(couriers.businessId, business.id)).orderBy(asc(couriers.id));
      return J({ items: await courierRows(business.id, rows) });
    }, { feature: "courier" }),
    create: withAuth(async (req, { business }) => {
      const b = await readJson(req);
      const name = str(b.name, 80);
      if (!name) throw new HttpError(400, "نام پیک را وارد کنید");
      const email = str(b.email, 120).toLowerCase(), password = String(b.password ?? "");
      let userId: number | null = null;
      if (email || password) {
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "ایمیل ورود معتبر نیست");
        if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد");
        const [u] = await db.insert(users).values({ name, email, passwordHash: hashPassword(password), role: "courier", businessId: business.id }).returning({ id: users.id });
        userId = u.id;
      }
      const [row] = await db.insert(couriers).values({ businessId: business.id, name, phone: str(b.phone, 20), vehicle: str(b.vehicle, 30) || "موتور", status: COURIER_STATUS.includes(String(b.status)) ? String(b.status) : "available", userId }).returning();
      return J({ item: (await courierRows(business.id, [row]))[0] }, 201);
    }, { feature: "courier", manager: true, roles: ["cashier"] }),
    update: withAuth<{ id: string }>(async (req, { business }, { id }) => {
      const b = await readJson(req);
      const [cur] = await db.select().from(couriers).where(and(eq(couriers.id, Number(id)), eq(couriers.businessId, business.id)));
      if (!cur) throw new HttpError(404, "پیک پیدا نشد");
      const set: Record<string, unknown> = {};
      if (typeof b.name === "string" && b.name.trim()) set.name = str(b.name, 80);
      if (typeof b.phone === "string") set.phone = str(b.phone, 20);
      if (typeof b.vehicle === "string") set.vehicle = str(b.vehicle, 30);
      if (COURIER_STATUS.includes(String(b.status))) set.status = String(b.status);
      const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "", password = typeof b.password === "string" ? b.password : "";
      let userId = cur.userId;
      if (userId) {
        const u: Record<string, unknown> = {};
        if (set.name) u.name = set.name;
        if (email) { if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "ایمیل معتبر نیست"); u.email = email; }
        if (password) { if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد"); u.passwordHash = hashPassword(password); }
        if (Object.keys(u).length) await db.update(users).set(u).where(eq(users.id, userId));
      } else if (email || password) {
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "ایمیل ورود معتبر نیست");
        if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد");
        const [u] = await db.insert(users).values({ name: String(set.name ?? cur.name), email, passwordHash: hashPassword(password), role: "courier", businessId: business.id }).returning({ id: users.id });
        userId = u.id; set.userId = userId;
      }
      if (!Object.keys(set).length && !email && !password) throw new HttpError(400, "تغییری ارسال نشد");
      const [row] = Object.keys(set).length ? await db.update(couriers).set(set).where(eq(couriers.id, cur.id)).returning() : [cur];
      return J({ item: (await courierRows(business.id, [row]))[0] });
    }, { feature: "courier", manager: true, roles: ["cashier"] }),
    remove: withAuth<{ id: string }>(async (_req, { business }, { id }) => {
      const [cur] = await db.select().from(couriers).where(and(eq(couriers.id, Number(id)), eq(couriers.businessId, business.id)));
      if (!cur) throw new HttpError(404, "پیک پیدا نشد");
      const [act] = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.courierId, cur.id), inArray(orders.deliveryStatus, ["assigned", "picked_up"])));
      if (act.n > 0) throw new HttpError(400, "این پیک سفارش فعال دارد؛ ابتدا سفارش‌ها را به پیک دیگری بسپارید");
      await db.delete(couriers).where(eq(couriers.id, cur.id));
      if (cur.userId) await db.delete(users).where(eq(users.id, cur.userId));
      return J({ ok: true });
    }, { feature: "courier", manager: true, roles: ["cashier"] }),
  },

  /** add several tables at once: prefix + running number (e.g. «میز ۵» … «میز ۱۲») */
  tablebulk: {
    create: withAuth(async (req, { business }) => {
      const b = await readJson(req);
      const prefix = str(b.prefix, 30) || "میز";
      const from = Math.max(1, Math.min(9999, Math.round(Number(b.from)) || 1));
      const count = Math.round(Number(b.count));
      if (!Number.isFinite(count) || count < 1 || count > 60) throw new HttpError(400, "تعداد میزها باید بین ۱ تا ۶۰ باشد");
      const zone = str(b.zone, 40) || "سالن اصلی";
      const capacity = Math.max(1, Math.min(100, Math.round(Number(b.capacity)) || 4));
      const existing = new Set((await db.select({ n: diningTables.name }).from(diningTables).where(eq(diningTables.businessId, business.id))).map((r) => r.n.trim().toLowerCase()));
      const rows = [] as { businessId: number; name: string; zone: string; capacity: number }[];
      for (let i = 0; i < count; i++) {
        const name = `${prefix} ${from + i}`;
        if (!existing.has(name.toLowerCase())) rows.push({ businessId: business.id, name, zone, capacity });
      }
      if (!rows.length) throw new HttpError(409, "همه‌ی این نام‌ها از قبل وجود دارند");
      await db.insert(diningTables).values(rows);
      return J({ item: { id: 1, added: rows.length, skipped: count - rows.length } }, 201);
    }, { feature: ["self_order", "cashier_pos"], manager: true, roles: ["cashier"] }),
  },

  suppliers: {
    list: withAuth(async (_req, { business }) => {
      const rows = await db.select().from(suppliers).where(eq(suppliers.businessId, business.id)).orderBy(asc(suppliers.name));
      return J({ items: await withBalances(business.id, rows) });
    }, { feature: FEAT }),
    create: withAuth(async (req, { business }) => {
      const f = supplierFields(await readJson(req));
      if (!f.name) throw new HttpError(400, "نام تأمین‌کننده را وارد کنید");
      const [dup] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.businessId, business.id), eq(suppliers.name, f.name)));
      if (dup) throw new HttpError(409, "تأمین‌کننده‌ای با این نام قبلاً ثبت شده است");
      const acc = await ensureSupplierAccount(business, f.name);
      const [row] = await db.insert(suppliers).values({ ...f, businessId: business.id, accountId: acc.id }).returning();
      return J({ item: (await withBalances(business.id, [row]))[0] }, 201);
    }, { feature: FEAT, manager: true, roles: WRITERS }),
    update: withAuth<{ id: string }>(async (req, { business }, { id }) => {
      const b = await readJson(req);
      const set: Record<string, unknown> = {};
      const f = supplierFields(b);
      for (const k of ["name", "contactPerson", "phone", "address", "taxId", "bankInfo", "note"] as const) if (typeof b[k] === "string") set[k] = f[k];
      if (typeof b.isActive === "boolean") set.isActive = b.isActive;
      if ("name" in set && !set.name) throw new HttpError(400, "نام تأمین‌کننده را وارد کنید");
      if (!Object.keys(set).length) throw new HttpError(400, "تغییری ارسال نشد");
      const [row] = await db.update(suppliers).set(set).where(and(eq(suppliers.id, Number(id)), eq(suppliers.businessId, business.id))).returning();
      if (!row) throw new HttpError(404, "تأمین‌کننده پیدا نشد");
      if (set.name && row.accountId) await db.update(accAccounts).set({ name: `تأمین‌کننده — ${row.name}`.slice(0, 100) }).where(eq(accAccounts.id, row.accountId));
      return J({ item: (await withBalances(business.id, [row]))[0] });
    }, { feature: FEAT, manager: true, roles: WRITERS }),
    remove: withAuth<{ id: string }>(async (_req, { business }, { id }) => {
      const [s] = await db.select().from(suppliers).where(and(eq(suppliers.id, Number(id)), eq(suppliers.businessId, business.id)));
      if (!s) throw new HttpError(404, "تأمین‌کننده پیدا نشد");
      const [mv] = await db.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.supplierId, s.id)).limit(1);
      const hasLines = s.accountId ? (await accountTotals(business.id, [s.accountId])).has(s.accountId) : false;
      if (mv || hasLines) throw new HttpError(400, "این تأمین‌کننده خرید یا گردش مالی دارد و قابل حذف نیست؛ غیرفعالش کنید");
      await db.delete(suppliers).where(eq(suppliers.id, s.id));
      if (s.accountId) await db.delete(accAccounts).where(eq(accAccounts.id, s.accountId)).catch(() => undefined);
      return J({ ok: true });
    }, { feature: FEAT, manager: true, roles: WRITERS }),
    get: withAuth<{ id: string }>(async (_req, { business }, { id }) => {
      const [s] = await db.select().from(suppliers).where(and(eq(suppliers.id, Number(id)), eq(suppliers.businessId, business.id)));
      if (!s) throw new HttpError(404, "تأمین‌کننده پیدا نشد");
      const lines = s.accountId ? await accountStatement(business.id, s.accountId) : [];
      const purchases = await db.select().from(stockMovements).where(and(eq(stockMovements.supplierId, s.id), eq(stockMovements.type, "in"))).orderBy(desc(stockMovements.id)).limit(50);
      return J({ supplier: (await withBalances(business.id, [s]))[0], lines, purchasesCount: purchases.length });
    }, { feature: FEAT }),
  },

  /** pay (settle) a supplier's debt — posts: debit supplier account / credit cash or bank */
  supplierpay: {
    create: withAuth(async (req, auth) => {
      const { business } = auth;
      const b = await readJson(req);
      const amount = Math.round(Number(b.amount));
      if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "مبلغ پرداخت نامعتبر است");
      const [s] = await db.select().from(suppliers).where(and(eq(suppliers.id, Number(b.supplierId)), eq(suppliers.businessId, business.id)));
      if (!s || !s.accountId) throw new HttpError(404, "تأمین‌کننده پیدا نشد");
      const owed = (await withBalances(business.id, [s]))[0].balance;
      if (amount > owed) throw new HttpError(400, `مبلغ بیش از بدهی فعلی (${owed.toLocaleString("fa-IR")} تومان) است`);
      const date = b.date ? new Date(String(b.date)) : new Date();
      if (isNaN(date.getTime())) throw new HttpError(400, "تاریخ نامعتبر است");
      const from = b.from === "bank" ? "bank" : "cash";
      const doc = await postDocument(business, {
        date, source: "manual", createdBy: auth.user.name,
        description: `پرداخت بدهی به ${s.name}${str(b.note, 100) ? ` — ${str(b.note, 100)}` : ""}`,
        lines: [{ accountId: s.accountId, debit: amount, description: "تسویه بدهی" }, { accountId: await payFromAccountId(business, from), credit: amount, description: from === "bank" ? "پرداخت از بانک" : "پرداخت نقدی" }],
      });
      return J({ item: { id: doc.id, number: doc.number } }, 201);
    }, { feature: "accounting", manager: true, roles: ["accountant"] }),
  },

  /** card-terminal (POS) payment requests: picked up by a bridge agent / vendor driver, or confirmed manually */
  posrequests: {
    list: withAuth(async (_req, { business }) => {
      await expirePosRequests(business.id);
      const rows = await db.select({ r: posRequests, n: orders.number }).from(posRequests).innerJoin(orders, eq(orders.id, posRequests.orderId)).where(eq(posRequests.businessId, business.id)).orderBy(desc(posRequests.id)).limit(40);
      return J({ items: rows.map((x) => ({ ...x.r, orderNumber: x.n })) });
    }, { feature: "tablet_pos" }),
    create: withAuth(async (req, { business }) => {
      const b = await readJson(req);
      const device = await posDeviceForChannel(business.id, "cashier", b.deviceId ? Number(b.deviceId) : null);
      if (!device) throw new HttpError(400, "هیچ کارتخوانی با حساب تسویه به صندوق سفارش متصل نیست");
      const { req: row, orderNumber } = await createPosRequest(business, Number(b.orderId), device.id, undefined, "cashier");
      return J({ item: { ...row, orderNumber } }, 201);
    }, { feature: "tablet_pos", manager: true, roles: ["cashier", "waiter"] }),
    update: withAuth<{ id: string }>(async (req, auth, { id }) => {
      const b = await readJson(req);
      const st = String(b.status);
      if (!["approved", "failed", "canceled"].includes(st)) throw new HttpError(400, "وضعیت نامعتبر است");
      const [r] = await db.select().from(posRequests).where(and(eq(posRequests.id, Number(id)), eq(posRequests.businessId, auth.business.id)));
      if (!r) throw new HttpError(404, "درخواست پیدا نشد");
      if (r.status === "approved") throw new HttpError(400, "این درخواست قبلاً پرداخت‌شده ثبت شده است");
      if (r.status !== "pending" && st !== "approved") throw new HttpError(400, "این درخواست قبلاً نهایی شده است");
      if (st === "approved") await approvePosRequest(auth.business, auth.features, r, str(b.refNo, 40));
      else await db.update(posRequests).set({ status: st, detail: str(b.detail, 200), updatedAt: new Date() }).where(eq(posRequests.id, r.id));
      const [row] = await db.select().from(posRequests).where(eq(posRequests.id, r.id));
      return J({ item: row });
    }, { feature: "tablet_pos", manager: true, roles: ["cashier"] }),
  },

  /** pager transmitter acknowledged the ring command */
  pagerack: {
    create: withAuth(async (req, { business }) => {
      const b = await readJson(req);
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger);
      if (ids.length) await db.update(pagers).set({ ringSentAt: new Date() }).where(and(eq(pagers.businessId, business.id), inArray(pagers.id, ids)));
      return J({ item: { id: 1, acked: ids.length } }, 201);
    }, { feature: "foodcourt_pager", manager: true, roles: ["cashier", "waiter", "chef"] }),
  },
};

/** Pager updates that switch a pager to "ringing" must queue a ring command for the transmitter. */
export function withPagerRing(base: any) {
  return {
    ...base,
    update: async (req: Request, ctx: any) => {
      const body = await req.clone().json().catch(() => ({}));
      const res: Response = await base.update(req, ctx);
      if (res.ok && body?.status === "ringing") {
        const { id } = await ctx.params;
        await db.update(pagers).set({ ringRequestedAt: new Date(), ringSentAt: null }).where(eq(pagers.id, Number(id)));
      }
      return res;
    },
  };
}
void C;
