import type { ProductOptionGroup } from "./product-options";

export type OfflineProduct = { id: number; name: string; price: number; categoryId: number | null; sellingMode: string; yieldRatio: number; modifierGroups: ProductOptionGroup[] };
export type OfflineCatalog = {
  version: 1; snapshotId: string; businessId: number; name: string; issuedAt: string; validUntil: string;
  taxPercent: number; servicePercent: number; products: OfflineProduct[];
  tables: { id: number; name: string }[]; categories: { id: number; name: string }[];
  terminals: { id: number; name: string; settlementBankAccountId: number | null }[];
};
export type OfflineSale = {
  version: 1; id: string; snapshotId: string; occurredAt: string; total: number;
  type: "dine_in" | "takeaway"; tableId: number | null; customerName: string; customerPhone: string; note: string;
  items: { productId: number; quantity: number; optionIds: string[]; weightGrams: number | null; tareGrams: number }[];
  tender: { cashAmount: number; posAmount: number; posDeviceId: number | null; posRefNo: string } | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseOfflineSale(raw: unknown): OfflineSale {
  if (!raw || typeof raw !== "object") throw new Error("فروش محلی نامعتبر است");
  const v = raw as OfflineSale;
  if (v.version !== 1 || !uuid.test(v.id ?? "") || !uuid.test(v.snapshotId ?? "")) throw new Error("نسخه یا شناسه فروش معتبر نیست");
  if (!Number.isFinite(Date.parse(v.occurredAt)) || !Number.isSafeInteger(v.total) || v.total < 1 || v.total > 2_147_483_647) throw new Error("تاریخ یا مبلغ نامعتبر است");
  if (!["dine_in", "takeaway"].includes(v.type) || (v.tableId !== null && (!Number.isSafeInteger(v.tableId) || v.tableId < 1))) throw new Error("نوع سفارش یا میز معتبر نیست");
  for (const [key, max] of [["customerName",80],["customerPhone",20],["note",300]] as const) if (typeof v[key] !== "string" || v[key].length > max) throw new Error("اطلاعات مشتری یا توضیح نامعتبر است");
  if (v.customerPhone && !/^09\d{9}$/.test(v.customerPhone)) throw new Error("شماره مشتری معتبر نیست");
  if (v.customerName && !v.customerPhone) throw new Error("برای ثبت مشتری شماره لازم است");
  if (!Array.isArray(v.items) || v.items.length < 1 || v.items.length > 50) throw new Error("تعداد اقلام نامعتبر است");
  for (const i of v.items) {
    if (!i || typeof i !== "object" || !Number.isSafeInteger(i.productId) || i.productId < 1 || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 50 || !Array.isArray(i.optionIds) || i.optionIds.length > 40 || i.optionIds.some(x => typeof x !== "string" || x.length > 48)) throw new Error("اقلام سفارش نامعتبر است");
  }
  const t = v.tender;
  if (t === null) return v;
  if (!t || typeof t !== "object") throw new Error("وضعیت دریافت وجه لازم است");
  if (!Number.isSafeInteger(t.cashAmount) || !Number.isSafeInteger(t.posAmount) || t.cashAmount < 0 || t.posAmount < 0 || t.cashAmount + t.posAmount !== v.total) throw new Error("جمع دریافت نقدی و کارتخوان باید برابر مبلغ سفارش باشد");
  if (typeof t.posRefNo !== "string" || t.posRefNo.length > 40 || (t.posAmount > 0 && (!Number.isSafeInteger(t.posDeviceId) || t.posDeviceId! < 1 || !/^[\w-]{4,40}$/.test(t.posRefNo)))) throw new Error("برای دریافت کارتخوان، دستگاه و شماره پیگیری واقعی لازم است");
  return v;
}
export function assertOfflineLease(sale: OfflineSale, catalog: OfflineCatalog, now = Date.now()) {
  const at = Date.parse(sale.occurredAt);
  if (sale.snapshotId !== catalog.snapshotId || at < Date.parse(catalog.issuedAt) - 300_000 || at > Date.parse(catalog.validUntil) || at > now + 300_000) throw new Error("فروش خارج از بازه مجاز منوی ذخیره‌شده است؛ مدیر باید بررسی کند");
  if (sale.items.some(i => !catalog.products.some(p => p.id === i.productId))) throw new Error("محصول در نسخه منوی دستگاه وجود ندارد");
  if (sale.tableId && !catalog.tables.some(t => t.id === sale.tableId)) throw new Error("میز در نسخه منوی دستگاه وجود ندارد");
  if (sale.tender?.posAmount && !catalog.terminals.some(t => t.id === sale.tender!.posDeviceId && t.settlementBankAccountId)) throw new Error("کارتخوان در نسخه منوی دستگاه تنظیم نشده است");
}
