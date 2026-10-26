import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, categories, devices, diningTables, offlineCatalogs, offlineSales, offlineTerminals, orders, products, staff, users } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { hasAny } from "@/lib/plans";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ensureAccounting } from "@/lib/accounting";
import { createOrder, parseOrderInput, settleOrder, type OrderTransaction } from "@/lib/orders";
import { normalizeSettlementInput } from "@/lib/order-settlement-core";
import { assertOfflineLease, parseOfflineSale, type OfflineCatalog } from "@/lib/offline-pos-core";

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function offlineAuth(req: Request) {
  const bearer = req.headers.get("authorization") ?? "";
  if (!/^Bearer [a-f0-9]{64}$/.test(bearer)) throw new HttpError(401, "کلید دستگاه معتبر نیست");
  const [terminal] = await db.select().from(offlineTerminals).where(eq(offlineTerminals.tokenHash, tokenHash(bearer.slice(7)))).limit(1);
  if (!terminal || terminal.revokedAt) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
  await enforceRateLimit(req, "offline-pos", terminal.id, 120, 60_000, false);
  const [business] = await db.select().from(businesses).where(eq(businesses.id, terminal.businessId));
  const [issuer] = await db.select().from(users).where(eq(users.id, terminal.createdBy));
  if (!business || business.isSuspended || !issuer?.isActive) throw new HttpError(403, "دسترسی کسب‌وکار یا صادرکننده کلید فعال نیست");
  if (business.userId !== issuer.id) {
    const [member] = await db.select().from(staff).where(and(eq(staff.businessId, business.id), eq(staff.userId, issuer.id), eq(staff.isActive, true)));
    if (!member || issuer.staffRole !== "manager") throw new HttpError(403, "مجوز صادرکننده کلید تغییر کرده است");
  }
  const features = await featuresOf(business);
  await db.update(offlineTerminals).set({ lastSeenAt: new Date() }).where(eq(offlineTerminals.id, terminal.id));
  return { terminal, business, features };
}
export async function offlineCatalog(req: Request) {
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "صندوق در اشتراک فعلی فعال نیست");
  const [items, tables, cats, terminals] = await Promise.all([
    db.select({ id: products.id, name: products.name, price: products.price, categoryId: products.categoryId, sellingMode: products.sellingMode, yieldRatio: products.yieldRatio, modifierGroups: products.modifierGroups }).from(products).where(and(eq(products.businessId, business.id), eq(products.isAvailable, true))),
    db.select({ id: diningTables.id, name: diningTables.name, capacity: diningTables.capacity, operationalStatus: diningTables.operationalStatus }).from(diningTables).where(eq(diningTables.businessId, business.id)),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.businessId, business.id)),
    db.select({ id: devices.id, name: devices.name, settlementBankAccountId: devices.settlementBankAccountId }).from(devices).where(and(eq(devices.businessId, business.id), eq(devices.kind, "pos"), eq(devices.cashierEnabled, true))),
  ]);
  const catalog: OfflineCatalog = { version: 1, snapshotId: randomUUID(), businessId: business.id, name: business.name, issuedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 7 * 86400_000).toISOString(), taxPercent: business.taxPercent, servicePercent: business.servicePercent, products: items.filter(p => p.price > 0), tables, categories: cats, terminals };
  await db.insert(offlineCatalogs).values({ id: catalog.snapshotId, terminalId: terminal.id, payload: catalog });
  return catalog;
}
export async function syncOfflineSale(req: Request, raw: unknown) {
  const { terminal, business, features } = await offlineAuth(req);
  let sale: ReturnType<typeof parseOfflineSale>;
  try { sale = parseOfflineSale(raw); } catch (e) { throw new HttpError(400, (e as Error).message); }
  const hash = tokenHash(canonical(sale));
  await ensureAccounting(business);
  return db.transaction(async rawTx => {
    const tx = rawTx as unknown as OrderTransaction;
    // Locks also serialize revocation and concurrent delivery from this terminal.
    const [current] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!current || current.revokedAt) throw new HttpError(401, "دسترسی دستگاه لغو شده است");
    const [inserted] = await tx.insert(offlineSales).values({ id: sale.id, terminalId: terminal.id, businessId: business.id, payloadHash: hash, payload: sale }).onConflictDoNothing().returning();
    let existingOrderId: number | null = null;
    if (!inserted) {
      const [saved] = await tx.select().from(offlineSales).where(and(eq(offlineSales.id, sale.id), eq(offlineSales.terminalId, terminal.id), eq(offlineSales.businessId, business.id)));
      if (!saved || !saved.orderId) throw new HttpError(409, "شناسه فروش قبلاً ثبت شده است");
      const [order] = await tx.select({ id: orders.id, number: orders.number }).from(orders).where(and(eq(orders.id, saved.orderId), eq(orders.businessId, business.id)));
      if (saved.payloadHash === hash) return { saleId: sale.id, orderId: order.id, number: order.number, duplicate: true };
      if (saved.payload.tender !== null || sale.tender === null || canonical({ ...saved.payload, tender: null }) !== canonical({ ...sale, tender: null })) throw new HttpError(409, "فروش ثبت‌شده قابل تغییر نیست؛ فقط دریافت وجه سفارش پرداخت‌نشده مجاز است");
      existingOrderId = saved.orderId;
    }
    const [snapshot] = await tx.select().from(offlineCatalogs).where(and(eq(offlineCatalogs.id, sale.snapshotId), eq(offlineCatalogs.terminalId, terminal.id)));
    if (!snapshot || snapshot.payload.businessId !== business.id) throw new HttpError(409, "نسخه منوی این دستگاه پیدا نشد");
    try { assertOfflineLease(sale, snapshot.payload); } catch (e) { throw new HttpError(409, (e as Error).message); }
    // The catalog was issued while entitled; importing a completed sale is allowed
    // after expiry, but obtaining another catalog requires an active POS entitlement.
    const catalog = snapshot.payload;
    const input = parseOrderInput({ items: sale.items, type: sale.type, tableId: sale.tableId, customerName: sale.customerName, customerPhone: sale.customerPhone, note: sale.note });
    const order = existingOrderId ? (await tx.select().from(orders).where(and(eq(orders.id, existingOrderId), eq(orders.businessId, business.id))))[0] : await createOrder({ ...business, taxPercent: catalog.taxPercent, servicePercent: catalog.servicePercent }, input, "cashier", features, {
      executor: tx, deferPrint: true, actorId: terminal.createdBy, offline: { products: catalog.products, occurredAt: new Date(sale.occurredAt) },
    });
    if (existingOrderId && (order.status === "canceled" || order.paymentStatus !== "unpaid")) throw new HttpError(409, "سفارش در سایت بسته یا تسویه شده است؛ دریافت محلی را مدیر بررسی کند");
    if (order.total !== sale.total) throw new HttpError(409, "مبلغ محلی با محاسبه سرور یکسان نیست؛ فروش برای بررسی روی دستگاه محفوظ است");
    if (sale.tender) {
    const pos = catalog.terminals.find(p => p.id === sale.tender!.posDeviceId);
    if (sale.tender.posAmount > 0) {
      // Reusing the same actual terminal receipt for two sales is not allowed.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`offline-pos:${business.id}:${pos!.id}:${sale.tender.posRefNo}`}))`);
      const previous = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.businessId, business.id), sql`timezone('Asia/Tehran', ${orders.createdAt})::date = timezone('Asia/Tehran', ${sale.occurredAt}::timestamptz)::date`, sql`${orders.paymentBreakdown}->>'posRefNo' = ${sale.tender.posRefNo}`, sql`${orders.paymentBreakdown}->>'posDeviceId' = ${String(pos!.id)}`)).limit(1);
      if (previous.length) throw new HttpError(409, "شماره پیگیری کارتخوان قبلاً برای سفارش دیگری ثبت شده است");
    }
    const settlement = normalizeSettlementInput({ ...sale.tender, bankAmount: 0, bankAccountId: null, posBankAccountId: pos?.settlementBankAccountId ?? null, allowDebt: false, idempotencyKey: `offline:${sale.id}`, completeOrder: true }, order.total);
    await settleOrder(business, features, order.id, null, true, { executor: tx, settlement, actorId: terminal.createdBy, actorType: "offline_terminal", offlineOccurredAt: new Date(sale.occurredAt), skipPrint: true });
    }
    await tx.update(offlineSales).set({ orderId: order.id, payload: sale, payloadHash: hash }).where(eq(offlineSales.id, sale.id));
    return { saleId: sale.id, orderId: order.id, number: order.number, duplicate: false };
  });
}
