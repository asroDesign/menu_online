import type { CashierDebtInput } from "@/lib/cashier-debt-input";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, max, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccounts,
  businesses,
  cashShifts,
  couriers,
  customers,
  deliveryZones,
  devices,
  diningTables,
  discountCodes,
  inventoryItems,
  orderItems,
  orderStatusEvents,
  orders,
  menuEvents,
  payments,
  printJobs,
  products,
  recipes,
  reservations,
  receivableAccounts,
  receivableEvents,
  receivables,
  staff,
  stockMovements,
  transactions,
  walletEntries,
} from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { hasAny, type FeatureMap, type Settings } from "@/lib/plans";
import { ensureAccounting, postOrderSaleInTransaction } from "@/lib/accounting";
import { haversineKm } from "@/lib/geo";
import { productUnitPrice, resolveProductOptionSelection } from "@/lib/product-options";
import { calculateWeightedSale, orderLineTotal } from "@/lib/weighted-sales";
import { currentMembership } from "@/lib/membership";
import { membershipDiscountAmount, type MembershipOrderSnapshot } from "@/lib/membership-core";
import { normalizePrinterSettings, printOutputs, type PrintMoment } from "@/lib/printer-policy";
import { addCustomerPoints } from "@/lib/customer-points";
import { normalizeCustomerRewards, referralRewardPoints } from "@/lib/customer-rewards-core";

type Biz = typeof businesses.$inferSelect;
type QueryDb = typeof db;
export type OrderTransaction = QueryDb;

type EventKind = "order" | "payment" | "delivery";
export async function recordOrderEvents(tx: QueryDb, businessId: number, orderId: number, changes: Partial<Record<EventKind, [string | null, string]>>, actorType = "system", actorId: number | null = null) {
  const now = new Date();
  const entries = Object.entries(changes).filter(([, pair]) => pair && pair[0] !== pair[1]).map(([kind, pair]) => ({
    businessId, orderId, kind, fromValue: pair![0], toValue: pair![1], actorType, actorId, createdAt: now,
  }));
  if (entries.length) await tx.insert(orderStatusEvents).values(entries as { businessId: number; orderId: number; kind: string; fromValue: string | null; toValue: string; actorType: string; actorId: number | null; createdAt: Date }[]);
}

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
  manualDiscountAmount?: number;
  useCashback?: boolean;
  useMembership?: boolean;
  payNow?: string | null; // staff: settle immediately with this method
  payment?: string | null; // customer: cash | ipg | snappay | digipay
  items: { productId: number; quantity: number; note?: string; optionIds: string[]; weightGrams?: number | null; tareGrams?: number }[];
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
  if (rawItems.length > 50) throw new HttpError(400, "هر سفارش حداکثر می‌تواند ۵۰ قلم داشته باشد");
  const items = rawItems
    .map((i) => i as Record<string, unknown>)
    .map((i) => {
      const productId = Number(i.productId);
      const quantity = i.quantity === undefined ? 1 : Number(i.quantity);
      if (!Number.isInteger(productId) || productId < 1) throw new HttpError(400, "شناسه یکی از کالاهای سفارش نامعتبر است");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw new HttpError(400, "تعداد هر کالا باید بین ۱ تا ۵۰ باشد");
      // Price and line-total fields from the browser are intentionally ignored; createOrder reloads each product's current price.
      const optionIds = i.optionIds === undefined ? [] : i.optionIds;
      if (!Array.isArray(optionIds) || optionIds.length > 40 || optionIds.some((id) => typeof id !== "string" || id.length > 48))
        throw new HttpError(400, "انتخاب گزینه‌های محصول نامعتبر است");
      const weightGrams = i.weightGrams === undefined || i.weightGrams === null || i.weightGrams === "" ? null : Number(i.weightGrams);
      const tareGrams = i.tareGrams === undefined || i.tareGrams === null || i.tareGrams === "" ? 0 : Number(i.tareGrams);
      if (weightGrams !== null && (!Number.isSafeInteger(weightGrams) || weightGrams < 1 || weightGrams > 100_000)) throw new HttpError(400, "وزن ناخالص معتبر نیست");
      if (!Number.isSafeInteger(tareGrams) || tareGrams < 0 || tareGrams > 100_000) throw new HttpError(400, "وزن ظرف معتبر نیست");
      if (weightGrams === null && tareGrams !== 0) throw new HttpError(400, "وزن ظرف فقط برای قلم وزنی قابل ثبت است");
      return { productId, quantity, note: typeof i.note === "string" ? i.note.slice(0, 200) : "", optionIds: optionIds as string[], weightGrams, tareGrams };
    });
  if (items.length === 0) throw new HttpError(400, "سبد سفارش خالی است");
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const manualDiscountAmount = body.manualDiscountAmount === undefined || body.manualDiscountAmount === null || body.manualDiscountAmount === ""
    ? 0
    : Number(body.manualDiscountAmount);
  if (!Number.isSafeInteger(manualDiscountAmount) || manualDiscountAmount < 0 || manualDiscountAmount > 2_147_483_647)
    throw new HttpError(400, "مبلغ تخفیف صندوق نامعتبر است");
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
    manualDiscountAmount,
    useCashback: Boolean(body.useCashback),
    useMembership: body.useMembership === true,
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
  idempotencyKey?: string,
  executor?: QueryDb,
): Promise<boolean> {
  if (!executor) {
    return db.transaction((tx) => addWalletEntry(businessId, customerId, amount, kind, orderId, note, idempotencyKey, tx as unknown as QueryDb));
  }
  const key = idempotencyKey?.trim() || (orderId !== null ? `${kind}:${orderId}` : `${kind}:${randomBytes(16).toString("hex")}`);
  const [entry] = await executor.insert(walletEntries).values({ businessId, customerId, orderId, kind, amount, idempotencyKey: key, note })
    .onConflictDoNothing().returning({ id: walletEntries.id });
  if (!entry) return false;
  const [updated] = await executor.update(customers)
    .set({ walletBalance: sql`${customers.walletBalance} + ${amount}` })
    .where(amount < 0
      ? and(eq(customers.id, customerId), eq(customers.businessId, businessId), sql`${customers.walletBalance} >= ${-amount}`)
      : and(eq(customers.id, customerId), eq(customers.businessId, businessId)))
    .returning({ id: customers.id });
  if (!updated) throw new HttpError(amount < 0 ? 400 : 404, amount < 0 ? "اعتبار کیف پول کافی نیست" : "مشتری پیدا نشد");
  return true;
}

export async function createOrder(biz: Biz, input: OrderInput, source: string, features: FeatureMap, opts: { hold?: boolean; actorId?: number; executor?: OrderTransaction; verifiedCustomerId?: number } = {}) {
  if (input.useCashback && (source !== "customer" || !opts.verifiedCustomerId))
    throw new HttpError(403, "برای مصرف اعتبار کیف پول، از پروفایل مشتری با شمارهٔ تأییدشده وارد شوید");
  if (input.payNow === "credit") {
    if (source !== "cashier") throw new HttpError(403, "ثبت فروش نسیه فقط از صندوق مجاز است");
    if (!/^09\d{9}$/.test(normPhone(input.customerPhone ?? ""))) throw new HttpError(400, "برای ثبت سفارش در بدهکاران، شماره موبایل معتبر مشتری لازم است");
  }
  const can = (k: string) => hasAny(features, k);
  if (input.useMembership && source !== "cashier") throw new HttpError(403, "مزیت عضویت فقط در صندوق و با تأیید کارمند قابل اعمال است");
  if (input.useMembership && !can("loyalty")) throw new HttpError(403, "باشگاه مشتریان در پلن این رستوران فعال نیست");
  if (input.useMembership && (input.discountCode || input.manualDiscountAmount)) throw new HttpError(400, "مزیت عضویت با کد تخفیف یا تخفیف دستی هم‌زمان نمی‌شود");
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
    if (!Number.isSafeInteger(p.price) || p.price <= 0) throw new HttpError(400, `قیمت «${p.name}» صفر یا نامعتبر است؛ ابتدا قیمت محصول را اصلاح کنید`);
  }

  const newItems = input.items.map((it) => {
    const p = byId.get(it.productId)!;
    let selection: ReturnType<typeof resolveProductOptionSelection>;
    let price: number;
    try {
      selection = resolveProductOptionSelection(p.modifierGroups ?? [], it.optionIds ?? []);
      price = productUnitPrice(p.price, selection.priceDelta);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "گزینه‌های محصول نامعتبر است");
    }
    if (price <= 0) throw new HttpError(400, `قیمت نهایی «${p.name}» باید بیشتر از صفر باشد`);
    if (p.sellingMode === "weight") {
      if (selection.snapshot.length) throw new HttpError(400, "گزینه‌های محصول وزنی قابل استفاده نیستند");
      let weighed: ReturnType<typeof calculateWeightedSale>;
      try { weighed = calculateWeightedSale({ sellingMode: "weight", pricePerUnit: p.price, grossGrams: it.weightGrams, tareGrams: it.tareGrams, yieldRatio: p.yieldRatio }); }
      catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "وزن محصول معتبر نیست"); }
      if (weighed.lineTotal <= 0) throw new HttpError(400, `مبلغ «${p.name}» برای این وزن صفر است؛ وزن را افزایش دهید یا قیمت محصول را اصلاح کنید`);
      return { productId: p.id, name: p.name, emoji: p.emoji, price: p.price, quantity: it.quantity, weightGrams: weighed.netGrams, tareGrams: weighed.tareGrams, yieldRatioSnapshot: weighed.yieldRatio, lineTotal: weighed.lineTotal * it.quantity, note: it.note ?? "", optionSnapshot: [] };
    }
    if (it.weightGrams !== null) throw new HttpError(400, "برای محصول تعدادی نمی‌توان وزن وارد کرد");
    const lineTotal = price * it.quantity;
    return { productId: p.id, name: p.name, emoji: p.emoji, price, quantity: it.quantity, weightGrams: null, tareGrams: 0, yieldRatioSnapshot: 1, lineTotal, note: it.note ?? "", optionSnapshot: selection.snapshot };
  });
  const addSubtotal = newItems.reduce((s, i) => s + orderLineTotal(i), 0);
  if (!Number.isSafeInteger(addSubtotal) || addSubtotal > 2_147_483_647) throw new HttpError(400, "مبلغ سفارش از سقف مجاز بیشتر است");
  const type = input.type ?? "dine_in";

  // ---------- append to an existing order ----------
  if (input.appendTo) {
    if (input.manualDiscountAmount) throw new HttpError(400, "تخفیف صندوق را پس از بستن افزودن به سفارش ثبت کنید");
    if (input.useMembership) throw new HttpError(400, "برای اعمال مزیت عضویت، سفارش جدید ثبت کنید؛ سفارش جاری را نمی‌توان تغییر قیمت داد");
    const id = await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as QueryDb;
      const [existing] = await tx.select().from(orders)
        .where(and(eq(orders.id, input.appendTo!), eq(orders.businessId, biz.id))).for("update");
      if (!existing) throw new HttpError(404, "سفارش مورد نظر پیدا نشد");
      if (existing.status === "paid" || existing.status === "canceled" || existing.paymentStatus === "paid")
        throw new HttpError(400, "این سفارش بسته شده است");
      const sub = existing.subtotal + addSubtotal;
      const t = computeTotals(biz, { subtotal: sub, discount: existing.discountAmount, deliveryFee: existing.deliveryFee, type: existing.type });
      if (t.pre > 2_147_483_647) throw new HttpError(400, "مبلغ سفارش از سقف مجاز بیشتر است");
      const appendedRows = await tx.insert(orderItems).values(newItems.map((i) => ({ ...i, orderId: existing.id }))).returning({ id: orderItems.id });
      const nextStatus = existing.status === "served" || existing.status === "ready" ? "preparing" : existing.status;
      await tx.update(orders).set({
        subtotal: sub, tax: t.tax, service: t.service, total: Math.max(0, t.pre - existing.cashbackUsed),
        status: nextStatus,
        updatedAt: new Date(),
      }).where(and(eq(orders.id, existing.id), eq(orders.businessId, biz.id)));
      await recordOrderEvents(tx, biz.id, existing.id, { order: [existing.status, nextStatus] }, "customer");
      await queuePrintJobs(biz, existing.id, features, true, appendedRows.map((r) => r.id), tx);
      return existing.id;
    });
    return { ...(await listOrders(biz.id, { id }))[0], trackingToken: null };
  }

  // ---------- validations for new orders ----------
  if (input.tableId) {
    const [t] = await db
      .select({ id: diningTables.id, operationalStatus: diningTables.operationalStatus })
      .from(diningTables)
      .where(and(eq(diningTables.id, input.tableId), eq(diningTables.businessId, biz.id)));
    if (!t) throw new HttpError(400, "میز نامعتبر است");
    if (t.operationalStatus === "cleaning") throw new HttpError(409, "این میز در حال نظافت است و سفارش نمی‌پذیرد");
    if (t.operationalStatus === "out_of_service") throw new HttpError(409, "این میز موقتاً خارج از سرویس است");
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
  if (input.manualDiscountAmount) {
    if (input.discountCode) throw new HttpError(400, "کد تخفیف و تخفیف دستی را هم‌زمان نمی‌توان اعمال کرد");
    if (source !== "cashier") throw new HttpError(403, "تخفیف دستی فقط از سفارش‌گیر صندوق مجاز است");
    if (!can("discount")) throw new HttpError(403, "تخفیف در پلن شما فعال نیست");
    if (input.manualDiscountAmount > addSubtotal) throw new HttpError(400, "تخفیف نمی‌تواند از جمع اقلام بیشتر باشد");
    discountAmount = input.manualDiscountAmount;
    discountCode = "تخفیف صندوق";
  }
  if (input.discountCode) {
    if (!can("discount")) throw new HttpError(403, "کد تخفیف در پلن شما فعال نیست");
    const d = await validateDiscount(biz, input.discountCode, addSubtotal);
    discountAmount = d.amount;
    discountCode = d.code;
    discountId = d.id;
  }

  // Public customer identity is only trusted when it comes from the OTP-verified
  // same-business session; raw phone numbers remain useful only in staff flows.
  let phone = input.customerPhone ? normPhone(input.customerPhone) : "";
  if (source === "cashier" && input.customerName?.trim() && !phone)
    throw new HttpError(400, "برای ثبت اطلاعات مشتری در فهرست، شماره موبایل لازم است");
  const cbSet = settingsOf(biz);
  if (input.useCashback) {
    if (!can("loyalty")) throw new HttpError(403, "استفاده از اعتبار مشتری در پلن این رستوران فعال نیست");
    if (!phone) throw new HttpError(400, "برای استفاده از اعتبار کش‌بک، شماره موبایل مشتری را وارد کنید");
  }
  const t = computeTotals(biz, { subtotal: addSubtotal, discount: discountAmount, deliveryFee, type });
  if (t.pre > 2_147_483_647 && !input.useMembership) throw new HttpError(400, "مبلغ سفارش از سقف مجاز بیشتر است");
  const trackingToken = source === "customer" || source === "kiosk" ? randomBytes(32).toString("base64url") : null;
  const trackingTokenHash = trackingToken ? createHash("sha256").update(trackingToken).digest("hex") : null;
  const trackingDays = Math.min(30, Math.max(1, Math.round(settingsOf(biz).orderTrackingDays ?? 7)));
  const trackingExpiresAt = trackingToken ? new Date(Date.now() + trackingDays * 24 * 60 * 60_000) : null;
  if (input.appendTo && opts.executor) throw new HttpError(400, "افزودن به سفارش جاری با تراکنش بیرونی پشتیبانی نمی‌شود");
  const saveOrder = async (tx: QueryDb) => {
    // Serialize per-business number allocation; the unique index remains the final guard.
    await tx.execute(sql`select pg_advisory_xact_lock(${biz.id + 777000})`);
    if (input.tableId) {
      const [table] = await tx.select({ id: diningTables.id, operationalStatus: diningTables.operationalStatus }).from(diningTables)
        .where(and(eq(diningTables.id, input.tableId), eq(diningTables.businessId, biz.id))).for("update").limit(1);
      if (!table) throw new HttpError(400, "میز نامعتبر است");
      if (table.operationalStatus === "cleaning") throw new HttpError(409, "این میز در حال نظافت است و سفارش نمی‌پذیرد");
      if (table.operationalStatus === "out_of_service") throw new HttpError(409, "این میز موقتاً خارج از سرویس است");
      const serviceAt = scheduledFor ?? new Date();
      const [reservation] = await tx.select({ id: reservations.id }).from(reservations).where(and(
        eq(reservations.businessId, biz.id), eq(reservations.tableId, table.id),
        inArray(reservations.status, ["requested", "confirmed"]),
        sql`${reservations.startsAt} <= ${serviceAt}`,
        sql`${reservations.startsAt} + (${reservations.durationMinutes} * interval '1 minute') > ${serviceAt}`,
      )).limit(1);
      if (reservation) throw new HttpError(409, "این میز در زمان انتخاب‌شده رزرو است؛ میز یا زمان دیگری انتخاب کنید");
    }
    let customerId: number | null = null;
    let customerName = input.customerName ?? "";
    let walletBalance = 0;
    if (opts.verifiedCustomerId) {
      const [sessionCustomer] = await tx.select({ id: customers.id, name: customers.name, phone: customers.phone, walletBalance: customers.walletBalance })
        .from(customers).where(and(eq(customers.businessId, biz.id), eq(customers.id, opts.verifiedCustomerId))).for("update").limit(1);
      if (!sessionCustomer) throw new HttpError(401, "نشست مشتری معتبر نیست؛ دوباره وارد پروفایل شوید");
      if (phone && phone !== sessionCustomer.phone) throw new HttpError(403, "شماره سفارش با پروفایل تأییدشده یکسان نیست");
      phone = sessionCustomer.phone;
      customerId = sessionCustomer.id;
      walletBalance = sessionCustomer.walletBalance;
      if (!customerName) customerName = sessionCustomer.name;
    } else if (phone && source !== "customer" && (can("loyalty") || source === "cashier")) {
      if (source === "cashier" && !/^09\d{9}$/.test(phone)) throw new HttpError(400, "شماره موبایل مشتری باید معتبر باشد");
      let [customer] = await tx.select().from(customers)
        .where(and(eq(customers.businessId, biz.id), eq(customers.phone, phone))).for("update");
      if (!customer) {
        const [createdCustomer] = await tx.insert(customers)
          .values({ businessId: biz.id, name: customerName || "مشتری", phone }).onConflictDoNothing().returning();
        customer = createdCustomer ?? (await tx.select().from(customers)
          .where(and(eq(customers.businessId, biz.id), eq(customers.phone, phone))).for("update"))[0];
      }
      if (customer) {
        if (input.customerName && input.customerName !== customer.name) {
          const [updatedCustomer] = await tx.update(customers).set({ name: input.customerName })
            .where(and(eq(customers.id, customer.id), eq(customers.businessId, biz.id))).returning();
          customer = updatedCustomer ?? customer;
        }
        customerId = customer.id;
        walletBalance = customer.walletBalance;
        if (!customerName) customerName = customer.name;
      }
    } else if (input.useCashback) {
      throw new HttpError(400, "باشگاه مشتریان در پلن این رستوران فعال نیست");
    }
    let cashbackUsed = 0;
    let appliedDiscountAmount = discountAmount;
    let membershipDiscount = 0;
    let membershipSnapshot: MembershipOrderSnapshot | null = null;
    if (input.useMembership) {
      if (!customerId) throw new HttpError(400, "برای اعمال مزیت عضویت، مشتری ثبت‌شده با شماره معتبر لازم است");
      const membership = await currentMembership(biz.id, customerId, settingsOf(biz).membershipTiers ?? [], new Date(), tx);
      if (!membership) throw new HttpError(409, "این مشتری در بازه فعلی واجد شرایط هیچ سطح عضویتی نیست");
      membershipDiscount = membershipDiscountAmount(addSubtotal, membership.tier);
      if (membershipDiscount < 1) throw new HttpError(400, "مبلغ سفارش برای استفاده از مزیت عضویت کافی نیست");
      appliedDiscountAmount = membershipDiscount;
      membershipSnapshot = membership.snapshot;
    }
    const totals = computeTotals(biz, { subtotal: addSubtotal, discount: appliedDiscountAmount, deliveryFee, type });
    if (totals.pre > 2_147_483_647) throw new HttpError(400, "مبلغ سفارش از سقف مجاز بیشتر است");
    if (input.useCashback && customerId) {
      if (walletBalance <= 0) throw new HttpError(400, "اعتبار کش‌بک این مشتری صفر است");
      const cap = Math.floor((totals.pre * Math.min(100, cbSet.cashbackMaxRedeemPercent ?? 100)) / 100);
      cashbackUsed = Math.min(walletBalance, cap);
    }
    const [m] = await tx.select({ n: max(orders.number) }).from(orders).where(eq(orders.businessId, biz.id));
    const number = (m?.n ?? 1000) + 1;
    const [created] = await tx.insert(orders).values({
      businessId: biz.id, number,
      trackingTokenHash,
      trackingExpiresAt,
      tableId: type === "dine_in" ? (input.tableId ?? null) : null,
      waiterId: input.waiterId ?? null,
      customerName, customerPhone: phone, customerId, source, type,
      status: opts.hold ? "awaiting_payment" : "pending", note: input.note ?? "",
      address: type === "delivery" ? (input.address ?? "") : "", zoneId, deliveryFee,
      lat: type === "delivery" ? (input.lat ?? null) : null,
      lng: type === "delivery" ? (input.lng ?? null) : null,
      scheduledFor, discountCode, discountAmount: appliedDiscountAmount, membershipDiscount, membershipSnapshot, membershipAppliedBy: membershipSnapshot ? opts.actorId ?? null : null, cashbackUsed,
      paymentMethod: source === "customer" || source === "kiosk" ? input.payment ?? null : null,
      subtotal: totals.subtotal, tax: totals.tax, service: totals.service,
      total: Math.max(0, totals.pre - cashbackUsed),
    }).returning();
    await recordOrderEvents(tx, biz.id, created.id, { order: [null, created.status], payment: [null, created.paymentStatus] }, source);
    await tx.insert(orderItems).values(newItems.map((i) => ({ ...i, orderId: created.id })));
    if (source === "customer" || source === "kiosk") {
      await tx.insert(menuEvents).values({ businessId: biz.id, eventId: `order:${created.id}`, eventName: "order_created" }).onConflictDoNothing();
    }
    if (discountId) {
      const [used] = await tx.update(discountCodes).set({ usedCount: sql`${discountCodes.usedCount} + 1` })
        .where(and(
          eq(discountCodes.id, discountId), eq(discountCodes.businessId, biz.id), eq(discountCodes.isActive, true),
          sql`(${discountCodes.maxUses} = 0 OR ${discountCodes.usedCount} < ${discountCodes.maxUses})`,
          sql`(${discountCodes.expiresAt} IS NULL OR ${discountCodes.expiresAt} >= now())`,
        )).returning({ id: discountCodes.id });
      if (!used) throw new HttpError(400, "کد تخفیف دیگر قابل استفاده نیست؛ سفارش را دوباره بررسی کنید");
    }
    if (cashbackUsed > 0 && customerId)
      await addWalletEntry(biz.id, customerId, -cashbackUsed, "spend", created.id, `استفاده در سفارش #${number}`, `order:${created.id}:spend:initial`, tx);
    if (!opts.hold) await queuePrintJobs(biz, created.id, features, false, undefined, tx);
    return created.id;
  };
  const orderId = opts.executor
    ? await saveOrder(opts.executor)
    : await db.transaction((rawTx) => saveOrder(rawTx as unknown as QueryDb));
  const saved = (await listOrders(biz.id, { id: orderId, executor: opts.executor }))[0];
  return { ...saved, trackingToken };
}

/** Refund only wallet value still consumed by this order. A row lock makes duplicate cancels safe. */
export async function refundCashback(biz: Biz, orderId: number, executor?: QueryDb): Promise<boolean> {
  if (!executor) return db.transaction((tx) => refundCashback(biz, orderId, tx as unknown as QueryDb));
  const [o] = await executor.select().from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id))).for("update");
  if (!o || o.status !== "canceled" || !o.customerId || o.cashbackUsed <= 0) return false;
  const entries = await executor.select({ kind: walletEntries.kind, amount: walletEntries.amount }).from(walletEntries)
    .where(and(eq(walletEntries.businessId, biz.id), eq(walletEntries.customerId, o.customerId), eq(walletEntries.orderId, orderId)));
  const spent = entries.filter((e) => e.kind === "spend").reduce((sum, e) => sum + Math.max(0, -e.amount), 0);
  const refunded = entries.filter((e) => e.kind === "refund").reduce((sum, e) => sum + Math.max(0, e.amount), 0);
  const amount = Math.min(o.cashbackUsed, Math.max(0, spent - refunded));
  if (!amount) return false;
  const refundNo = entries.filter((e) => e.kind === "refund").length + 1;
  return addWalletEntry(biz.id, o.customerId, amount, "refund", orderId,
    `بازگشت اعتبار سفارش لغوشده #${o.number}`, `order:${orderId}:refund:${refundNo}`, executor);
}

/** Settle the order and all database effects in one transaction. Gateway calls happen before this function. */
export async function settleOrder(
  biz: Biz,
  features: FeatureMap,
  orderId: number,
  method: string | null,
  setStatus: boolean,
  opts: { reopen?: boolean; paymentId?: number; paymentRef?: string; actorId?: number; actorType?: string; creditSale?: boolean; creditDetails?: CashierDebtInput; executor?: OrderTransaction } = {},
) {
  if (method === "credit" && !opts.creditSale) throw new HttpError(400, "فروش نسیه باید از دفتر مطالبات ثبت شود");
  await ensureAccounting(biz);
  const settle = async (tx: QueryDb) => {
    const [o] = await tx.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id))).for("update");
    if (!o) throw new HttpError(404, "سفارش پیدا نشد");

    if (!opts.creditSale) {
      const [registeredDebt] = await tx.select({ id: receivables.id }).from(receivables)
        .where(and(eq(receivables.businessId, biz.id), eq(receivables.orderId, o.id))).limit(1);
      if (registeredDebt) throw new HttpError(409, "این سفارش در دفتر بدهکاران ثبت شده است؛ دریافت وجه را از صورت‌حساب بدهی انجام دهید");
    }

    if (opts.creditSale) {
      if (!("pending preparing ready served".split(" ").includes(o.status)) || o.paymentStatus !== "unpaid") throw new HttpError(409, "فقط سفارش باز و تسویه‌نشده را می‌توان نسیه ثبت کرد");
      if (!o.customerId) throw new HttpError(400, "برای ثبت نسیه، سفارش باید به مشتری ثبت‌شده متصل باشد");
      if (o.total <= 0) throw new HttpError(400, "مبلغ سفارش برای ثبت نسیه معتبر نیست");
      const [existingReceivable] = await tx.select({ id: receivables.id }).from(receivables)
        .where(and(eq(receivables.businessId, biz.id), eq(receivables.orderId, o.id))).limit(1);
      if (existingReceivable) throw new HttpError(409, "برای این سفارش قبلاً طلب ثبت شده است");
    }

    let payment: typeof payments.$inferSelect | undefined;
    if (opts.paymentId) {
      [payment] = await tx.select().from(payments)
        .where(and(eq(payments.id, opts.paymentId), eq(payments.orderId, orderId), eq(payments.businessId, biz.id))).for("update");
      if (!payment) throw new HttpError(404, "پرداخت سفارش پیدا نشد");
      if (payment.amount !== o.total) throw new HttpError(400, "مبلغ پرداخت با مبلغ سفارش هم‌خوانی ندارد");
    }

    const alreadyPaid = o.paymentStatus === "paid";
    if (!alreadyPaid) {
      const paymentMethod = opts.creditSale ? "credit" : method ?? o.paymentMethod ?? "cash";
      const reopens = o.status === "awaiting_payment" || (opts.reopen && o.status === "canceled");
      const status = opts.creditSale ? o.status : setStatus ? "paid" : reopens ? "pending" : o.status;
      await tx.update(orders).set({ paymentStatus: opts.creditSale ? "unpaid" : "paid", paymentMethod, status, updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.businessId, biz.id)));
      if (!opts.creditSale) await recordOrderEvents(tx, biz.id, orderId, { payment: [o.paymentStatus, "paid"], order: [o.status, status] }, opts.actorType ?? "system", opts.actorId ?? null);

      if (o.status === "canceled" && opts.reopen && o.customerId && o.cashbackUsed > 0) {
        await addWalletEntry(biz.id, o.customerId, -o.cashbackUsed, "spend", o.id,
          `استفاده مجدد در سفارش بازگشایی‌شده #${o.number}`, `order:${o.id}:spend:reopen`, tx);
      }
      if (reopens) await queuePrintJobs(biz, o.id, features, false, undefined, tx);

      let activeShiftId: number | null = null;
      if (o.source === "cashier" || o.source === "waiter") {
        const [shift] = await tx.select({ id: cashShifts.id }).from(cashShifts)
          .where(and(eq(cashShifts.businessId, biz.id), isNull(cashShifts.closedAt)))
          .for("update").limit(1);
        activeShiftId = shift?.id ?? null;
      }

      if (o.total > 0 && !opts.creditSale) {
        let bankId: number | null = null;
        if (paymentMethod !== "cash" && paymentMethod !== "cashback") {
          const [b] = await tx.select({ id: bankAccounts.id }).from(bankAccounts)
            .where(eq(bankAccounts.businessId, biz.id)).orderBy(bankAccounts.id).limit(1);
          bankId = b?.id ?? null;
        }
        await tx.insert(transactions).values({ businessId: biz.id, kind: "income", source: "sale", category: "فروش", amount: o.total, bankAccountId: bankId, orderId: o.id, shiftId: activeShiftId, description: `سفارش #${o.number}` });
      }

      const settings = settingsOf(biz);
      let earned = 0;
      if (o.customerId) {
        const per = Math.max(1, settings.pointsPerToman ?? 10000);
        const cashbackOn = hasAny(features, "cashback") && (settings.cashbackEnabled ?? (settings.cashbackPercent ?? 0) > 0);
        earned = cashbackOn && o.total >= (settings.cashbackMinOrder ?? 0)
          ? Math.floor((o.total * Math.min(100, settings.cashbackPercent ?? 0)) / 100) : 0;
        const points = hasAny(features, "loyalty") ? Math.floor(o.total / per) : 0;
        const [loyaltyCustomer] = await tx.select({ referredByCustomerId: customers.referredByCustomerId }).from(customers)
          .where(and(eq(customers.id, o.customerId), eq(customers.businessId, biz.id))).for("update").limit(1);
        await tx.update(customers).set({
          ordersCount: sql`${customers.ordersCount} + 1`, totalSpent: sql`${customers.totalSpent} + ${o.total}`,
          lastOrderAt: new Date(),
        }).where(and(eq(customers.id, o.customerId), eq(customers.businessId, biz.id)));
        if (points > 0) await addCustomerPoints(tx, {
          businessId: biz.id, customerId: o.customerId, amount: points, kind: "purchase",
          idempotencyKey: `order:${o.id}:purchase-points`, orderId: o.id, note: `امتیاز خرید سفارش #${o.number}`,
        });
        if (loyaltyCustomer?.referredByCustomerId && hasAny(features, "loyalty")) {
          const referralPoints = referralRewardPoints(o.total, normalizeCustomerRewards(settings.customerRewards));
          if (referralPoints > 0) await addCustomerPoints(tx, {
            businessId: biz.id, customerId: loyaltyCustomer.referredByCustomerId, amount: referralPoints, kind: "referral",
            idempotencyKey: `order:${o.id}:referral:${loyaltyCustomer.referredByCustomerId}`, orderId: o.id,
            note: `معرفی مشتری در سفارش #${o.number}`,
          });
        }
        if (earned > 0) {
          await addWalletEntry(biz.id, o.customerId, earned, "earn", o.id,
            `کش‌بک سفارش #${o.number}`, `order:${o.id}:earn`, tx);
          await tx.update(orders).set({ cashbackEarned: earned }).where(and(eq(orders.id, o.id), eq(orders.businessId, biz.id)));
        }
      }

      let cogs = 0;
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, o.id));
      const productIds = items.map((i) => i.productId).filter((id): id is number => id !== null);
      if (productIds.length) {
        const recipeRows = await tx.select().from(recipes).where(and(eq(recipes.businessId, biz.id), inArray(recipes.productId, productIds)));
        const use = new Map<number, number>();
        for (const item of items) for (const recipe of recipeRows)
          if (recipe.productId === item.productId) {
            const productUnits = item.weightGrams === null ? item.quantity : item.quantity * (item.weightGrams / 1000) / item.yieldRatioSnapshot;
            use.set(recipe.itemId, (use.get(recipe.itemId) ?? 0) + recipe.quantity * (1 + (recipe.wastePercent ?? 0) / 100) * productUnits);
          }
        const usedIds = [...use.keys()];
        const materials = usedIds.length ? await tx.select().from(inventoryItems)
          .where(and(eq(inventoryItems.businessId, biz.id), inArray(inventoryItems.id, usedIds))) : [];
        for (const [itemId, qty] of use) {
          const material = materials.find((m) => m.id === itemId);
          // Only tracked stock is posted to inventory/COGS; theoretical recipe cost
          // remains available in the costing module even when auto-tracking is off.
          if (!material?.trackStock) continue;
          const stockQuantity = qty * material.recipeToStockFactor;
          cogs += stockQuantity * material.costPerUnit;
          const [updated] = await tx.update(inventoryItems).set({ stock: sql`${inventoryItems.stock} - ${stockQuantity}` })
            .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.businessId, biz.id))).returning({ stock: inventoryItems.stock });
          if (!updated) continue;
          await tx.insert(stockMovements).values({ businessId: biz.id, itemId, type: "sale", delta: -stockQuantity, balanceAfter: updated.stock, note: `مصرف سفارش #${o.number}`, orderId: o.id });
        }
      }
      cogs = Math.round(cogs);
      if (cogs) await tx.update(orders).set({ cogs }).where(and(eq(orders.id, o.id), eq(orders.businessId, biz.id)));
      const saleDocument = await postOrderSaleInTransaction(tx, biz, { ...o, cashbackEarned: earned, paymentMethod }, cogs, earned, opts.creditSale ?? false);
      if (opts.creditSale && o.customerId) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`receivable-customer:${biz.id}:${o.customerId}`}))`);
        let [account] = await tx.select().from(receivableAccounts)
          .where(and(eq(receivableAccounts.businessId, biz.id), eq(receivableAccounts.customerId, o.customerId), eq(receivableAccounts.type, opts.creditDetails?.type ?? "person"), ...(opts.creditDetails?.type === "company" ? [eq(receivableAccounts.name, opts.creditDetails.companyName)] : []))).limit(1);
        if (!account) {
          const [customer] = await tx.select().from(customers)
            .where(and(eq(customers.businessId, biz.id), eq(customers.id, o.customerId))).limit(1);
          if (!customer) throw new HttpError(400, "مشتری سفارش دیگر در این کسب‌وکار در دسترس نیست");
          [account] = await tx.insert(receivableAccounts).values({
            businessId: biz.id, customerId: customer.id, name: opts.creditDetails?.type === "company" ? opts.creditDetails.companyName : customer.name, phone: customer.phone, type: opts.creditDetails?.type ?? "person", createdBy: opts.actorId ?? null,
          }).returning();
        }
        const [receivable] = await tx.insert(receivables).values({
          businessId: biz.id, accountId: account.id, orderId: o.id, source: "order", amount: o.total,
          dueAt: opts.creditDetails?.dueAt ? new Date(opts.creditDetails.dueAt) : null, description: opts.creditDetails?.description || `سفارش شماره ${o.number}`, accountingDocumentId: saleDocument.id, createdBy: opts.actorId ?? null,
        }).returning();
        await tx.insert(receivableEvents).values({ businessId: biz.id, receivableId: receivable.id, kind: "created", amount: o.total, note: `ثبت نسیه سفارش شماره ${o.number}`, actorId: opts.actorId ?? null });
      }
    } else if (setStatus && o.status !== "paid") {
      await tx.update(orders).set({ status: "paid", updatedAt: new Date() }).where(and(eq(orders.id, o.id), eq(orders.businessId, biz.id)));
      await recordOrderEvents(tx, biz.id, o.id, { order: [o.status, "paid"] }, opts.actorType ?? "system", opts.actorId ?? null);
    }

    if (payment) await tx.update(payments).set({ status: "paid", refId: (opts.paymentRef ?? payment.refId).slice(0, 80), settlementError: "" })
      .where(and(eq(payments.id, payment.id), eq(payments.businessId, biz.id), eq(payments.orderId, o.id)));
    if (!alreadyPaid && !opts.creditSale) await queuePrintJobs(biz, o.id, features, false, undefined, tx, "settled");
  };
  if (opts.executor) await settle(opts.executor);
  else await db.transaction((rawTx) => settle(rawTx as unknown as QueryDb));
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
  biz: { name: string; settings?: unknown },
  o: { number: number; type: string; tableName?: string | null; customerName: string; note: string; total: number; address?: string; items: { name: string; quantity: number; price: number; productId?: number | null; optionSnapshot?: { optionName: string }[]; weightGrams?: number | null; lineTotal?: number }[] },
  options: { includeTotal?: boolean; printerName?: string } = {},
) {
  const line = "-".repeat(32);
  const kind = o.type === "delivery" ? "ارسال" : o.type === "takeaway" ? "بیرون‌بر" : (o.tableName ?? "سالن");
  const printSettings = normalizePrinterSettings((biz.settings as { printerSettings?: unknown } | null)?.printerSettings);
  return [
    printSettings.receiptHeader,
    biz.name,
    line,
    `سفارش #${o.number}  |  ${kind}`,
    options.printerName ? `بخش: ${options.printerName}` : "",
    o.customerName ? `مشتری: ${o.customerName}` : "",
    o.address ? `آدرس: ${o.address}` : "",
    line,
    ...o.items.map((i) => `${i.quantity} × ${i.name}${i.weightGrams != null ? ` (${i.weightGrams.toLocaleString("fa-IR")} گرم خالص)` : ""}${i.optionSnapshot?.length ? `\n   ${i.optionSnapshot.map((x) => x.optionName).join("، ")}` : ""}   ${options.includeTotal === false ? "" : orderLineTotal(i).toLocaleString("fa-IR")}`),
    line,
    o.note ? `توضیحات: ${o.note}` : "",
    options.includeTotal === false ? "" : `مبلغ نهایی: ${o.total.toLocaleString("fa-IR")} تومان`,
    printSettings.receiptFooter,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function queuePrintJobs(biz: Biz, orderId: number, features: FeatureMap, isAppend: boolean, onlyItemIds?: number[], executor: QueryDb = db, moment: PrintMoment = "created_with_table", manualKind?: "customer" | "kitchen" | "cafe") {
  if (!hasAny(features, "cloud_printer")) return;
  const printers = await executor.select().from(devices).where(and(eq(devices.businessId, biz.id), eq(devices.kind, "printer")));
  if (!printers.length) return;
  const [o] = await listOrders(biz.id, { id: orderId, executor });
  if (!o) return;
  const ticketItems = onlyItemIds ? o.items.filter((i) => onlyItemIds.includes(i.id)) : o.items;
  const productIds = [...new Set(ticketItems.map((i) => i.productId).filter((id): id is number => typeof id === "number"))];
  const productCategories = productIds.length
    ? await executor.select({ id: products.id, categoryId: products.categoryId }).from(products).where(and(eq(products.businessId, biz.id), inArray(products.id, productIds)))
    : [];
  const categoryByProduct = new Map(productCategories.map((p) => [p.id, p.categoryId]));
  const settings = normalizePrinterSettings(settingsOf(biz).printerSettings);
  const selectedMoment = moment === "created_with_table" && !o.tableId ? "created_without_table" : moment;
  const outputs = manualKind ? [{ kind: manualKind, copies: 1, printerId: manualKind === "cafe" ? settings.rules.settled.cafePrinterId : settings.rules.settled.customerPrinterId, printerIds: settings.rules.created_with_table.kitchenPrinterIds }] : printOutputs(settings, selectedMoment);
  const firstPrinter = printers[0];
  const categoryPrinters = printers.filter((printer) => Array.isArray(printer.printerCategoryIds) && printer.printerCategoryIds.length > 0);
  const jobs: { businessId: number; orderId: number; deviceId: number; content: string }[] = [];
  for (const output of outputs) {
    const targetPrinters = output.kind === "kitchen"
      ? output.printerIds.length ? printers.filter((printer) => output.printerIds.includes(printer.id)) : categoryPrinters.length ? categoryPrinters : firstPrinter ? [firstPrinter] : []
      : [printers.find((printer) => printer.id === output.printerId) ?? firstPrinter].filter((printer): printer is (typeof printers)[number] => !!printer);
    for (const printer of targetPrinters) {
      const assigned = output.kind === "kitchen" && Array.isArray(printer.printerCategoryIds) ? printer.printerCategoryIds : [];
      const items = assigned.length
        ? ticketItems.filter((item) => assigned.includes(item.productId ? categoryByProduct.get(item.productId) ?? 0 : 0))
        : ticketItems;
      if (!items.length) continue;
      const includeTotal = output.kind !== "kitchen";
      const printerName = output.kind === "kitchen" && assigned.length ? printer.name : output.kind === "cafe" ? "نسخه‌ی کافه" : undefined;
      const content = `${isAppend ? "** افزودن به سفارش **\n" : ""}${output.kind === "kitchen" ? "** بلیت آماده‌سازی **\n" : ""}${receiptText(biz, { ...o, items }, { includeTotal, printerName })}`;
      for (let copy = 0; copy < output.copies; copy++) jobs.push({ businessId: biz.id, orderId, deviceId: printer.id, content });
    }
  }
  if (jobs.length) await executor.insert(printJobs).values(jobs);
  return jobs.length;
}

export async function listOrders(
  businessId: number,
  opts: { id?: number; limit?: number; statuses?: string[]; where?: SQL; deleted?: boolean; executor?: QueryDb } = {},
) {
  const executor = opts.executor ?? db;
  const conds = [eq(orders.businessId, businessId), opts.deleted ? isNotNull(orders.deletedAt) : isNull(orders.deletedAt)];
  if (opts.where) conds.push(opts.where);
  if (opts.id) conds.push(eq(orders.id, opts.id));
  if (opts.statuses?.length) conds.push(inArray(orders.status, opts.statuses));
  const rows = await executor
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
  const items = await executor
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.order.id)));
  const confirmations = await executor.select({ orderId: orderStatusEvents.orderId, createdAt: orderStatusEvents.createdAt }).from(orderStatusEvents).where(and(eq(orderStatusEvents.businessId, businessId), eq(orderStatusEvents.kind, "cashier_confirmation"), inArray(orderStatusEvents.orderId, rows.map(r => r.order.id))));
  return rows.map((r) => {
    const { trackingTokenHash, ...safeOrder } = r.order;
    return {
      ...safeOrder,
      cashierConfirmedAt: confirmations.find(event => event.orderId === r.order.id)?.createdAt ?? null,
      trackingActive: !!trackingTokenHash && !r.order.trackingRevokedAt && !!r.order.trackingExpiresAt && r.order.trackingExpiresAt > new Date(),
      tableName: r.tableName,
      waiterName: r.waiterName,
      courierName: r.courierName,
      items: items.filter((i) => i.orderId === r.order.id),
    };
  });
}

export type OrderWithItems = Awaited<ReturnType<typeof listOrders>>[number];
