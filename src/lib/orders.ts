/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, max, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccounts,
  businesses,
  couriers,
  customers,
  deliveryZones,
  devices,
  diningTables,
  discountCodes,
  inventoryItems,
  orderItems,
  orders,
  payments,
  printJobs,
  products,
  recipes,
  staff,
  stockMovements,
  transactions,
  walletEntries,
} from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { hasAny, type FeatureMap, type Settings } from "@/lib/plans";
import { postOrderSale } from "@/lib/accounting";
import { haversineKm } from "@/lib/geo";

type Biz = typeof businesses.$inferSelect;

export type OrderInput = {
  tableId?: number | null;
  waiterId?: number | null;
  customerName?: string;
  customerPhone?: string;
  type?: string;
  note?: string;
  appendTo?: number | null;
  address?: string;
  zoneId?: number | null;
  scheduledFor?: string | null;
  lat?: number | null;
  lng?: number | null;
  discountCode?: string;
  useCashback?: boolean;
  payNow?: string | null; // staff: settle immediately with this method
  payment?: string | null; // customer: cash | ipg | snappay | digipay
  items: { productId: number; quantity: number; note?: string }[];
};

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";
export function normPhone(p: string) {
  let s = p
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/\D/g, "");
  if (s.startsWith("98")) s = "0" + s.slice(2);
  if (s.length === 10 && s.startsWith("9")) s = "0" + s;
  return s;
}

export const settingsOf = (biz: Biz) => (biz.settings ?? {}) as Settings;

export function computeTotals(
  biz: Biz,
  p: { subtotal: number; discount: number; deliveryFee: number; type: string },
) {
  const base = Math.max(0, p.subtotal - p.discount);
  const tax = Math.round((base * biz.taxPercent) / 100);
  const service = p.type === "delivery" ? 0 : Math.round((base * biz.servicePercent) / 100);
  return { subtotal: p.subtotal, tax, service, pre: base + tax + service + p.deliveryFee };
}

export function parseOrderInput(body: Record<string, unknown>): OrderInput {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((i) => i as Record<string, unknown>)
    .map((i) => ({
      productId: Number(i.productId),
      quantity: Math.min(50, Math.max(1, Math.floor(Number(i.quantity) || 1))),
      note: typeof i.note === "string" ? i.note.slice(0, 200) : "",
    }))
    .filter((i) => Number.isInteger(i.productId));
  if (items.length === 0) throw new HttpError(400, "سبد سفارش خالی است");
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return {
    items,
    tableId: num(body.tableId),
    waiterId: num(body.waiterId),
    appendTo: num(body.appendTo),
    zoneId: num(body.zoneId),
    customerName: str(body.customerName, 80),
    customerPhone: str(body.customerPhone, 20),
    address: str(body.address, 300),
    type: body.type === "takeaway" ? "takeaway" : body.type === "delivery" ? "delivery" : "dine_in",
    note: str(body.note, 300),
    lat: Number.isFinite(Number(body.lat)) && body.lat !== null && body.lat !== "" ? Number(body.lat) : null,
    lng: Number.isFinite(Number(body.lng)) && body.lng !== null && body.lng !== "" ? Number(body.lng) : null,
    scheduledFor: typeof body.scheduledFor === "string" && body.scheduledFor ? body.scheduledFor : null,
    discountCode: str(body.discountCode, 30).toUpperCase(),
    useCashback: Boolean(body.useCashback),
    payNow: typeof body.payNow === "string" ? body.payNow : null,
    payment: typeof body.payment === "string" ? body.payment : null,
  };
}

export async function validateDiscount(biz: Biz, code: string, subtotal: number) {
  const [d] = await db
    .select()
    .from(discountCodes)
    .where(and(eq(discountCodes.businessId, biz.id), eq(discountCodes.code, code.toUpperCase())));
  if (!d || !d.isActive) throw new HttpError(400, "کد تخفیف معتبر نیست");
  if (d.expiresAt && d.expiresAt.getTime() < Date.now()) throw new HttpError(400, "مهلت استفاده از این کد تمام شده است");
  if (d.maxUses > 0 && d.usedCount >= d.maxUses) throw new HttpError(400, "ظرفیت استفاده از این کد تکمیل شده است");
  if (subtotal < d.minOrder) throw new HttpError(400, "حداقل مبلغ سفارش برای این کد رعایت نشده است");
  const amount = Math.min(subtotal, d.type === "percent" ? Math.round((subtotal * d.value) / 100) : d.value);
  return { id: d.id, code: d.code, amount };
}

export async function addWalletEntry(
  businessId: number,
  customerId: number,
  amount: number,
  kind: "earn" | "spend" | "refund" | "adjust",
  orderId: number | null,
  note = "",
) {
  await db
    .update(customers)
    .set({ walletBalance: sql`greatest(0, ${customers.walletBalance} + ${amount})` })
    .where(eq(customers.id, customerId));
  await db.insert(walletEntries).values({ businessId, customerId, orderId, kind, amount, note });
}

export async function createOrder(biz: Biz, input: OrderInput, source: string, features: FeatureMap, opts: { hold?: boolean } = {}) {
  const can = (k: string) => hasAny(features, k);
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const prods = await db
    .select()
    .from(products)
    .where(and(eq(products.businessId, biz.id), inArray(products.id, ids)));
  const byId = new Map(prods.map((p) => [p.id, p]));
  for (const it of input.items) {
    const p = byId.get(it.productId);
    if (!p) throw new HttpError(400, "یکی از محصولات پیدا نشد");
    if (!p.isAvailable) throw new HttpError(400, `«${p.name}» در حال حاضر موجود نیست`);
  }

  const newItems = input.items.map((it) => {
    const p = byId.get(it.productId)!;
    return { productId: p.id, name: p.name, emoji: p.emoji, price: p.price, quantity: it.quantity, note: it.note ?? "" };
  });
  const addSubtotal = newItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const type = input.type ?? "dine_in";

  // ---------- append to an existing order ----------
  if (input.appendTo) {
    const [existing] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.appendTo), eq(orders.businessId, biz.id)));
    if (!existing) throw new HttpError(404, "سفارش مورد نظر پیدا نشد");
    if (existing.status === "paid" || existing.status === "canceled" || existing.paymentStatus === "paid")
      throw new HttpError(400, "این سفارش بسته شده است");
    const sub = existing.subtotal + addSubtotal;
    const t = computeTotals(biz, { subtotal: sub, discount: existing.discountAmount, deliveryFee: existing.deliveryFee, type: existing.type });
    await db.insert(orderItems).values(newItems.map((i) => ({ ...i, orderId: existing.id })));
    await db
      .update(orders)
      .set({
        subtotal: sub,
        tax: t.tax,
        service: t.service,
        total: Math.max(0, t.pre - existing.cashbackUsed),
        status: existing.status === "served" || existing.status === "ready" ? "preparing" : existing.status,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, existing.id));
    await queuePrintJobs(biz, existing.id, features, true);
    return (await listOrders(biz.id, { id: existing.id }))[0];
  }

  // ---------- validations for new orders ----------
  if (input.tableId) {
    const [t] = await db
      .select({ id: diningTables.id })
      .from(diningTables)
      .where(and(eq(diningTables.id, input.tableId), eq(diningTables.businessId, biz.id)));
    if (!t) throw new HttpError(400, "میز نامعتبر است");
  }
  if (input.waiterId) {
    const [w] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.id, input.waiterId), eq(staff.businessId, biz.id)));
    if (!w) throw new HttpError(400, "گارسون نامعتبر است");
  }

  let deliveryFee = 0;
  let zoneId: number | null = null;
  if (type === "delivery") {
    if (!can("delivery_order")) throw new HttpError(403, "سفارش دلیوری در پلن شما فعال نیست");
    if (!input.address || !input.customerPhone) throw new HttpError(400, "آدرس و شماره تماس برای ارسال الزامی است");
    if (can("zones")) {
      const zs = await db.select().from(deliveryZones).where(and(eq(deliveryZones.businessId, biz.id), eq(deliveryZones.isActive, true)));
      let z = input.zoneId ? zs.find((x) => x.id === input.zoneId) : undefined;
      const dist = biz.lat != null && biz.lng != null && input.lat != null && input.lng != null ? haversineKm({ lat: biz.lat, lng: biz.lng }, { lat: input.lat, lng: input.lng }) : null;
      if (!z && dist !== null) z = zs.filter((x) => x.radiusKm > 0 && x.radiusKm >= dist).sort((a, b) => a.radiusKm - b.radiusKm)[0];
      if (input.zoneId && !z) throw new HttpError(400, "محدوده ارسال نامعتبر است");
      if (!z && dist === null && zs.some((x) => x.radiusKm > 0) && biz.lat != null) throw new HttpError(400, "محل تحویل را روی نقشه مشخص کنید");
      if (!z && dist !== null && zs.some((x) => x.radiusKm > 0)) throw new HttpError(400, "آدرس انتخاب‌شده خارج از محدوده ارسال است");
      if (z) {
        if (z.radiusKm > 0 && dist !== null && dist > z.radiusKm) throw new HttpError(400, "آدرس انتخاب‌شده خارج از محدوده ارسال است");
        if (addSubtotal < z.minOrder) throw new HttpError(400, "مبلغ سفارش کمتر از حداقل این محدوده است");
        deliveryFee = z.fee;
        zoneId = z.id;
      }
    }
  }

  let scheduledFor: Date | null = null;
  if (input.scheduledFor) {
    if (!can("preorder")) throw new HttpError(403, "پیش‌سفارش در پلن شما فعال نیست");
    scheduledFor = new Date(input.scheduledFor);
    if (isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() + 10 * 60_000)
      throw new HttpError(400, "زمان پیش‌سفارش باید حداقل ۱۰ دقیقه بعد باشد");
  }

  let discountAmount = 0;
  let discountCode = "";
  let discountId: number | null = null;
  if (input.discountCode) {
    if (!can("discount")) throw new HttpError(403, "کد تخفیف در پلن شما فعال نیست");
    const d = await validateDiscount(biz, input.discountCode, addSubtotal);
    discountAmount = d.amount;
    discountCode = d.code;
    discountId = d.id;
  }

  // customer (loyalty club). Using cashback requires a customer who is ALREADY registered.
  let customerId: number | null = null;
  const phone = input.customerPhone ? normPhone(input.customerPhone) : "";
  const cbSet = settingsOf(biz);
  const cbOn = can("cashback") && (cbSet.cashbackEnabled ?? (cbSet.cashbackPercent ?? 0) > 0);
  if (input.useCashback) {
    if (!cbOn) throw new HttpError(400, "کش‌بک در این رستوران فعال نیست");
    if (!phone) throw new HttpError(400, "برای استفاده از اعتبار کش‌بک، شماره موبایل مشتری را وارد کنید");
  }
  if (phone && can("loyalty")) {
    const [ex] = await db.select().from(customers).where(and(eq(customers.businessId, biz.id), eq(customers.phone, phone)));
    if (input.useCashback && !ex) throw new HttpError(400, "این شماره در باشگاه مشتریان ثبت نشده است؛ استفاده از کش‌بک فقط برای مشتریان قبلی امکان‌پذیر است");
    if (ex) {
      customerId = ex.id;
      if (!input.customerName) input.customerName = ex.name;
    } else {
      const [c] = await db.insert(customers).values({ businessId: biz.id, name: input.customerName || "مشتری", phone }).onConflictDoNothing().returning();
      customerId = c?.id ?? (await db.select({ id: customers.id }).from(customers).where(and(eq(customers.businessId, biz.id), eq(customers.phone, phone))))[0]?.id ?? null;
    }
  } else if (input.useCashback) throw new HttpError(400, "باشگاه مشتریان در پلن این رستوران فعال نیست");

  const t = computeTotals(biz, { subtotal: addSubtotal, discount: discountAmount, deliveryFee, type });
  let cashbackUsed = 0;
  if (input.useCashback && customerId) {
    const [c] = await db.select({ w: customers.walletBalance }).from(customers).where(eq(customers.id, customerId));
    if (!c || c.w <= 0) throw new HttpError(400, "اعتبار کش‌بک این مشتری صفر است");
    const cap = Math.floor((t.pre * Math.min(100, cbSet.cashbackMaxRedeemPercent ?? 100)) / 100);
    cashbackUsed = Math.min(c.w, cap);
  }

  const [m] = await db.select({ n: max(orders.number) }).from(orders).where(eq(orders.businessId, biz.id));
  const number = (m?.n ?? 1000) + 1;
  const [created] = await db
    .insert(orders)
    .values({
      businessId: biz.id,
      number,
      tableId: type === "dine_in" ? (input.tableId ?? null) : null,
      waiterId: input.waiterId ?? null,
      customerName: input.customerName ?? "",
      customerPhone: phone,
      customerId,
      source,
      type,
      status: opts.hold ? "awaiting_payment" : "pending",
      note: input.note ?? "",
      address: type === "delivery" ? (input.address ?? "") : "",
      zoneId,
      deliveryFee,
      lat: type === "delivery" ? (input.lat ?? null) : null,
      lng: type === "delivery" ? (input.lng ?? null) : null,
      scheduledFor,
      discountCode,
      discountAmount,
      cashbackUsed,
      subtotal: t.subtotal,
      tax: t.tax,
      service: t.service,
      total: Math.max(0, t.pre - cashbackUsed),
    })
    .returning();
  await db.insert(orderItems).values(newItems.map((i) => ({ ...i, orderId: created.id })));
  if (discountId) await db.update(discountCodes).set({ usedCount: sql`${discountCodes.usedCount} + 1` }).where(eq(discountCodes.id, discountId));
  if (cashbackUsed > 0 && customerId) await addWalletEntry(biz.id, customerId, -cashbackUsed, "spend", created.id, `استفاده در سفارش #${number}`);
  if (!opts.hold) await queuePrintJobs(biz, created.id, features, false);
  return (await listOrders(biz.id, { id: created.id }))[0];
}

/** Redeem cashback back to the wallet if an order is canceled (once). */
export async function refundCashback(biz: Biz, orderId: number) {
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id)));
  if (!o || !o.customerId || o.cashbackUsed <= 0) return;
  const [done] = await db
    .select({ id: walletEntries.id })
    .from(walletEntries)
    .where(and(eq(walletEntries.orderId, orderId), eq(walletEntries.kind, "refund")));
  if (done) return;
  await addWalletEntry(biz.id, o.customerId, o.cashbackUsed, "refund", orderId, `بازگشت اعتبار سفارش لغوشده #${o.number}`);
}

/** Mark an order as paid and run all side-effects exactly once (accounting, loyalty, cashback, stock). */
export async function settleOrder(
  biz: Biz,
  features: FeatureMap,
  orderId: number,
  method: string | null,
  setStatus: boolean,
  opts: { reopen?: boolean } = {},
) {
  const [claimed] = await db
    .update(orders)
    .set({ paymentStatus: "paid", paymentMethod: sql`coalesce(${method}, ${orders.paymentMethod}, 'cash')`, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id), sql`${orders.paymentStatus} <> 'paid'`))
    .returning();
  if (claimed) {
    const o = claimed;
    const s = settingsOf(biz);
    // paid orders that were held (kiosk / online payment) now go to the kitchen; a late card approval re-opens a canceled one
    if (o.status === "awaiting_payment" || (opts.reopen && o.status === "canceled")) {
      await db.update(orders).set({ status: "pending", updatedAt: new Date() }).where(eq(orders.id, o.id));
      if (o.status === "canceled" && o.customerId && o.cashbackUsed > 0) await addWalletEntry(biz.id, o.customerId, -o.cashbackUsed, "spend", o.id, `استفاده مجدد در سفارش بازگشایی‌شده #${o.number}`);
      await queuePrintJobs(biz, o.id, features, false);
    }
    // simple income ledger (feeds the quick reports)
    if (o.total > 0) {
      let bankId: number | null = null;
      if (o.paymentMethod && o.paymentMethod !== "cash") {
        const [b] = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.businessId, biz.id)).orderBy(bankAccounts.id).limit(1);
        bankId = b?.id ?? null;
      }
      await db.insert(transactions).values({ businessId: biz.id, kind: "income", source: "sale", category: "فروش", amount: o.total, bankAccountId: bankId, orderId: o.id, description: `سفارش #${o.number}` });
    }
    // loyalty + cashback
    let earned = 0;
    if (o.customerId) {
      const per = Math.max(1, s.pointsPerToman ?? 10000);
      const cbOn = hasAny(features, "cashback") && (s.cashbackEnabled ?? (s.cashbackPercent ?? 0) > 0);
      earned = cbOn && o.total >= (s.cashbackMinOrder ?? 0) ? Math.floor((o.total * Math.min(100, s.cashbackPercent ?? 0)) / 100) : 0;
      await db.update(customers).set({
        ordersCount: sql`${customers.ordersCount} + 1`,
        totalSpent: sql`${customers.totalSpent} + ${o.total}`,
        points: sql`${customers.points} + ${Math.floor(o.total / per)}`,
        lastOrderAt: new Date(),
      }).where(eq(customers.id, o.customerId));
      if (earned > 0) {
        await addWalletEntry(biz.id, o.customerId, earned, "earn", o.id, `کش‌بک سفارش #${o.number}`);
        await db.update(orders).set({ cashbackEarned: earned }).where(eq(orders.id, o.id));
      }
    }
    // recipes → deduct raw materials from stock and compute the real cost of the sold dishes
    let cogs = 0;
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    const pids = items.map((i) => i.productId).filter((x): x is number => !!x);
    if (pids.length) {
      const rs = await db.select().from(recipes).where(and(eq(recipes.businessId, biz.id), inArray(recipes.productId, pids)));
      const use = new Map<number, number>();
      for (const it of items) for (const r of rs) if (r.productId === it.productId) use.set(r.itemId, (use.get(r.itemId) ?? 0) + r.quantity * it.quantity);
      const mats = use.size ? await db.select().from(inventoryItems).where(inArray(inventoryItems.id, [...use.keys()])) : [];
      for (const [itemId, qty] of use) {
        const [upd] = await db.update(inventoryItems).set({ stock: sql`${inventoryItems.stock} - ${qty}` }).where(eq(inventoryItems.id, itemId)).returning({ stock: inventoryItems.stock });
        cogs += qty * (mats.find((m) => m.id === itemId)?.costPerUnit ?? 0);
        await db.insert(stockMovements).values({ businessId: biz.id, itemId, type: "sale", delta: -qty, balanceAfter: upd?.stock ?? 0, note: `مصرف سفارش #${o.number}`, orderId: o.id });
      }
    }
    cogs = Math.round(cogs);
    if (cogs) await db.update(orders).set({ cogs }).where(eq(orders.id, o.id));
    // double-entry accounting document (never blocks the sale)
    try {
      await postOrderSale(biz, { ...o, cashbackEarned: earned }, cogs, earned);
    } catch (e) {
      console.error("accounting post failed", e);
    }
  }
  if (setStatus) await db.update(orders).set({ status: "paid", updatedAt: new Date() }).where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id)));
}

/** Real Zarinpal (v4) payment request. Returns the URL the customer must be redirected to. */
export async function startOnlinePayment(biz: Biz, orderId: number, amount: number, provider: string, origin: string) {
  const cfg = settingsOf(biz).ipg;
  if (provider !== "ipg" || !cfg?.merchantId) throw new HttpError(400, "درگاه پرداخت آنلاین برای این رستوران تنظیم نشده است");
  if (amount < 1000) throw new HttpError(400, "مبلغ برای پرداخت آنلاین کمتر از حداقل (۱۰۰۰ تومان) است");
  const base = cfg.sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
  const [p] = await db.insert(payments).values({ businessId: biz.id, orderId, provider, amount, authority: `tmp-${randomBytes(8).toString("hex")}` }).returning();
  try {
    const res = await fetch(`${base}/pg/v4/payment/request.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ merchant_id: cfg.merchantId, amount: amount * 10, description: `سفارش ${biz.name}`.slice(0, 120), callback_url: `${origin}/api/public/pay/callback?p=${p.id}` }),
      signal: AbortSignal.timeout(15000),
    });
    const j: any = await res.json().catch(() => ({}));
    const authority = j?.data?.authority;
    if (j?.data?.code !== 100 || !authority) throw new Error(j?.errors?.message ?? `کد خطا ${j?.errors?.code ?? res.status}`);
    await db.update(payments).set({ authority }).where(eq(payments.id, p.id));
    return `${base}/pg/StartPay/${authority}`;
  } catch (e) {
    await db.update(payments).set({ status: "failed" }).where(eq(payments.id, p.id));
    throw new HttpError(502, `اتصال به درگاه پرداخت ناموفق بود: ${(e as Error).message}`);
  }
}

export async function verifyOnlinePayment(biz: Biz, p: typeof payments.$inferSelect) {
  const cfg = settingsOf(biz).ipg;
  const base = cfg?.sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
  const res = await fetch(`${base}/pg/v4/payment/verify.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ merchant_id: cfg?.merchantId, amount: p.amount * 10, authority: p.authority }),
    signal: AbortSignal.timeout(15000),
  });
  const j: any = await res.json().catch(() => ({}));
  return j?.data?.code === 100 || j?.data?.code === 101 ? { ok: true as const, ref: String(j.data.ref_id ?? "") } : { ok: false as const, ref: "" };
}

export function receiptText(
  biz: { name: string },
  o: { number: number; type: string; tableName?: string | null; customerName: string; note: string; total: number; address?: string; items: { name: string; quantity: number; price: number }[] },
) {
  const line = "-".repeat(32);
  const kind = o.type === "delivery" ? "ارسال" : o.type === "takeaway" ? "بیرون‌بر" : (o.tableName ?? "سالن");
  return [
    biz.name,
    line,
    `سفارش #${o.number}  |  ${kind}`,
    o.customerName ? `مشتری: ${o.customerName}` : "",
    o.address ? `آدرس: ${o.address}` : "",
    line,
    ...o.items.map((i) => `${i.quantity} × ${i.name}   ${(i.price * i.quantity).toLocaleString("fa-IR")}`),
    line,
    o.note ? `توضیحات: ${o.note}` : "",
    `مبلغ نهایی: ${o.total.toLocaleString("fa-IR")} تومان`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function queuePrintJobs(biz: Biz, orderId: number, features: FeatureMap, isAppend: boolean) {
  if (!hasAny(features, "cloud_printer")) return;
  const printers = await db.select().from(devices).where(and(eq(devices.businessId, biz.id), eq(devices.kind, "printer")));
  if (!printers.length) return;
  const [o] = await listOrders(biz.id, { id: orderId });
  if (!o) return;
  const content = (isAppend ? "** افزودن به سفارش **\n" : "") + receiptText(biz, o);
  await db.insert(printJobs).values(printers.map((p) => ({ businessId: biz.id, orderId, deviceId: p.id, content })));
}

export async function listOrders(
  businessId: number,
  opts: { id?: number; limit?: number; statuses?: string[]; where?: SQL } = {},
) {
  const conds = [eq(orders.businessId, businessId)];
  if (opts.where) conds.push(opts.where);
  if (opts.id) conds.push(eq(orders.id, opts.id));
  if (opts.statuses?.length) conds.push(inArray(orders.status, opts.statuses));
  const rows = await db
    .select({
      order: orders,
      tableName: diningTables.name,
      waiterName: staff.name,
      courierName: couriers.name,
    })
    .from(orders)
    .leftJoin(diningTables, eq(diningTables.id, orders.tableId))
    .leftJoin(staff, eq(staff.id, orders.waiterId))
    .leftJoin(couriers, eq(couriers.id, orders.courierId))
    .where(and(...conds))
    .orderBy(desc(orders.createdAt))
    .limit(opts.limit ?? 200);
  if (rows.length === 0) return [];
  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.order.id)));
  return rows.map((r) => ({
    ...r.order,
    tableName: r.tableName,
    waiterName: r.waiterName,
    courierName: r.courierName,
    items: items.filter((i) => i.orderId === r.order.id),
  }));
}

export type OrderWithItems = Awaited<ReturnType<typeof listOrders>>[number];
