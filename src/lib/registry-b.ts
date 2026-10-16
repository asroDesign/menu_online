/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  suppliers, campaigns, categories, customers, inventoryItems, orderItems, orders, payments, products, recipes,
  stockMovements, stockReceipts, ticketMessages, tickets, transactions, translations, walletEntries, bankAccounts, crossSellRules,
} from "@/db/schema";
import { HttpError, readJson, withAuth, can, type AuthContext } from "@/lib/auth";
import { saveStockReceipt } from "@/lib/stock-receipts";
import { TICKET_DEPTS } from "@/lib/admin-meta";
import { smsRegistry } from "@/lib/registry-sms";
import { addWalletEntry, normPhone, settingsOf } from "@/lib/orders";

const tehranDay = (d: Date | number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date(d));
const tehranHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", hour12: false }).format(d)) % 24;
const daysParam = (req: Request, def = 14) => Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || def));
const since = (days: number) => new Date(Date.now() - days * 86400_000);
const J = (data: unknown, status = 200) => Response.json(data, { status });
const strOf = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function applyMovement(biz: AuthContext["business"], itemId: number, type: string, quantity: number, note: string) {
  const result = await saveStockReceipt(biz, { itemId, type, quantity, note });
  return result.items[0];
}
function messaging(channel: "sms" | "bale") {
  return {
    list: withAuth(
      async (_req, { business }) => {
        const items = await db.select().from(campaigns).where(and(eq(campaigns.businessId, business.id), eq(campaigns.channel, channel))).orderBy(desc(campaigns.id)).limit(100);
        const s = settingsOf(business);
        return J({ items, sender: channel === "sms" ? (s.smsSender ?? "") : (s.baleBot ?? ""), simulated: !process.env.SMS_API_KEY });
      },
      { feature: channel },
    ),
    create: withAuth(
      async (req, { business }) => {
        if (channel === "bale") throw new HttpError(400, "ارسال پیام تبلیغاتی در بله نیازمند ربات تأییدشده و شناسه‌ی گفتگوی (chat_id) هر مشتری است و در این نسخه به سرویس بله متصل نشده است.");
        const b = await readJson(req);
        const body = strOf(b.body, 500);
        if (body.length < 3) throw new HttpError(400, "متن پیام را وارد کنید");
        const kind = b.kind === "service" ? "service" : "promo";
        const audience = ["all", "vip", "inactive", "manual"].includes(String(b.audience)) ? String(b.audience) : "all";
        let recipients = 0;
        if (audience === "manual") {
          recipients = new Set(String(b.numbers ?? "").split(/[\s,،;\n]+/).map(normPhone).filter((p) => p.length >= 10)).size;
        } else {
          const cond = audience === "vip" ? sql`${customers.points} >= 800` : audience === "inactive" ? sql`${customers.ordersCount} <= 1` : sql`true`;
          const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(customers).where(and(eq(customers.businessId, business.id), cond));
          recipients = r.n;
        }
        if (recipients === 0) throw new HttpError(400, "گیرنده‌ای برای این گروه پیدا نشد");
        const [row] = await db.insert(campaigns).values({ businessId: business.id, channel, kind, audience, body, recipients }).returning();
        return J({ item: row }, 201);
      },
      { feature: channel },
    ),
  };
}

const walletlog = {
  list: withAuth(
    async (_req, { business }) => {
      const rows = await db
        .select({ e: walletEntries, name: customers.name, phone: customers.phone })
        .from(walletEntries)
        .innerJoin(customers, eq(customers.id, walletEntries.customerId))
        .where(eq(walletEntries.businessId, business.id))
        .orderBy(desc(walletEntries.id))
        .limit(150);
      return J({ items: rows.map((r) => ({ ...r.e, customerName: r.name, phone: r.phone })) });
    },
    { feature: "cashback" },
  ),
  create: withAuth(
    async (req, { business }) => {
      const b = await readJson(req);
      const amount = Math.round(Number(b.amount));
      if (!Number.isFinite(amount) || amount === 0) throw new HttpError(400, "مبلغ نامعتبر است");
      const [c] = await db.select().from(customers).where(and(eq(customers.id, Number(b.customerId)), eq(customers.businessId, business.id)));
      if (!c) throw new HttpError(404, "مشتری پیدا نشد");
      await addWalletEntry(business.id, c.id, amount, "adjust", null, strOf(b.note, 120) || "تعدیل دستی");
      return J({ item: { id: -1 } }, 201);
    },
    { feature: "cashback", manager: true },
  ),
};

const ticketsH = {
  list: withAuth(
    async (_req, { business }) => {
      const rows = await db.select().from(tickets).where(eq(tickets.businessId, business.id)).orderBy(desc(tickets.updatedAt));
      const msgs = rows.length ? await db.select().from(ticketMessages).where(and(inArray(ticketMessages.ticketId, rows.map((r) => r.id)), eq(ticketMessages.internal, false))).orderBy(asc(ticketMessages.id)) : [];
      return J({ items: rows.map((r) => { const m = msgs.filter((x) => x.ticketId === r.id); return { ...r, messageCount: m.length, lastMessage: m[m.length - 1]?.body ?? "" }; }) });
    },
    { feature: "support" },
  ),
  create: withAuth(
    async (req, { business, user }) => {
      const b = await readJson(req);
      const subject = strOf(b.subject, 140);
      const body = strOf(b.body, 3000);
      if (!subject || !body) throw new HttpError(400, "موضوع و متن پیام را وارد کنید");
      const department = Object.keys(TICKET_DEPTS).includes(String(b.department)) ? String(b.department) : "support";
      const [t] = await db.insert(tickets).values({ businessId: business.id, subject, department, priority: ["low", "normal", "high"].includes(String(b.priority)) ? String(b.priority) : "normal" }).returning();
      await db.insert(ticketMessages).values({ ticketId: t.id, authorRole: "user", authorName: user.name, body });
      return J({ item: { ...t, messageCount: 1, lastMessage: body } }, 201);
    },
    { feature: "support" },
  ),
  get: withAuth<{ id: string }>(
    async (_req, { business }, { id }) => {
      const [t] = await db.select().from(tickets).where(and(eq(tickets.id, Number(id)), eq(tickets.businessId, business.id)));
      if (!t) throw new HttpError(404, "تیکت پیدا نشد");
      const messages = await db.select().from(ticketMessages).where(and(eq(ticketMessages.ticketId, t.id), eq(ticketMessages.internal, false))).orderBy(asc(ticketMessages.id));
      return J({ ticket: { ...t, assignedTo: undefined }, messages });
    },
    { feature: "support" },
  ),
  update: withAuth<{ id: string }>(
    async (req, { business, user }, { id }) => {
      const b = await readJson(req);
      const [t] = await db.select().from(tickets).where(and(eq(tickets.id, Number(id)), eq(tickets.businessId, business.id)));
      if (!t) throw new HttpError(404, "تیکت پیدا نشد");
      const reply = strOf(b.reply, 3000);
      if (reply) await db.insert(ticketMessages).values({ ticketId: t.id, authorRole: "user", authorName: user.name, body: reply });
      const status = b.status === "closed" ? "closed" : reply ? "open" : t.status;
      const [row] = await db.update(tickets).set({ status, updatedAt: new Date() }).where(eq(tickets.id, t.id)).returning();
      return J({ item: row });
    },
    { feature: "support" },
  ),
};

const translationsH = {
  list: withAuth(
    async (req, { business }) => {
      const lang = new URL(req.url).searchParams.get("lang");
      const rows = await db.select().from(translations).where(and(eq(translations.businessId, business.id), lang ? eq(translations.lang, lang) : undefined));
      return J({ items: rows });
    },
    { feature: "translation" },
  ),
  create: withAuth(
    async (req, { business }) => {
      const b = await readJson(req);
      const entityType = b.entityType === "category" ? "category" : "product";
      const entityId = Number(b.entityId);
      const lang = strOf(b.lang, 5);
      if (!lang || !Number.isInteger(entityId)) throw new HttpError(400, "درخواست نامعتبر است");
      const tbl: any = entityType === "category" ? categories : products;
      const [own] = await db.select({ id: tbl.id }).from(tbl).where(and(eq(tbl.id, entityId), eq(tbl.businessId, business.id)));
      if (!own) throw new HttpError(404, "مورد پیدا نشد");
      const name = strOf(b.name, 120);
      const description = strOf(b.description, 400);
      if (!name && !description) {
        await db.delete(translations).where(and(eq(translations.businessId, business.id), eq(translations.entityType, entityType), eq(translations.entityId, entityId), eq(translations.lang, lang)));
        return J({ item: { id: 0 } });
      }
      const [row] = await db.insert(translations).values({ businessId: business.id, entityType, entityId, lang, name, description })
        .onConflictDoUpdate({ target: [translations.businessId, translations.entityType, translations.entityId, translations.lang], set: { name, description } }).returning();
      return J({ item: row }, 201);
    },
    { feature: "translation", manager: true },
  ),
};

const stock = {
  list: withAuth(
    async (_req, { business }) => {
      const rows = await db
        .select({ m: stockMovements, itemName: inventoryItems.name, unit: inventoryItems.unit, supplierName: suppliers.name, documentId: stockReceipts.documentId, receiptTotal: stockReceipts.total })
        .from(stockMovements)
        .innerJoin(inventoryItems, eq(inventoryItems.id, stockMovements.itemId))
        .leftJoin(suppliers, eq(suppliers.id, stockMovements.supplierId))
        .leftJoin(stockReceipts, eq(stockReceipts.id, stockMovements.receiptId))
        .where(eq(stockMovements.businessId, business.id))
        .orderBy(desc(stockMovements.id))
        .limit(300);
      return J({ items: rows.map((r) => ({ ...r.m, itemName: r.itemName, unit: r.unit, supplierName: r.supplierName, documentId: r.documentId, receiptTotal: r.receiptTotal })) });
    },
    { feature: "stock_movements" },
  ),
  create: withAuth(
    async (req, auth) => {
      const b = await readJson(req);
      if (Array.isArray(b.lines) && b.lines.some((l: { newItem?: unknown }) => l?.newItem) && !can(auth, "inventory")) throw new HttpError(403, "دسترسی تعریف کالای جدید ندارید");
      const result = await saveStockReceipt(auth.business, b, auth.user.name);
      return J({ item: result.items[0], ...result }, result.replay ? 200 : 201);
    },
    { feature: "stock_movements", manager: true, roles: ["warehouse", "accountant"] },
  ),
};

const stockcount = {
  create: withAuth(
    async (req, { business }) => {
      const b = await readJson(req);
      const row = await applyMovement(business, Number(b.itemId), "adjust", Number(b.counted), "شمارش و تطبیق موجودی");
      return J({ item: row }, 201);
    },
    { feature: "stock_control" },
  ),
};

const costing = {
  list: withAuth(
    async (_req, { business }) => {
      const [prods, items, rs] = await Promise.all([
        db.select().from(products).where(eq(products.businessId, business.id)).orderBy(asc(products.id)),
        db.select().from(inventoryItems).where(eq(inventoryItems.businessId, business.id)),
        db.select().from(recipes).where(eq(recipes.businessId, business.id)),
      ]);
      const out = prods.map((p) => {
        const lines = rs.filter((r) => r.productId === p.id).map((r) => {
          const it = items.find((i) => i.id === r.itemId);
          return { name: it?.name ?? "؟", unit: it?.unit ?? "", qty: r.quantity, cost: Math.round(r.quantity * (it?.costPerUnit ?? 0)) };
        });
        const cost = lines.reduce((s, l) => s + l.cost, 0);
        return { id: p.id, name: p.name, emoji: p.emoji, price: p.price, cost, hasRecipe: lines.length > 0, margin: p.price - cost, marginPct: p.price ? Math.round(((p.price - cost) / p.price) * 100) : 0, lines };
      });
      return J({ items: out });
    },
    { feature: "costing" },
  ),
};

const reportSales = {
  list: withAuth(
    async (req, { business }) => {
      const days = daysParam(req);
      const from = since(days);
      const rows = await db.select().from(orders).where(and(eq(orders.businessId, business.id), eq(orders.status, "paid"), gte(orders.createdAt, from)));
      const series: Record<string, { date: string; revenue: number; orders: number }> = {};
      for (let i = days - 1; i >= 0; i--) { const t = Date.now() - i * 86400_000; series[tehranDay(t)] = { date: new Date(t).toISOString(), revenue: 0, orders: 0 }; }
      const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 }));
      const methods: Record<string, { method: string; amount: number; count: number }> = {};
      const types: Record<string, { type: string; amount: number; count: number }> = {};
      for (const o of rows) {
        const d = series[tehranDay(o.createdAt)];
        if (d) { d.revenue += o.total; d.orders++; }
        const h = hours[tehranHour(o.createdAt)]; h.orders++; h.revenue += o.total;
        const m = o.paymentMethod ?? "cash"; (methods[m] ??= { method: m, amount: 0, count: 0 }).amount += o.total; methods[m].count++;
        (types[o.type] ??= { type: o.type, amount: 0, count: 0 }).amount += o.total; types[o.type].count++;
      }
      const base = and(eq(orders.businessId, business.id), eq(orders.status, "paid"), gte(orders.createdAt, from));
      const byProduct = await db
        .select({ name: orderItems.name, emoji: sql<string>`max(${orderItems.emoji})`, qty: sql<number>`sum(${orderItems.quantity})::int`, revenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.price})::int` })
        .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(base).groupBy(orderItems.name).orderBy(desc(sql`sum(${orderItems.quantity} * ${orderItems.price})`)).limit(10);
      const byCategory = await db
        .select({ name: sql<string>`coalesce(${categories.name}, 'بدون دسته')`, revenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.price})::int`, qty: sql<number>`sum(${orderItems.quantity})::int` })
        .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).leftJoin(products, eq(products.id, orderItems.productId)).leftJoin(categories, eq(categories.id, products.categoryId))
        .where(base).groupBy(categories.name).orderBy(desc(sql`sum(${orderItems.quantity} * ${orderItems.price})`));
      const revenue = rows.reduce((s, o) => s + o.total, 0);
      return J({ days, totals: { revenue, orders: rows.length, avg: rows.length ? Math.round(revenue / rows.length) : 0, discounts: rows.reduce((s, o) => s + o.discountAmount, 0), tax: rows.reduce((s, o) => s + o.tax, 0) }, series: Object.values(series), hours, methods: Object.values(methods), types: Object.values(types), byProduct, byCategory });
    },
    { feature: "sales_reports" },
  ),
};

const reportPnl = {
  list: withAuth(
    async (req, { business }) => {
      const days = daysParam(req);
      const from = since(days);
      const paid = await db.select().from(orders).where(and(eq(orders.businessId, business.id), eq(orders.status, "paid"), gte(orders.createdAt, from)));
      const cogsRes: any = await db.execute(sql`
        select o.id as oid, o.created_at as at, sum(oi.quantity * r.quantity * ii.cost_per_unit)::float8 as cogs
        from order_items oi join orders o on o.id = oi.order_id
        join recipes r on r.product_id = oi.product_id join inventory_items ii on ii.id = r.item_id
        where o.business_id = ${business.id} and o.status = 'paid' and o.created_at >= ${from}
        group by o.id, o.created_at`);
      const tx = await db.select().from(transactions).where(and(eq(transactions.businessId, business.id), gte(transactions.date, from), sql`${transactions.source} <> 'sale'`));
      const series: Record<string, { date: string; revenue: number; cogs: number; expenses: number }> = {};
      for (let i = days - 1; i >= 0; i--) { const t = Date.now() - i * 86400_000; series[tehranDay(t)] = { date: new Date(t).toISOString(), revenue: 0, cogs: 0, expenses: 0 }; }
      let revenue = 0, discounts = 0, tax = 0;
      for (const o of paid) { const net = o.subtotal - o.discountAmount + o.deliveryFee; revenue += net; discounts += o.discountAmount; tax += o.tax; const d = series[tehranDay(o.createdAt)]; if (d) d.revenue += net; }
      let cogs = 0;
      for (const r of cogsRes.rows) { cogs += Number(r.cogs); const d = series[tehranDay(new Date(r.at))]; if (d) d.cogs += Number(r.cogs); }
      const exp: Record<string, number> = {};
      let otherIncome = 0, expenses = 0;
      for (const t of tx) {
        if (t.kind === "expense") { expenses += t.amount; exp[t.category || "سایر"] = (exp[t.category || "سایر"] ?? 0) + t.amount; const d = series[tehranDay(t.date)]; if (d) d.expenses += t.amount; }
        else otherIncome += t.amount;
      }
      const gross = revenue - cogs;
      return J({ days, revenue, discounts, tax, cogs: Math.round(cogs), grossProfit: Math.round(gross), expenses, otherIncome, net: Math.round(gross - expenses + otherIncome), expenseBreakdown: Object.entries(exp).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount), series: Object.values(series).map((s) => ({ ...s, cogs: Math.round(s.cogs) })), cogsCoverage: paid.length ? Math.round((cogsRes.rows.length / paid.length) * 100) : 0 });
    },
    { feature: "profit_loss" },
  ),
};

const reportBank = {
  list: withAuth(
    async (req, { business }) => {
      const days = daysParam(req, 30);
      const from = since(days);
      const accs = await db.select().from(bankAccounts).where(eq(bankAccounts.businessId, business.id)).orderBy(asc(bankAccounts.id));
      const agg = await db
        .select({ id: transactions.bankAccountId, kind: transactions.kind, total: sql<number>`sum(${transactions.amount})::float8`, rng: sql<number>`coalesce(sum(case when ${transactions.date} >= ${from} then ${transactions.amount} else 0 end),0)::float8` })
        .from(transactions).where(eq(transactions.businessId, business.id)).groupBy(transactions.bankAccountId, transactions.kind);
      const calc = (id: number | null, opening: number, name: string, bank: string, number: string) => {
        const g = (k: string, f: "total" | "rng") => Number(agg.find((a) => a.id === id && a.kind === k)?.[f] ?? 0);
        return { id, name, bank, accountNumber: number, opening, income: g("income", "rng"), expense: g("expense", "rng"), balance: opening + g("income", "total") - g("expense", "total") };
      };
      const rows = [calc(null, 0, "صندوق (نقدی)", "—", ""), ...accs.map((a) => calc(a.id, a.openingBalance, a.name, a.bank, a.accountNumber))];
      const recent = await db.select().from(transactions).where(eq(transactions.businessId, business.id)).orderBy(desc(transactions.date)).limit(25);
      return J({ days, accounts: rows, total: rows.reduce((s, r) => s + r.balance, 0), recent: recent.map((t) => ({ ...t, accountName: rows.find((r) => r.id === t.bankAccountId)?.name ?? "صندوق (نقدی)" })) });
    },
    { feature: "bank_report" },
  ),
};

const paymentsH = {
  list: withAuth(
    async (_req, { business }) => {
      const rows = await db.select({ p: payments, number: orders.number }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(eq(payments.businessId, business.id)).orderBy(desc(payments.id)).limit(200);
      return J({ items: rows.map((r) => ({ ...r.p, orderNumber: r.number })) });
    },
    { feature: ["ipg", "installment"] },
  ),
};

export async function topPairs(bizId: number, limit = 12) {
  const res: any = await db.execute(sql`
    select a.product_id as a, b.product_id as b, count(*)::int as n
    from order_items a join order_items b on a.order_id = b.order_id and a.product_id < b.product_id
    join orders o on o.id = a.order_id
    where o.business_id = ${bizId} and a.product_id is not null and b.product_id is not null
    group by 1, 2 order by n desc limit ${limit}`);
  return res.rows as { a: number; b: number; n: number }[];
}

export async function recommendFor(bizId: number, ids: number[], auto: boolean) {
  if (!ids.length) return [];
  const manual = await db.select().from(crossSellRules).where(and(eq(crossSellRules.businessId, bizId), inArray(crossSellRules.productId, ids)));
  const score = new Map<number, number>();
  for (const m of manual) score.set(m.suggestedId, (score.get(m.suggestedId) ?? 0) + 1000);
  if (auto) {
    const pairs = await topPairs(bizId, 200);
    for (const p of pairs) {
      if (ids.includes(p.a) && !ids.includes(p.b)) score.set(p.b, (score.get(p.b) ?? 0) + p.n);
      if (ids.includes(p.b) && !ids.includes(p.a)) score.set(p.a, (score.get(p.a) ?? 0) + p.n);
    }
  }
  const top = [...score.entries()].filter(([id]) => !ids.includes(id)).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
  if (!top.length) return [];
  return db.select().from(products).where(and(eq(products.businessId, bizId), inArray(products.id, top), eq(products.isAvailable, true)));
}

const crosssellauto = {
  list: withAuth(
    async (_req, { business }) => {
      const pairs = await topPairs(business.id);
      const ps = await db.select({ id: products.id, name: products.name, emoji: products.emoji }).from(products).where(eq(products.businessId, business.id));
      const nm = (id: number) => ps.find((p) => p.id === id);
      return J({ items: pairs.map((p, i) => ({ id: i + 1, a: nm(p.a), b: nm(p.b), count: p.n })).filter((p) => p.a && p.b) });
    },
    { feature: "cross_sell" },
  ),
};

async function aiDescribe(auth: AuthContext, productId: number, tone: string) {
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.businessId, auth.business.id)));
  if (!p) throw new HttpError(404, "محصول پیدا نشد");
  const [cat] = p.categoryId ? await db.select().from(categories).where(eq(categories.id, p.categoryId)) : [];
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: "تو کپی‌رایتر منوی رستوران هستی. فقط یک توضیح کوتاه ۱ تا ۲ جمله‌ای فارسی بنویس." }, { role: "user", content: `نام: ${p.name}\nدسته: ${cat?.name ?? ""}\nتوضیح فعلی: ${p.description}\nلحن: ${tone}` }] }),
      });
      const j: any = await r.json();
      const text = j?.choices?.[0]?.message?.content?.trim();
      if (text) return { text, engine: "openai" };
    } catch { /* fall back to template */ }
  }
  const tones: Record<string, string[]> = {
    friendly: ["با عشق و دقت", "خوش‌طعم و دلچسب"],
    luxury: ["با مواد درجه‌یک و ارائه‌ای شیک", "تجربه‌ای لوکس و فراموش‌نشدنی"],
    short: ["تازه و خوشمزه", "انتخابی مطمئن"],
  };
  const [a, b] = tones[tone] ?? tones.friendly;
  const base = p.description ? `${p.description.replace(/[.،]+$/, "")}. ` : "";
  return { text: `${p.emoji} ${p.name}${cat ? ` از دسته ${cat.name}` : ""}، ${a} آماده می‌شود. ${base}${b}؛ تقریباً ${p.prepMinutes} دقیقه تا سرو.`, engine: "template" };
}

const ai = {
  list: withAuth(
    async (_req, auth) => {
      const { business } = auth;
      const from = since(14);
      const base = and(eq(orders.businessId, business.id), eq(orders.status, "paid"), gte(orders.createdAt, from));
      const sold = await db.select({ pid: orderItems.productId, name: orderItems.name, qty: sql<number>`sum(${orderItems.quantity})::int` }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(base).groupBy(orderItems.productId, orderItems.name).orderBy(desc(sql`sum(${orderItems.quantity})`));
      const prods = await db.select().from(products).where(eq(products.businessId, business.id));
      const soldIds = new Set(sold.map((s) => s.pid));
      const slow = prods.filter((p) => p.isAvailable && !soldIds.has(p.id)).slice(0, 5);
      const os = await db.select().from(orders).where(base);
      const hours = Array.from({ length: 24 }, () => 0);
      for (const o of os) hours[tehranHour(o.createdAt)]++;
      const peak = hours.indexOf(Math.max(...hours));
      const avg = os.length ? Math.round(os.reduce((s, o) => s + o.total, 0) / os.length) : 0;
      const low = can(auth, "inventory") ? await db.select().from(inventoryItems).where(and(eq(inventoryItems.businessId, business.id), sql`${inventoryItems.stock} <= ${inventoryItems.minStock}`)) : [];
      const tips: string[] = [];
      if (sold[0]) tips.push(`«${sold[0].name}» پرفروش‌ترین محصول ۱۴ روز اخیر است؛ آن را در جایگاه اول منو و بخش «ویژه» قرار دهید.`);
      if (slow.length) tips.push(`${slow.length} محصول در ۱۴ روز گذشته فروشی نداشته‌اند (${slow.map((s) => s.name).join("، ")}). تخفیف یا تصویر جذاب‌تر امتحان کنید.`);
      if (os.length) tips.push(`ساعت اوج سفارش حوالی ${peak}:۰۰ است؛ نیروی بیشتری برای این بازه برنامه‌ریزی کنید.`);
      if (avg) tips.push("با فعال‌کردن «پیشنهاد مکمل» می‌توانید میانگین سبد خرید را بالا ببرید.");
      if (low.length) tips.push(`موجودی ${low.map((l) => l.name).slice(0, 4).join("، ")} به حداقل رسیده؛ سفارش خرید ثبت کنید.`);
      if (!tips.length) tips.push("هنوز داده‌ی کافی برای تحلیل وجود ندارد. با ثبت سفارش‌های بیشتر، پیشنهادها دقیق‌تر می‌شوند.");
      return J({ top: sold.slice(0, 5), slow: slow.map((s) => ({ id: s.id, name: s.name })), peakHour: peak, hasOrders: os.length > 0, avgTicket: avg, lowStock: low.map((l) => ({ name: l.name, stock: l.stock, unit: l.unit })), tips, engine: process.env.OPENAI_API_KEY ? "openai" : "rules" });
    },
    { feature: "ai" },
  ),
  create: withAuth(
    async (req, auth) => {
      const b = await readJson(req);
      return J({ item: { id: 1, ...(await aiDescribe(auth, Number(b.productId), String(b.tone ?? "friendly"))) } }, 201);
    },
    { feature: "ai" },
  ),
};

export const registryB: Record<string, any> = {
  ...smsRegistry,
  bale: messaging("bale"),
  walletlog,
  tickets: ticketsH,
  translations: translationsH,
  stock,
  stockcount,
  costing,
  report_sales: reportSales,
  report_pnl: reportPnl,
  report_bank: reportBank,
  payments: paymentsH,
  crosssellauto,
  ai,
};
