"use client";
import { CashierDebtModal } from "@/components/cashier-debt-modal";
import type { CashierDebtInput } from "@/lib/cashier-debt-input";


import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import "./cashier-workspace.css";
import { api, useCollection } from "@/lib/api";
import { formatPrice, statusInfo, toFa } from "@/lib/format";
import type { Category, DiningTable, Order, Product, StaffMember } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  Modal,
  PageHeader,
  PersianDateInput,
  ProductThumb,
  Select,
  Skeleton,
  Textarea,
  cn,
  useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFeatures } from "@/components/features";
import { MapPicker } from "@/components/map-picker";
import { TableManager } from "@/components/table-manager";
import { CashierOrderDesk } from "@/components/cashier-order-desk";
import { ProductOptionPicker } from "@/components/product-option-picker";
import { cartLines, cartProductQuantity, changeAnyCartVariant, changeCartVariant, type CartState } from "@/lib/order-cart";

type CashShift = { id: number; openingCash: number; cashSales: number; nonCashSales: number; expectedCash: number; byMethod: { method: string; amount: number }[] };
type MembershipPreview = { eligible: true; tier: { id: string; name: string }; discountAmount: number; discountPercent: number; maxDiscount: number; expiresAt: string } | { eligible: false; reason: string };
const paymentMethodLabels: Record<string, string> = { cash: "نقد", pos: "کارت‌خوان", card: "کارت‌به‌کارت", ipg: "درگاه آنلاین", snappay: "اسنپ‌پی", digipay: "دیجی‌پی", cashback: "اعتبار", unknown: "نامشخص" };
const amountInput = (value: string) => Number(value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, ""));
const normalizedPhone = (value: string) => value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").replace(/^98/, "0");
function cashierProductFallback(product: Product, categories: Category[]) {
  const category = categories.find((item) => item.id === product.categoryId)?.name ?? "";
  const description = `${product.name} ${category}`;
  if (/دسر|کیک|بستنی|شیرینی|براونی|تیرامیسو|چیزکیک|کوکی/.test(description)) return "/images/cashier/dessert.webp";
  if (/آیس|سرد|موهیتو|لیموناد|شربت|نوشیدنی/.test(description)) return "/images/cashier/cold-drink.webp";
  if (/قهوه|اسپرسو|لاته|کاپوچینو|آمریکانو|موکا|چای|دمنوش/.test(description)) return "/images/cashier/beverage.webp";
  if (/غذا|ایرانی|ناهار|صبحانه|پیتزا|برگر|کباب|خورش|سالاد|مرغ|ساندویچ/.test(description)) return "/images/cashier/meal.webp";
  return "";
}
const ORDER_STAGE_LABELS: Record<1 | 2 | 3 | 4, string[]> = {
  1: ["سفارش"],
  2: ["جدید", "تکمیل"],
  3: ["جدید", "در جریان", "تکمیل"],
  4: ["جدید", "آماده‌سازی", "آماده", "سرو شده"],
};

export default function WaiterPage({ mode = "waiter" }: { mode?: "waiter" | "cashier" }) {
  const f = useFeatures();
  const canReadScale = f.has("scale");
  const sp = useSearchParams();
  const products = useCollection<Product>("/api/products");
  const categories = useCollection<Category>("/api/categories");
  const tables = useCollection<DiningTable>("/api/tables", { poll: 10000 });
  const staff = useCollection<StaffMember>("/api/staff");
  const toast = useToast();

  const [tax, setTax] = useState({ taxPercent: 0, servicePercent: 0 });
  const [cart, setCart] = useState<CartState>({});
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);
  const [scaleReadings, setScaleReadings] = useState<{ id: number; name: string; weightGrams: number }[]>([]);
  const weightProductId = optionProduct?.sellingMode === "weight" ? optionProduct.id : null;
  const [tableId, setTableId] = useState<number | "takeaway" | "delivery" | null>(mode === "cashier" && sp.get("phone") && f.has("delivery_order") ? "delivery" : null);
  const [waiterId, setWaiterId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [append, setAppend] = useState(true);
  const [catId, setCatId] = useState<number | "all">("all");
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [slug, setSlug] = useState("");
  const [phone, setPhone] = useState(sp.get("phone") ?? "");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [zones, setZones] = useState<{ id: number; name: string; fee: number; radiusKm: number }[]>([]);
  const [scheduled, setScheduled] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [tmOpen, setTmOpen] = useState(false);
  const [tablePicker, setTablePicker] = useState(false);
  const [returnToCart, setReturnToCart] = useState(false);
  const [tableQuery, setTableQuery] = useState("");
  function chooseTable() { setReturnToCart(sheet); setSheet(false); setTablePicker(true); }
  function closeTablePicker() { setTablePicker(false); if (returnToCart) setSheet(true); }
  function selectTable(id: number | "takeaway" | "delivery") {
    setTableId(id);
    setAppend(true);
    if (typeof id === "number" && tables.items.find((table) => table.id === id)?.openOrder) setUseMembership(false);
    closeTablePicker();
  }
  const canManageTables = mode === "cashier" && f.has(["self_order", "cashier_pos"]) && (f.isManager || f.role === "cashier");
  const [bizLoc, setBizLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ code: string; amount: number } | null>(null);
  const [membershipPreview, setMembershipPreview] = useState<MembershipPreview | null>(null);
  const [useMembership, setUseMembership] = useState(false);
  const [manualDiscountValue, setManualDiscountValue] = useState("");
  const [manualDiscountMode, setManualDiscountMode] = useState<"amount" | "percent">("amount");
  const [payMethod, setPayMethod] = useState<"later" | "cash" | "pos" | "card">(mode === "cashier" ? "cash" : "later");
  const [cashShift, setCashShift] = useState<CashShift | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [shiftNote, setShiftNote] = useState("");
  const [shiftBusy, setShiftBusy] = useState(false);
  const [orderRevision, setOrderRevision] = useState(0);
  const [debtOpen, setDebtOpen] = useState(false);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [workflowPreset, setWorkflowPreset] = useState<1 | 2 | 3 | 4>(4);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);

  useEffect(() => {
    if (weightProductId === null || !canReadScale) return;
    let live = true;
    const loadScales = () => api<{ items: { id: number; name: string; weightGrams: number }[] }>("/api/scales")
      .then((result) => { if (live) setScaleReadings(result.items); })
      .catch(() => { if (live) setScaleReadings([]); });
    void loadScales();
    const timer = setInterval(loadScales, 2500);
    return () => { live = false; clearInterval(timer); };
  }, [weightProductId, canReadScale]);

  async function refreshCashShift() {
    if (mode !== "cashier") return;
    try { const result = await api<{ item: CashShift | null }>("/api/cash-shifts"); setCashShift(result.item); }
    catch (error) { toast((error as Error).message, "error"); }
  }

  async function openCashShift() {
    const amount = amountInput(openingCash);
    if (!Number.isSafeInteger(amount) || amount < 0) return toast("موجودی آغاز شیفت را به‌صورت عدد صحیح وارد کنید", "error");
    setShiftBusy(true);
    try { const result = await api<{ item: CashShift }>("/api/cash-shifts", { method: "POST", body: { openingCash: amount, note: shiftNote } }); setCashShift(result.item); setOpeningCash(""); setShiftNote(""); toast("شیفت صندوق آغاز شد"); }
    catch (error) { toast((error as Error).message, "error"); }
    finally { setShiftBusy(false); }
  }

  async function closeCashShift() {
    if (!cashShift) return;
    const amount = amountInput(closingCash);
    if (!Number.isSafeInteger(amount) || amount < 0) return toast("موجودی پایان شیفت را به‌صورت عدد صحیح وارد کنید", "error");
    setShiftBusy(true);
    try {
      const result = await api<{ item: CashShift & { closingCash: number; cashDifference: number } }>(`/api/cash-shifts/${cashShift.id}`, { method: "POST", body: { closingCash: amount, note: shiftNote } });
      setCashShift(null); setClosingCash(""); setShiftNote("");
      toast(`شیفت بسته شد · اختلاف صندوق ${formatPrice(Math.abs(result.item.cashDifference))} ${result.item.cashDifference < 0 ? "کسری" : result.item.cashDifference > 0 ? "اضافه" : "بدون اختلاف"}`);
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setShiftBusy(false); }
  }

  useEffect(() => {
    api<{ item: { taxPercent: number; servicePercent: number; slug: string; lat: number | null; lng: number | null; settings?: { orderWorkflowPreset?: 1 | 2 | 3 | 4 } } }>("/api/business").then((r) => {
      if (r.item.lat != null && r.item.lng != null) setBizLoc({ lat: r.item.lat, lng: r.item.lng });
      setTax({ taxPercent: r.item.taxPercent, servicePercent: r.item.servicePercent });
      setSlug(r.item.slug);
      setWorkflowPreset(r.item.settings?.orderWorkflowPreset ?? 4);
    });
    api<{ items: { id: number; name: string; fee: number; radiusKm: number }[] }>("/api/r/zones").then((r) => setZones(r.items)).catch(() => {});
    if (mode === "cashier") api<{ item: CashShift | null }>("/api/cash-shifts").then((r) => setCashShift(r.item)).catch((e) => toast((e as Error).message, "error"));
  }, [mode, toast]);

  const waiters = staff.items.filter((s) => s.role === "waiter" && s.isActive);
  const cats = categories.items.filter((c) => c.isActive);
  const selectedTable = typeof tableId === "number" ? tables.items.find((t) => t.id === tableId) : null;
  const open = selectedTable?.openOrder ?? null;

  const visible = useMemo(() => {
    const term = q.trim();
    return products.items.filter(
      (p) => p.isAvailable && (catId === "all" || p.categoryId === catId) && (!term || p.name.includes(term)),
    );
  }, [products.items, catId, q]);

  const lines = cartLines(products.items, cart);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const manualNumeric = Number(manualDiscountValue.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/[٬,]/g, "").replace(/٫/g, "."));
  const manualDiscountAmount = mode === "cashier" && f.has("discount") && Number.isFinite(manualNumeric) && manualNumeric > 0
    ? Math.min(subtotal, Math.floor(manualDiscountMode === "percent" ? subtotal * Math.min(manualNumeric, 100) / 100 : manualNumeric))
    : 0;
  const disc = applied ? Math.min(applied.amount, subtotal) : manualDiscountAmount;
  const membershipAmount = membershipPreview?.eligible
    ? Math.min(subtotal, Math.floor(subtotal * membershipPreview.discountPercent / 100), membershipPreview.maxDiscount > 0 ? membershipPreview.maxDiscount : subtotal)
    : 0;
  const totalDiscount = useMembership ? membershipAmount : disc;
  const optionSurcharge = lines.reduce((sum, line) => sum + line.optionSnapshot.reduce((amount, option) => amount + option.priceDelta, 0) * line.qty, 0);
  const isDelivery = tableId === "delivery";
  const fee = isDelivery ? (zones.find((z) => String(z.id) === zoneId)?.fee ?? 0) : 0;
  const taxAmt = Math.round(((subtotal - totalDiscount) * tax.taxPercent) / 100);
  const svc = isDelivery ? 0 : Math.round(((subtotal - totalDiscount) * tax.servicePercent) / 100);
  const total = subtotal - totalDiscount + taxAmt + svc + fee;

  const hasMembership = mode === "cashier" && f.has("loyalty");
  useEffect(() => {
    const normalized = phone.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
    if (!hasMembership || !/^09\d{9}$/.test(normalized) || subtotal <= 0) return;
    let live = true;
    const timer = setTimeout(() => {
      api<MembershipPreview>(`/api/business?membershipPreview=1&phone=${encodeURIComponent(normalized)}&subtotal=${subtotal}`)
        .then((result) => { if (live) setMembershipPreview(result); })
        .catch(() => { if (live) setMembershipPreview(null); });
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [hasMembership, phone, subtotal]);

  async function applyCode() {
    try {
      const r = await api<{ code: string; amount: number }>(`/api/public/${slug}/discount?code=${encodeURIComponent(code)}&subtotal=${subtotal}`);
      setUseMembership(false);
      setApplied(r);
      setManualDiscountValue("");
      setDiscountOpen(true);
      toast(`کد تخفیف اعمال شد: ${formatPrice(r.amount)}`);
    } catch (e) {
      setApplied(null);
      toast((e as Error).message, "error");
    }
  }

  const add = (product: Product, d = 1) => {
    if (d > 0 && (product.sellingMode === "weight" || product.modifierGroups?.some((group) => group.active))) setOptionProduct(product);
    else setCart((current) => changeAnyCartVariant(current, product.id, d));
  };
  const addVariant = (product: Product, optionIds: string[], delta: number, weightGrams?: number, tareGrams?: number) => setCart((current) => changeCartVariant(current, product.id, optionIds, delta, 50, weightGrams, tareGrams));

  const customerPhoneForSubmit = phone;
  const customerNameForSubmit = customerName;
  async function submit(registerOnly = false, creditDetails?: CashierDebtInput) {
    const phone = creditDetails?.phone ?? customerPhoneForSubmit;
    const customerName = creditDetails?.name ?? customerNameForSubmit;
    if (!lines.length) return;
    if (mode === "cashier" && customerName.trim() && !/^09\d{9}$/.test(normalizedPhone(phone))) {
      toast("برای افزودن اطلاعات مشتری به فهرست، شماره موبایل معتبر وارد کنید", "error");
      setCustomerDetailsOpen(true);
      return;
    }
    if (mode === "cashier" && phone.trim() && !/^09\d{9}$/.test(normalizedPhone(phone))) {
      toast("شماره موبایل مشتری معتبر نیست", "error");
      setCustomerDetailsOpen(true);
      return;
    }
    if (mode === "cashier" && !registerOnly && payMethod === "later" && !/^09\d{9}$/.test(normalizedPhone(phone))) {
      toast("برای ثبت سفارش در بدهکاران، شماره موبایل معتبر مشتری لازم است", "error");
      setCustomerDetailsOpen(true);
      return;
    }
    if (tableId === null) {
      toast("ابتدا میز یا بیرون‌بر را انتخاب کنید", "error");
      chooseTable();
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty, optionIds: l.optionIds, weightGrams: l.weightGrams, tareGrams: l.tareGrams })),
        type: tableId === "takeaway" ? "takeaway" : tableId === "delivery" ? "delivery" : "dine_in",
        tableId: typeof tableId === "number" ? tableId : null,
        customerPhone: phone,
        address,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
        zoneId: zoneId ? Number(zoneId) : null,
        scheduledFor: scheduled ? new Date(scheduled).toISOString() : null,
        discountCode: mode === "cashier" ? applied?.code ?? "" : "",
        manualDiscountAmount: manualDiscountAmount && !applied && !useMembership ? manualDiscountAmount : 0,
        useMembership: mode === "cashier" && useMembership,
        payNow: mode === "cashier" && !registerOnly ? (payMethod === "later" ? "credit" : payMethod) : null,
        creditDetails,
        source: mode,
        waiterId: waiterId ? Number(waiterId) : null,
        customerName,
        note,
        appendTo: open && append ? open.id : null,
      };
      const { item } = await api<{ item: Order }>("/api/orders", { method: "POST", body });
      toast(open && append ? `به سفارش #${toFa(item.number)} اضافه شد` : `سفارش #${toFa(item.number)} ثبت شد`);
      setOrderRevision((value) => value + 1);
      setDebtOpen(false);
      setCart({});
      setNote("");
      setCustomerName("");
      setPhone("");
      setAddress("");
      setPin(null);
      setCode("");
      setApplied(null);
      setUseMembership(false);
      setMembershipPreview(null);
      setManualDiscountValue("");
      setScheduled("");
      setSheet(false);
      setCustomerDetailsOpen(false);
      tables.reload(true);
      await refreshCashShift();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveWorkflowPreset(value: 1 | 2 | 3 | 4) {
    if (!f.isManager) return;
    setWorkflowSaving(true);
    try {
      await api("/api/business", { method: "PATCH", body: { settings: { orderWorkflowPreset: value } } });
      setWorkflowPreset(value);
      setWorkflowOpen(false);
      toast("نمای مراحل سفارش ذخیره شد");
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setWorkflowSaving(false); }
  }

  const loading = products.loading || categories.loading || tables.loading;

  const cartPanel = (
    <div className={cn("flex h-full min-h-0 flex-col", mode === "cashier" && "cashier-checkout-panel")}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {mode === "cashier" && <details className="border-b border-stone-100 p-2"><summary className="cursor-pointer text-[11px] font-bold">{cashShift ? `شیفت فعال #${toFa(cashShift.id)}` : "شیفت صندوق باز نیست · مدیریت شیفت"}</summary><div className="mt-2">
        {!cashShift ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-xs font-bold text-amber-950">شیفت صندوق باز نیست</p>
          <p className="mt-0.5 text-[11px] leading-5 text-amber-900">برای ثبت فروش در گزارش صندوق، موجودی نقد آغاز را وارد کنید.</p>
          <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><Input className="h-9 text-xs" inputMode="numeric" aria-label="موجودی نقد آغاز شیفت" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="موجودی آغاز (تومان)"/><Button size="sm" className="h-9 min-h-0 px-3" loading={shiftBusy} onClick={openCashShift}>شروع شیفت</Button></div>
          <Input className="mt-1.5 h-9 text-xs" aria-label="توضیح شیفت" value={shiftNote} maxLength={500} onChange={(e) => setShiftNote(e.target.value)} placeholder="توضیح آغاز شیفت (اختیاری)" />
        </div> : <div className="space-y-2 rounded-xl bg-sky-50 p-2.5">
          <div className="flex items-center justify-between"><p className="text-sm font-bold text-sky-950">شیفت فعال #{toFa(cashShift.id)}</p><span className="badge badge-success badge-sm">باز</span></div>
          <div className="grid grid-cols-2 gap-2 text-xs"><p>فروش نقدی: <b>{formatPrice(cashShift.cashSales)}</b></p><p>غیرنقدی: <b>{formatPrice(cashShift.nonCashSales)}</b></p><p className="col-span-2">موجودی نقد مورد انتظار: <b>{formatPrice(cashShift.expectedCash)}</b></p>{cashShift.byMethod.map((row) => <p key={row.method}>{paymentMethodLabels[row.method] ?? row.method}: <b>{formatPrice(row.amount)}</b></p>)}</div>
          <Input aria-label="توضیح بستن شیفت" value={shiftNote} maxLength={500} onChange={(e) => setShiftNote(e.target.value)} placeholder="توضیح پایان شیفت (اختیاری)" />
          <div className="flex gap-2"><Input inputMode="numeric" aria-label="موجودی نقد پایان شیفت" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="شمارش نقد پایان شیفت"/><Button size="sm" variant="secondary" loading={shiftBusy} onClick={closeCashShift}>بستن شیفت</Button></div>
        </div>}
      </div></details>}
      <div className={cn("border-b border-stone-100", mode === "cashier" ? "space-y-2.5 bg-white p-3" : "space-y-3 bg-stone-50/70 p-4")}>
        <div className="flex items-center justify-between">
          <div><h3 className="font-bold">سفارش جاری</h3><p className="mt-1 text-xs text-stone-500">{toFa(count)} قلم · {mode === "cashier" ? "بررسی و تسویه سفارش" : "آماده ارسال به آشپزخانه"}</p></div>
          {count > 0 && (
            <button className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setCart({})}>
              خالی کردن
            </button>
          )}
        </div>
        {mode === "cashier" && <div className="grid grid-cols-2 gap-2">
          <Select className="h-9 text-xs lg:h-[34px] lg:min-h-[34px]" value={waiterId} onChange={(e) => setWaiterId(e.target.value)} aria-label="گارسون">
            <option value="">گارسون…</option>
            {waiters.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
          <Button type="button" variant="secondary" className="min-h-11 lg:h-9 lg:min-h-9 lg:px-2 lg:text-[11px]" onClick={() => setCustomerDetailsOpen(true)}><Icon name="waiter" className="size-4" /> جزئیات سفارش و مشتری {customerName || phone || note ? "· تکمیل‌شده" : ""}</Button>
        </div>}
        <Button variant="secondary" className={cn("min-h-12 w-full justify-between rounded-xl lg:h-9 lg:min-h-9 lg:px-2.5 lg:text-xs", tableId === null ? "border-rose-200 bg-rose-50 text-rose-800" : "border-brand-200 bg-brand-50 text-brand-800")} onClick={chooseTable}>
          <span className="flex items-center gap-2"><Icon name="table" className="size-5" /><span className="text-start">{tableId === null ? "انتخاب میز یا نوع سفارش" : selectedTable?.name ?? (isDelivery ? "ارسال با پیک" : "بیرون‌بر")}{tableId === null && <span className="block text-[10px] font-normal text-rose-700">میز انتخاب نشده</span>}</span></span>
          <span className="text-xs text-brand-700">{tableId === null ? "انتخاب" : "تغییر"}</span>
        </Button>
      </div>


        <div className={mode === "cashier" ? "cashier-lines p-2.5" : "min-h-32 p-4"}>
        {lines.length === 0 ? (
          <div className={cn("flex h-full flex-col items-center justify-center text-center text-stone-400", mode === "cashier" ? "py-4" : "py-8")}>
            <Icon name="cart" className="mb-2 size-10" />
            <p className="text-sm">برای افزودن، روی محصولات بزنید</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {lines.map(({ key, product: p, qty, lineTotal, weightGrams, netWeightGrams, tareGrams, optionIds, optionSnapshot }) => (
              <li key={key} className={cn("flex items-center gap-2", mode === "cashier" ? "border-b border-stone-100 py-3 last:border-0" : "rounded-2xl border border-stone-100 bg-white p-2 animate-pop")}>
                <ProductThumb imageUrl={mode === "cashier" && (!p.imageUrl || p.imageUrl.startsWith("/food/")) ? cashierProductFallback(p, categories.items) || p.imageUrl : p.imageUrl} emoji={iconGlyph(p.emoji)} className="size-12 shrink-0 rounded-xl text-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  {optionSnapshot.length > 0 && <p className="truncate text-[11px] text-stone-500">{optionSnapshot.map((option) => option.optionName).join("، ")}</p>}
                  {optionSnapshot.length > 0 && <p className="text-[10px] leading-4 text-brand-700">پایه {formatPrice(p.price * qty)} · {optionSnapshot.map((option) => `${option.optionName} ${option.priceDelta >= 0 ? "+" : "−"}${formatPrice(Math.abs(option.priceDelta))}`).join("، ")} · سهم آپشن در این ردیف {optionSnapshot.reduce((amount, option) => amount + option.priceDelta, 0) * qty < 0 ? "−" : "+"}{formatPrice(Math.abs(optionSnapshot.reduce((amount, option) => amount + option.priceDelta, 0) * qty))}</p>}
                  {netWeightGrams != null && <p className="text-[11px] text-stone-500">{toFa(netWeightGrams)} گرم خالص{tareGrams ? ` · ظرف ${toFa(tareGrams)} گرم` : ""}</p>}
                  <p className="text-xs text-stone-500">{formatPrice(lineTotal)}</p>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-0.5">
                  <button className="flex size-11 items-center justify-center rounded-md hover:bg-white" onClick={() => addVariant(p, optionIds, -1, weightGrams ?? undefined, tareGrams)} aria-label="کم">
                    <Icon name={qty === 1 ? "trash" : "minus"} className="size-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{toFa(qty)}</span>
                  <button className="flex size-11 items-center justify-center rounded-md hover:bg-white" onClick={() => addVariant(p, optionIds, 1, weightGrams ?? undefined, tareGrams)} aria-label="زیاد">
                    <Icon name="plus" className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        </div>

        <div className={cn("space-y-3 border-t border-stone-100 p-4", mode === "cashier" && "cashier-extras")}>
        {mode === "waiter" && isDelivery && <Input inputMode="tel" dir="ltr" className="text-left" placeholder="موبایل مشتری *" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        <IconText>{isDelivery && (
          <div className="space-y-2">
            <Textarea rows={2} placeholder="آدرس تحویل *" value={address} onChange={(e) => setAddress(e.target.value)} />
            <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => setMapOpen(true)}>{pin ? " موقعیت روی نقشه ثبت شد (تغییر)" : " انتخاب محل تحویل روی نقشه"}</Button>
            {f.has("zones") && zones.length > 0 && (
              <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">محدوده ارسال…</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {formatPrice(z.fee)}</option>)}
              </Select>
            )}
          </div>
        )}</IconText>
        {mode === "cashier" && f.has("preorder") && (
          <details><summary className="cursor-pointer text-xs font-semibold text-stone-600">پیش‌سفارش {scheduled ? "· زمان مشخص شده" : "(اختیاری)"}</summary><PersianDateInput className="mt-2" value={scheduled} onChange={setScheduled} withTime placeholder="انتخاب روز و ساعت" /></details>
        )}
        {mode === "cashier" && f.has("discount") && (
          <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <button type="button" aria-expanded={discountOpen} aria-controls="cashier-discount-fields" onClick={() => setDiscountOpen((value) => !value)} className="flex min-h-12 w-full items-center justify-between gap-2 px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary lg:min-h-9 lg:px-2 lg:text-xs">
              <span className="flex min-w-0 items-center gap-2"><Icon name="tag" className="size-4 shrink-0 text-stone-500" /><span className="truncate">کد تخفیف یا تخفیف دستی</span>{totalDiscount > 0 && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{formatPrice(totalDiscount)}</span>}</span>
              <Icon name={discountOpen ? "chevronUp" : "chevronDown"} className="size-4 shrink-0 text-stone-500" />
            </button>
            {discountOpen && <div id="cashier-discount-fields" className="space-y-2 border-t border-stone-100 p-3">
              <div className="flex gap-2">
                <Input dir="ltr" className="text-left uppercase" placeholder="کد تخفیف" value={code} disabled={!!(open && append) || useMembership} onChange={(e) => { setCode(e.target.value); setApplied(null); setManualDiscountValue(""); setUseMembership(false); }} />
                <Button variant="secondary" onClick={applyCode} disabled={!code.trim() || !subtotal || !!(open && append) || useMembership}>اعمال</Button>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2">
                <Select aria-label="نوع تخفیف صندوق" value={manualDiscountMode} disabled={!!(open && append) || !!applied || useMembership} onChange={(e) => setManualDiscountMode(e.target.value as "amount" | "percent")}>
                  <option value="amount">مبلغی</option><option value="percent">درصدی</option>
                </Select>
                <Input inputMode="decimal" dir="ltr" className="text-left" placeholder={manualDiscountMode === "amount" ? "مبلغ تخفیف (تومان)" : "درصد تخفیف (۰ تا ۱۰۰)"} value={manualDiscountValue} disabled={!!(open && append) || !!applied || useMembership} onChange={(e) => { setManualDiscountValue(e.target.value); setCode(""); setApplied(null); setUseMembership(false); }} />
              </div>
              {applied && <p className="text-xs font-medium text-emerald-700">کد «{applied.code}» اعمال شد.</p>}
              {open && append && <p className="text-[11px] leading-5 text-stone-500">برای اعمال تخفیف، ابتدا افزودن به سفارش جاری را غیرفعال کنید.</p>}
            </div>}
          </section>
        )}
        {hasMembership && phone && subtotal > 0 && (
          <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
            {membershipPreview?.eligible ? <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-brand-950">
              <input type="checkbox" checked={useMembership} disabled={!!(open && append)} onChange={(event) => { const checked = event.target.checked; setUseMembership(checked); if (checked) { setApplied(null); setCode(""); setManualDiscountValue(""); } }} className="mt-1 accent-brand-600" />
              <span><b>مزیت سطح «{membershipPreview.tier.name}»</b><br />تخفیف {toFa(membershipPreview.discountPercent)}٪{membershipPreview.maxDiscount > 0 ? ` تا ${formatPrice(membershipPreview.maxDiscount)}` : " بدون سقف جداگانه"}؛ مقدار این سفارش {formatPrice(membershipAmount)}. با فعال‌کردن، کد یا تخفیف دستی کنار گذاشته می‌شود.</span>
            </label> : <p className="text-xs leading-5 text-brand-900">{membershipPreview === null ? "برای بررسی سطح عضویت، شماره مشتری ثبت‌شده را وارد کنید." : "مشتری در بازه فعلی واجد شرایط سطح عضویت نیست."}</p>}
            {open && append && <p className="text-[11px] text-stone-500">برای اعمال مزیت عضویت، سفارش جاری را ببندید و سفارش تازه بسازید.</p>}
          </div>
        )}
        {mode === "cashier" && f.has("cashback") && <details className="text-[11px] text-stone-500"><summary className="cursor-pointer">وضعیت اعتبار مشتری</summary><p className="mt-1 leading-5">مصرف اعتبار مشتری تا فعال شدن تأیید پیامکی شماره غیرفعال است؛ اعتبار خریدهای پرداخت‌شده همچنان ثبت می‌شود.</p></details>}
        {mode === "waiter" && <label className="block space-y-2 text-xs font-semibold text-stone-600"><span>توضیحات برای آشپزخانه <span className="font-normal text-stone-400">(اختیاری)</span></span><Textarea rows={2} placeholder="مثلاً بدون پیاز یا سس جداگانه" value={note} onChange={(e) => setNote(e.target.value)} /></label>}
        {mode === "cashier" && <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => setCustomerDetailsOpen(true)}><Icon name="file" className="size-4" /> {note ? "ویرایش یادداشت و جزئیات مشتری" : "یادداشت سفارش"}</Button>}
        </div>

      </div>

      <div className="shrink-0 space-y-2 border-t border-stone-200 bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_20px_-18px_rgba(0,0,0,.4)]">
        {mode === "cashier" && <>
          <div className="space-y-1 rounded-xl bg-stone-50 px-3 py-2 text-[11px] text-stone-600">
            <p className="font-bold text-stone-800">خلاصه مبلغ سفارش</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between gap-2"><span>جمع اقلام</span><span className="shrink-0">{formatPrice(subtotal)}</span></div>
              {optionSurcharge !== 0 && <div className="flex justify-between gap-2 text-brand-700"><span>آپشن‌ها</span><span className="shrink-0">{optionSurcharge > 0 ? "+" : "−"}{formatPrice(Math.abs(optionSurcharge))}</span></div>}
              {totalDiscount > 0 && <div className="flex justify-between gap-2 text-emerald-700"><span>{useMembership && membershipPreview?.eligible ? `عضویت · ${membershipPreview.tier.name}` : `تخفیف (${applied?.code ?? (manualDiscountMode === "percent" ? `${toFa(manualNumeric)}٪` : "صندوق")})`}</span><span className="shrink-0">−{formatPrice(totalDiscount)}</span></div>}
              {fee > 0 && <div className="flex justify-between gap-2"><span>هزینه ارسال</span><span className="shrink-0">{formatPrice(fee)}</span></div>}
              {tax.taxPercent > 0 && <div className="flex justify-between gap-2"><span>مالیات</span><span className="shrink-0">{formatPrice(taxAmt)}</span></div>}
              {tax.servicePercent > 0 && <div className="flex justify-between gap-2"><span>خدمات</span><span className="shrink-0">{formatPrice(svc)}</span></div>}
            </div>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-[11px] font-bold text-stone-600">پرداخت</legend>
            <div role="group" aria-label="روش پرداخت" className="grid grid-cols-4 gap-1 rounded-xl bg-stone-100 p-1">
              {([ ["cash", "wallet", "نقدی"], ["pos", "pay", "کارتخوان"], ["card", "bank", "کارت‌به‌کارت"], ["later", "clock", "پرداخت بعداً"]] as const).map(([key, icon, label]) => (
                <button key={key} type="button" aria-pressed={payMethod === key} onClick={() => setPayMethod(key)} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", payMethod === key ? "bg-white text-primary shadow-sm" : "text-stone-600 hover:bg-white/60")}>
                  <Icon name={icon} className="hidden size-3.5 shrink-0 xl:inline-block" /><span>{label}</span>
                </button>
              ))}
            </div>
            {payMethod === "later" && <p className="text-[10px] leading-4 text-amber-800">ثبت بدهی به نام مشتری؛ تسویه از دفتر بدهکاران.</p>}
          </fieldset>
        </>}
        <div className="flex items-center justify-between gap-3 text-sm font-extrabold text-stone-900"><span>{mode === "cashier" ? payMethod === "later" ? "ماندهٔ بدهی" : "مبلغ قابل پرداخت" : "مبلغ نهایی"}</span><span>{formatPrice(total)}</span></div>
        <Button size="lg" className="min-h-12 w-full" disabled={!lines.length} loading={submitting} onClick={() => { if (mode === "cashier" && payMethod === "later") { if (tableId === null) { chooseTable(); return; } setDebtOpen(true); } else void submit(); }}>
          {open && append && typeof tableId === "number"
            ? mode === "waiter" || payMethod === "later" ? "افزودن به سفارش میز" : "افزودن و تسویه سفارش"
            : mode === "cashier" && payMethod === "later" ? "ثبت سفارش در بدهکاران" : mode === "cashier" ? "ثبت سفارش و دریافت وجه" : "ثبت و ارسال به آشپزخانه"}
        </Button>
        {mode === "cashier" && <Button size="sm" variant="ghost" className="min-h-9 w-full text-xs text-stone-600" disabled={!lines.length || submitting} onClick={() => void submit(true)}>ثبت سفارش بدون تسویه</Button>}
      </div>
    </div>
  );

  return (
    <div className={cn("animate-fade-in pb-24 lg:pb-0", mode === "cashier" && "cashier-workspace")}>
      {mode === "cashier" ? <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div><p className="text-[11px] font-semibold text-stone-500">سفارش‌گیر صندوق</p><h1 className="mt-0.5 text-base font-extrabold leading-tight text-stone-900">سفارش جدید</h1></div>
          <Button size="sm" variant="secondary" className="h-9 gap-1.5 rounded-lg px-2.5 text-xs" onClick={() => setWorkflowOpen(true)}><Icon name="list" className="size-4" /><span className="hidden sm:inline">مراحل سفارش</span><span className="sm:hidden">مراحل</span><Badge color="brand">{toFa(workflowPreset)}</Badge></Button>
        </div>
        <div className="text-xs text-stone-500">محصول را انتخاب کنید، سپس سفارش را ثبت کنید</div>
      </div> : <PageHeader title="پنل گارسون" subtitle="میز را انتخاب کنید، محصولات را لمس کنید و سفارش را ثبت کنید" />}
      <div className={cn(mode === "cashier" && "cashier-columns", "grid gap-3", mode === "cashier" ? "lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]" : "lg:grid-cols-[minmax(0,1fr)_400px]")}>
        {mode === "cashier" && <CashierOrderDesk revision={orderRevision} workflowPreset={workflowPreset} docked />}
        <div className={cn("min-w-0", mode === "cashier" && "cashier-catalog")}>
          <button onClick={chooseTable} className="mb-4 flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 text-start lg:hidden"><span className="flex items-center gap-2 text-sm font-bold"><Icon name="table" className="size-5 text-brand-600" />{selectedTable?.name ?? (tableId === "takeaway" ? "بیرون‌بر" : isDelivery ? "ارسال با پیک" : "برای کدام میز سفارش می‌گیرید؟")}</span><span className="text-xs font-semibold text-brand-700">انتخاب میز</span></button>
          {/* Products */}
          <section>
            <h2 className="mb-1.5 text-xs font-bold text-stone-700">منوی محصولات</h2>
            <div className="sticky top-14 z-10 -mx-4 mb-2 space-y-2 bg-[#f6f5f3]/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0 lg:top-0">
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                <Input className="ps-9" placeholder="جستجوی محصول…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                <IconText>{[{ id: "all" as const, name: "همه", emoji: "" }, ...cats].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCatId(c.id)}
                    className={cn("shrink-0 min-h-11 rounded-full px-3.5 py-2 text-sm font-medium transition", catId === c.id ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50")}
                  >
                    {<EmojiIcon emoji={c.emoji} /> } {c.name}
                  </button>
                ))}</IconText>
              </div>
            </div>

            <IconText>{loading ? (
              <div className={mode === "cashier" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
            ) : products.items.length === 0 ? (
              <EmptyState emoji="" title="منو خالی است" description="ابتدا محصولاتی به منو اضافه کنید." action={mode === "cashier" ? <Link href="/dashboard/products"><Button size="sm">افزودن محصول</Button></Link> : undefined} />
            ) : visible.length === 0 ? (
              <EmptyState emoji="" title="محصولی پیدا نشد" description="عبارت جستجو یا دسته‌بندی را تغییر دهید." />
            ) : (
              <div className={mode === "cashier" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
                {visible.map((p) => {
                  const qty = cartProductQuantity(cart, p.id);
                  const legacySeedImage = p.imageUrl?.startsWith("/food/");
                  const fallbackImage = mode === "cashier" && (!p.imageUrl || legacySeedImage) ? cashierProductFallback(p, categories.items) : "";
                  const productMedia = mode === "cashier" && fallbackImage ? <div className="relative h-24 w-full overflow-hidden bg-stone-100 sm:h-28"><Image src={fallbackImage} alt="" sizes="(min-width: 1280px) 260px, (min-width: 1024px) 180px, 50vw" loading={visible[0]?.id === p.id ? "eager" : "lazy"} fill className="object-cover transition duration-300 group-hover:scale-[1.02]" /></div> : <ProductThumb imageUrl={p.imageUrl} emoji={iconGlyph(p.emoji)} className={mode === "cashier" ? "h-24 w-full sm:h-28" : "h-28 w-full"} />;
                  const priceLabel = <>{formatPrice(p.price)}{p.sellingMode === "weight" ? <span className="ms-1 text-[10px]">/کیلو</span> : p.modifierGroups?.some((group) => group.active) && <span className="ms-1 text-[10px]">از</span>}</>;
                  return (
                    <Card key={p.id} className={cn("group relative overflow-hidden transition", mode === "cashier" && "cashier-product rounded-xl border-stone-200 shadow-none hover:border-primary", qty > 0 && "ring-2 ring-brand-400")}>
                      {mode === "cashier" ? <>
                        <button aria-label={`افزودن ${p.name} به سفارش`} aria-pressed={qty > 0} className="block w-full text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" onClick={() => add(p)}>
                          {productMedia}
                          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{p.name}</p></div>
                        </button>
                        <div className="flex min-w-0 items-center justify-between gap-1.5 px-2 pb-2 pt-1">
                          <span className="min-w-0 truncate text-[10px] font-bold text-brand-600">{priceLabel}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {p.isFeatured && <Badge color="amber"><EmojiIcon emoji="" /></Badge>}
                            {qty > 0 ? <span role="group" aria-label={`تعداد ${p.name} در سفارش`} className="inline-flex h-8 items-center gap-0.5 rounded-full bg-brand-500 px-0.5 text-white shadow-lg animate-pop">
                              <button type="button" className="flex size-7 items-center justify-center rounded-full hover:bg-white/20" onClick={() => add(p, -1)} aria-label={`کم کردن ${p.name}`}><Icon name="minus" className="size-3.5" /></button>
                              <span className="min-w-4 text-center text-[10px] font-bold">{toFa(qty)}</span>
                              <button type="button" className="flex size-7 items-center justify-center rounded-full hover:bg-white/20" onClick={() => add(p)} aria-label={`زیاد کردن ${p.name}`}><Icon name="plus" className="size-3.5" /></button>
                            </span> : <button type="button" aria-label={`افزودن ${p.name} به سفارش`} className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => add(p)}><Icon name="plus" className="size-4" /></button>}
                          </span>
                        </div>
                      </> : <button aria-label={`افزودن ${p.name} به سفارش`} aria-pressed={qty > 0} className="block w-full text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" onClick={() => add(p)}>
                        {productMedia}
                        <div className="p-3">
                          <p className="truncate text-sm font-bold">{p.name}</p>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-brand-600">{priceLabel}</span>
                            {p.isFeatured && <Badge color="amber"><EmojiIcon emoji="" /></Badge>}
                          </div>
                        </div>
                      </button>}
                    </Card>
                  );
                })}
              </div>
            )}</IconText>
          </section>
        </div>

        {/* Desktop cart */}
        <aside className={cn("hidden lg:block", mode === "cashier" && "cashier-cart")}>
          <Card className={cn("sticky top-6 min-h-0 overflow-hidden", mode === "cashier" ? "h-[calc(100dvh-11rem)] min-h-[28rem] rounded-2xl shadow-sm" : "h-[calc(100dvh-19rem)]")}>{cartPanel}</Card>
        </aside>
      </div>

      {/* Mobile cart bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white/90 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <button
          onClick={() => setSheet(true)}
          className={cn("flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-white shadow-2xl", mode === "cashier" ? "bg-primary" : "bg-stone-900")}
        >
          <span className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="relative">
              <Icon name="cart" />
              {count > 0 && <span className="absolute -end-2 -top-2 flex size-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold">{toFa(count)}</span>}
            </span>
            مشاهده سفارش
          </span>
          <span className="text-sm font-extrabold">{formatPrice(total)}</span>
        </button>
      </div>
      <Modal open={sheet} onClose={() => setSheet(false)} title="سفارش جاری" size="md">
        <div className="-mx-5 -my-5 h-[70dvh] min-h-0">{cartPanel}</div>
      </Modal>
      {debtOpen && <CashierDebtModal total={total} items={lines.map(line => ({name:line.product.name,quantity:line.qty,amount:line.lineTotal}))} name={customerName} phone={phone} busy={submitting} onClose={() => setDebtOpen(false)} onSubmit={details => submit(false,details)} />}
      <Modal open={customerDetailsOpen} onClose={() => setCustomerDetailsOpen(false)} title="جزئیات سفارش و اطلاعات مشتری" size="sm" footer={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setCustomerDetailsOpen(false)}>ذخیرهٔ جزئیات در سفارش</Button>{mode === "cashier" && payMethod === "later" && <Button disabled={!lines.length || submitting} onClick={() => { if (mode === "cashier" && payMethod === "later") { if (tableId === null) { chooseTable(); return; } setDebtOpen(true); } else void submit(); }}>تأیید ثبت بدهی · {formatPrice(total)}</Button>}</div>}>
        <div className="space-y-4">
          <p className="text-xs leading-6 text-stone-500">نام و شماره مشتری همراه سفارش ذخیره می‌شود؛ با واردکردن شماره معتبر، مشتری به فهرست مشتریان کسب‌وکار متصل می‌شود. برای ثبت بدهی، شماره همراه الزامی است.</p>
          <Field label="نام مشتری"><Input autoFocus maxLength={80} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="نام و نام خانوادگی" /></Field>
          <Field label={payMethod === "later" ? "شماره موبایل مشتری *" : "شماره موبایل مشتری (اختیاری)"}><Input inputMode="tel" dir="ltr" className="text-left" maxLength={20} value={phone} onChange={(event) => { setPhone(event.target.value); setMembershipPreview(null); setUseMembership(false); }} placeholder="0912…" /></Field>
          <Field label="یادداشت سفارش" hint="این توضیح همراه سفارش برای آشپزخانه چاپ/نمایش می‌شود."><Textarea rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثلاً بدون پیاز یا سس جداگانه" /></Field>
        </div>
      </Modal>
      <Modal open={workflowOpen} onClose={() => setWorkflowOpen(false)} title="مراحل سفارش" size="sm">
        <div className="space-y-3">
          <p className="text-xs leading-6 text-stone-500">تعداد مرحله‌ها فقط شکل نمایش گردش سفارش را ساده یا جزئی می‌کند؛ وضعیت واقعی، سابقهٔ سفارش و دکمه‌های انجام کار تغییر نمی‌کنند.</p>
          {([4, 3, 2, 1] as const).map((value) => <button key={value} type="button" disabled={!f.isManager || workflowSaving} onClick={() => void saveWorkflowPreset(value)} className={cn("w-full rounded-xl border p-3 text-start transition", workflowPreset === value ? "border-brand-400 bg-brand-50" : "border-stone-200 hover:border-brand-300", (!f.isManager || workflowSaving) && "cursor-not-allowed opacity-70")}>
            <span className="flex items-center justify-between"><b className="text-sm">{toFa(value)} مرحله</b><span className="text-xs text-stone-500">{workflowPreset === value ? "انتخاب‌شده" : f.isManager ? "انتخاب و ذخیره" : "فقط مدیر می‌تواند تغییر دهد"}</span></span>
            <span className="mt-2 flex flex-wrap items-center gap-1.5">{ORDER_STAGE_LABELS[value].map((label, index) => <span key={label} className="inline-flex items-center gap-1.5 text-xs"><span className="rounded-full bg-white px-2 py-1 ring-1 ring-stone-200">{label}</span>{index < ORDER_STAGE_LABELS[value].length - 1 && <Icon name="chevronLeft" className="size-3 text-stone-400" />}</span>)}</span>
          </button>)}
        </div>
      </Modal>
      <Modal open={tablePicker} onClose={closeTablePicker} title="انتخاب میز و نوع سفارش" size="lg">
          <section className="space-y-4">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-stone-700">میزهای سالن</h2>
              {canManageTables && <Button size="sm" variant="secondary" onClick={() => { closeTablePicker(); setSheet(false); setTmOpen(true); }}><Icon name="edit" className="size-4" /> مدیریت میزها</Button>}
            </div>
            <IconText>{loading ? (
              <div className="flex gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="min-h-24 w-full rounded-xl" />)}</div>
            ) : tables.items.length === 0 ? (
              <EmptyState emoji="" title="هنوز میزی تعریف نشده" description="برای سفارش‌گیری سالن ابتدا میزها را اضافه کنید یا از گزینه بیرون‌بر استفاده کنید." action={canManageTables ? <Button size="sm" onClick={() => { closeTablePicker(); setSheet(false); setTmOpen(true); }}>افزودن میز</Button> : undefined} />
            ) : null}</IconText>
            <Input placeholder="جستجوی نام میز…" aria-label="جستجوی میز" value={tableQuery} onChange={(e) => setTableQuery(e.target.value)} />
            <div className="grid max-h-[55dvh] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3">
              <button
                onClick={() => selectTable("takeaway")}
                aria-pressed={tableId === "takeaway"}
                className={cn("flex min-h-24 w-full flex-col items-center justify-center rounded-xl text-sm font-semibold ring-1 transition", tableId === "takeaway" ? "bg-brand-500 text-white ring-brand-500 shadow-md" : "bg-white ring-stone-200 hover:ring-brand-300")}
              >
                <span className="text-lg"><IconText>{<EmojiIcon emoji="" />}</IconText></span>بیرون‌بر
              </button>
              <IconText>{mode === "cashier" && f.has("delivery_order") && (
                <button
                  onClick={() => selectTable("delivery")}
                  aria-pressed={tableId === "delivery"}
                  className={cn("flex min-h-24 w-full flex-col items-center justify-center rounded-xl text-sm font-semibold ring-1 transition", tableId === "delivery" ? "bg-brand-500 text-white ring-brand-500 shadow-md" : "bg-white ring-stone-200 hover:ring-brand-300")}
                >
                  <span className="text-lg">{<EmojiIcon emoji="" />}</span>دلیوری
                </button>
              )}</IconText>
              {tables.items.filter((t) => t.name.includes(tableQuery.trim())).map((t) => {
                const busy = !!t.openOrder;
                const blocked = t.status === "cleaning" || t.status === "out_of_service" || t.status === "reserved";
                const sel = tableId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => selectTable(t.id)}
                    aria-pressed={tableId === t.id}
                    disabled={blocked}
                    className={cn(
                      "relative flex min-h-24 w-full flex-col items-center justify-center rounded-xl text-sm font-semibold ring-1 transition",
                      sel ? "bg-brand-500 text-white ring-brand-500 shadow-md" : blocked ? "cursor-not-allowed bg-stone-100 text-stone-400 ring-stone-200" : busy ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-white ring-stone-200 hover:ring-brand-300",
                    )}
                  >
                    <span>{t.name}</span>
                    <span className={cn("text-[10px] font-normal", sel ? "text-white/80" : busy ? "text-amber-700" : "text-stone-400")}>
                      {blocked ? ({ reserved: "رزرو شده", cleaning: "در حال نظافت", out_of_service: "خارج از سرویس" } as Record<string, string>)[t.status] : busy ? statusInfo(t.openOrder!.status).short : `${toFa(t.capacity)} نفره`}
                    </span>
                    <span className={cn("absolute end-2 top-2 size-2 rounded-full", blocked ? "bg-rose-400" : busy ? "bg-amber-500" : "bg-emerald-500")} />
                  </button>
                );
              })}
            </div>
          </section>

      </Modal>
      <TableManager open={tmOpen} onClose={() => setTmOpen(false)} tables={tables} onRemoved={(id) => setTableId((cur) => (cur === id ? null : cur))} />
      <Modal open={mapOpen} onClose={() => setMapOpen(false)} title="محل تحویل روی نقشه" size="lg" footer={<><Button variant="ghost" onClick={() => { setPin(null); setMapOpen(false); }}>حذف موقعیت</Button><Button onClick={() => setMapOpen(false)}>تأیید</Button></>}>
        <MapPicker value={pin} height={380} onChange={(lat, lng) => setPin({ lat, lng })} onAddress={(a) => setAddress((cur) => cur.trim() ? cur : a)} origin={bizLoc} radii={zones.map((z) => z.radiusKm).filter((r) => r > 0)} />
      </Modal>
      {optionProduct && <ProductOptionPicker product={optionProduct} scaleReadings={scaleReadings} onClose={() => setOptionProduct(null)} onConfirm={(selection) => { addVariant(optionProduct, selection.optionIds, 1, selection.weightGrams, selection.tareGrams); setOptionProduct(null); }} />}
    </div>
  );
}
