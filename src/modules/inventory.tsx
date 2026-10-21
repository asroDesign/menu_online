"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, useCollection } from "@/lib/api";
import { formatDate, formatNumber, formatPrice, toFa } from "@/lib/format";
import { ResourcePage } from "@/components/resource-page";
import { StockReceiptEditor, type SavedReceipt } from "@/components/stock-receipt-editor";
import { useFeatures } from "@/components/features";
import { ProductRecipeEditor } from "@/components/product-recipe-editor";
import type { Product } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, PageHeader, Select, Skeleton, cn, useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";
import { calculateTargetPrice, type PriceTargetType } from "@/lib/price-target-core";
import { csvCell } from "@/lib/csv";
import { inventoryStatus } from "@/lib/inventory-status";
import { wasteReasonLabel } from "@/lib/stock-waste";

type Item = { id: number; name: string; sku?: string | null; unit: string; recipeUnit?: string; recipeToStockFactor?: number; stock: number; minStock: number; reorderPoint?: number; trackStock: boolean; isActive?: boolean; costPerUnit: number; lastPurchaseCost?: number; expiryDate?: string | null; warehouseId: number | null; categoryId?: number | null };
type Wh = { id: number; name: string; location: string };
type InventoryCategory = { id: number; name: string };
const q = (n: number) => toFa(Math.round(n * 100) / 100);
const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

export function Inventory() {
  const [receiptType, setReceiptType] = useState<string | null>(null);
  const [quickItem, setQuickItem] = useState<Item | null>(null);
  const [version, setVersion] = useState(0);
  const { has } = useFeatures();
  const wh = useCollection<Wh>("/api/r/warehouses");
  const categories = useCollection<InventoryCategory>("/api/r/inventory-categories");
  const movements = useCollection<Mv>("/api/r/stock");
  const toast = useToast();
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [grouped, setGrouped] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  async function addWh() {
    if (!name.trim()) return;
    try { await wh.create({ name: name.trim() }, { name: name.trim(), location: "" }); setName(""); } catch (e) { toast((e as Error).message, "error"); }
  }
  const openReceipt = (type = "in", item: Item | null = null) => { setQuickItem(item); setReceiptType(type); };
  const clearFilters = () => { setTerm(""); setWarehouseFilter("all"); setCategoryFilter("all"); setStockFilter("all"); setSortBy("name"); };
  async function addCategory() {
    const clean = categoryName.trim();
    if (!clean || categoryBusy) return;
    setCategoryBusy(true);
    try { await api("/api/r/inventory-categories", { method: "POST", body: { name: clean } }); await categories.reload(true); setCategoryName(""); setVersion((value) => value + 1); toast("دسته‌بندی مواد اولیه ثبت شد"); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setCategoryBusy(false); }
  }
  const categoryNameOf = (item: Item) => categories.items.find((category) => category.id === item.categoryId)?.name ?? "بدون دسته‌بندی";
  const warehouseNameOf = (item: Item) => wh.items.find((warehouse) => warehouse.id === item.warehouseId)?.name ?? "بدون انبار";
  const lowItems = (items: Item[]) => items.filter((item) => item.isActive !== false && item.trackStock && item.stock <= item.minStock);
  function exportCsv(items: Item[]) {
    const rows = [
      ["نام کالا", "کد کالا", "دسته", "انبار", "موجودی", "واحد", "حداقل موجودی", "نقطه سفارش", "بهای واحد (تومان)", "آخرین خرید (تومان)", "ارزش موجودی (تومان)", "تاریخ انقضا", "وضعیت"],
      ...items.map((item) => [item.name, item.sku ?? "", categoryNameOf(item), warehouseNameOf(item), item.stock, item.unit, item.minStock, item.reorderPoint ?? 0, item.costPerUnit, item.lastPurchaseCost ?? 0, Math.max(0, item.stock) * item.costPerUnit, item.expiryDate ?? "", item.isActive === false ? "غیرفعال" : !item.trackStock ? "ردیابی فروش خاموش" : ({ out: "اتمام", low: "کمبود", available: "موجود" } as const)[inventoryStatus(item.stock, item.minStock)]]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const reportDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `inventory-${reportDate}.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <ResourcePage<Item>
      key={version}
      title="انبارداری"
      subtitle="موجودی، کمبودها و گردش مواد اولیه را در یک نمای عملیاتی مدیریت کنید"
      endpoint="/api/r/items"
      emoji=""
      emptyTitle="انبار خالی است"
      emptyDesc="کالا را تعریف کنید یا در یک فاکتور، چند کالای جدید را همراه با موجودی خرید ثبت کنید."
      pageSize={25}
      actions={<div className="flex flex-wrap gap-2">
        {has("inventory") && <Link href="/dashboard/inventory/add" className="btn btn-primary btn-sm">افزودن کالا در صفحه جدید</Link>}
        {has("inventory") && <Button size="sm" variant="secondary" onClick={() => setCategoryModal(true)}><Icon name="layers" className="size-4" />دسته‌بندی‌ها</Button>}
        {has("stock_movements") && <><Link href="/dashboard/inventory/waste" className="btn btn-secondary btn-sm"><Icon name="warning" className="size-4" />مدیریت ضایعات</Link><Button size="sm" onClick={() => openReceipt("in")}><Icon name="plus" className="size-4" />ثبت فاکتور خرید</Button></>}
        {has("stock_movements") && <Link href="/dashboard/stock-movements#stock-transfer-panel" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-semibold text-base-content ring-1 ring-base-300 hover:bg-base-200"><Icon name="layers" className="size-4" />انتقال بین انبارها</Link>}
        {has("purchase_suggestions") && <Link href="/dashboard/purchase-suggestions" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-semibold text-base-content ring-1 ring-base-300 hover:bg-base-200"><Icon name="cart" className="size-4" />پیشنهاد خرید</Link>}
      </div>}
      footer={<>
        {receiptType && <StockReceiptEditor key={`${receiptType}-${quickItem?.id ?? "new"}`} initialType={receiptType} initialItem={quickItem ?? undefined} onClose={() => { setReceiptType(null); setQuickItem(null); }} onSaved={() => { setReceiptType(null); setQuickItem(null); setVersion((v) => v + 1); void movements.reload(true); }} />}
        <Modal open={categoryModal} onClose={() => setCategoryModal(false)} title="دسته‌بندی مواد اولیه" footer={<><Button variant="ghost" onClick={() => setCategoryModal(false)}>بستن</Button><Button loading={categoryBusy} disabled={!categoryName.trim()} onClick={() => void addCategory()}>ثبت دسته</Button></>}>
          <div className="space-y-4"><p className="text-sm leading-6 text-base-content/60">برای گروه‌بندی موجودی‌ها، دسته‌های مستقل انبار تعریف کنید. حذف دسته، کالاها را حذف نمی‌کند و آن‌ها را بدون دسته نگه می‌دارد.</p><Field label="نام دسته"><Input autoFocus value={categoryName} maxLength={60} onChange={(event) => setCategoryName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addCategory()} placeholder="مثلاً لبنیات" /></Field><div className="max-h-64 divide-y divide-base-300 overflow-y-auto rounded-xl border border-base-300">{categories.loading ? <Skeleton className="m-3 h-10" /> : categories.items.length === 0 ? <p className="p-4 text-center text-sm text-base-content/55">هنوز دسته‌ای تعریف نشده است.</p> : categories.items.map((category) => <div key={category.id} className="flex items-center justify-between gap-3 p-3"><span>{category.name}</span><IconButton icon="trash" label={`حذف دسته ${category.name}`} onClick={() => categories.remove(category.id).then(() => { if (categoryFilter === String(category.id)) setCategoryFilter("all"); setVersion((value) => value + 1); toast("دسته حذف شد؛ کالاهای آن حفظ شدند"); }).catch((error) => toast((error as Error).message, "error"))} /></div>)}</div></div>
        </Modal>
      </>}
      search={(r, t) => [r.name, r.sku ?? "", r.unit, r.recipeUnit ?? "", categoryNameOf(r), warehouseNameOf(r)].some((value) => value.toLocaleLowerCase().includes(t.toLocaleLowerCase()))}
      searchControl={{ value: term, onChange: setTerm, placeholder: "جستجوی کالا، دسته یا انبار…" }}
      hideSearchInput
      rowFilter={(item) => (warehouseFilter === "all" || String(item.warehouseId ?? "none") === warehouseFilter)
        && (categoryFilter === "all" || String(item.categoryId ?? "none") === categoryFilter)
        && (stockFilter === "all" || (stockFilter === "empty" ? item.isActive !== false && item.trackStock && inventoryStatus(item.stock, item.minStock) === "out" : stockFilter === "low" ? item.isActive !== false && item.trackStock && inventoryStatus(item.stock, item.minStock) === "low" : !item.trackStock || inventoryStatus(item.stock, item.minStock) === "available"))}
      sortResults={(a, b) => sortBy === "stock-asc" ? a.stock - b.stock || a.name.localeCompare(b.name, "fa") : sortBy === "stock-desc" ? b.stock - a.stock || a.name.localeCompare(b.name, "fa") : sortBy === "value-desc" ? b.stock * b.costPerUnit - a.stock * a.costPerUnit : a.name.localeCompare(b.name, "fa")}
      groupRows={grouped ? (rows) => {
        const groups = new Map<string, Item[]>();
        for (const item of rows) { const label = categoryNameOf(item); groups.set(label, [...(groups.get(label) ?? []), item]); }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "fa")).map(([label, groupItems]) => ({ key: label, label, items: groupItems }));
      } : undefined}
      rowActions={has("stock_movements") ? (item) => <><IconButton icon="plus" label={`ثبت ورود ${item.name}`} onClick={() => openReceipt("in", item)} /><IconButton icon="minus" label={`ثبت خروج ${item.name}`} onClick={() => openReceipt("out", item)} /></> : undefined}
      fields={[
        { key: "name", label: "نام ماده / کالا", required: true },
        { key: "sku", label: "کد کالا / SKU", placeholder: "اختیاری" },
        { key: "unit", label: "واحد انبار", type: "select", options: ["کیلوگرم", "گرم", "لیتر", "میلی‌لیتر", "عدد", "بسته", "کارتن", "متر"].map((x) => ({ value: x, label: x })) },
        { key: "recipeUnit", label: "واحد مصرف در دستور تهیه", type: "select", options: ["کیلوگرم", "گرم", "لیتر", "میلی‌لیتر", "عدد", "بسته", "کارتن", "متر"].map((x) => ({ value: x, label: x })) },
        { key: "recipeToStockFactor", label: "ضریب تبدیل مصرف به واحد انبار", type: "number", required: true, hint: "مثلاً برای خرید کیلوگرم و مصرف گرم، ۰٫۰۰۱" },
        { key: "warehouseId", label: "انبار", remote: { url: "/api/r/warehouses", label: (r: Wh) => r.name, none: "بدون انبار" } },
        { key: "categoryId", label: "دسته‌بندی", remote: { url: "/api/r/inventory-categories", label: (r: InventoryCategory) => r.name, none: "بدون دسته‌بندی" } },
        { key: "minStock", label: "حداقل موجودی (هشدار)", type: "number", initial: "0" },
        { key: "reorderPoint", label: "نقطه سفارش مجدد", type: "number", initial: "0" },
        { key: "costPerUnit", label: "بهای واحد میانگین (تومان)", type: "money" },
        { key: "lastPurchaseCost", label: "آخرین بهای خرید (تومان)", type: "money" },
        { key: "trackStock", label: "ردیابی خودکار مصرف فروش", type: "bool", initial: true, hint: "خاموش بودن این گزینه مصرف فروش را از موجودی کم نمی‌کند؛ گردش دستی و شمارش همچنان فعال است." },
        { key: "isActive", label: "قلم فعال", type: "bool", initial: true },
      ]}
      columns={[
        { label: "ماده / دسته", render: (r) => <div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-400">{categoryNameOf(r)} · {warehouseNameOf(r)}{r.sku ? ` · ${r.sku}` : ""}</p>{r.expiryDate && <p className="mt-0.5 text-[11px] text-amber-700">انقضا: {formatDate(r.expiryDate)}</p>}</div> },
        { label: "موجودی", render: (r) => { const status = inventoryStatus(r.stock, r.minStock); return <span className={cn("font-bold", r.isActive === false ? "text-stone-400" : r.trackStock && status !== "available" && "text-rose-600")}>{q(r.stock)} {r.unit} {r.isActive === false ? <Badge>غیرفعال</Badge> : !r.trackStock ? <Badge>ردیابی فروش خاموش</Badge> : status === "out" ? <Badge color="rose">تمام‌شده</Badge> : status === "low" ? <Badge color="amber">نیازمند سفارش</Badge> : <Badge color="emerald">موجود</Badge>}</span>; } },
        { label: "حداقل / سفارش", render: (r) => <span>{q(r.minStock)} / {q(r.reorderPoint ?? 0)} {r.unit}</span> },
        { label: "قیمت واحد", render: (r) => formatPrice(r.costPerUnit) },
        { label: "ارزش", render: (r) => formatPrice(Math.max(0, r.stock) * r.costPerUnit) },
      ]}
      header={({ items }) => (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4"><p className="text-xs text-base-content/55">تعداد اقلام</p><p className="mt-1 text-xl font-extrabold">{formatNumber(items.length)}</p><p className="mt-1 text-[11px] text-base-content/45">در همهٔ انبارها</p></Card>
            <Card className="p-4"><p className="text-xs text-base-content/55">اتمام موجودی</p><p className="mt-1 text-xl font-extrabold text-rose-700">{formatNumber(items.filter((item) => item.isActive !== false && item.trackStock && item.stock <= 0).length)} قلم</p><button className="mt-1 text-[11px] font-semibold text-rose-700" onClick={() => setStockFilter("empty")}>نمایش اقلام تمام‌شده</button></Card>
            <Card className="p-4"><p className="text-xs text-base-content/55">نیازمند سفارش</p><p className="mt-1 text-xl font-extrabold text-amber-700">{formatNumber(lowItems(items).filter((item) => item.stock > 0).length)} قلم</p><button className="mt-1 text-[11px] font-semibold text-amber-700" onClick={() => setStockFilter("low")}>موجودی در نقطهٔ سفارش</button></Card>
            <Card className="p-4"><p className="text-xs text-base-content/55">ارزش موجودی</p><p className="mt-1 text-xl font-extrabold">{formatPrice(items.reduce((sum, item) => sum + Math.max(0, item.stock) * item.costPerUnit, 0))}</p><p className="mt-1 text-[11px] text-base-content/45">بر مبنای بهای ثبت‌شده</p></Card>
          </div>
          <Card className="mb-4 p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold"><Icon name="filter" className="me-1.5 inline size-4 text-brand-700" />فیلتر و نمایش موجودی</p><div className="flex gap-2"><Button size="sm" variant={grouped ? "primary" : "secondary"} onClick={() => setGrouped((value) => !value)}><Icon name="layers" className="size-4" />{grouped ? "نمای فهرست" : "گروه‌بندی دسته‌ها"}</Button><Button size="sm" variant="ghost" onClick={clearFilters}><Icon name="refresh" className="size-4" />پاک‌کردن فیلترها</Button></div></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <Field label="جستجو"><div className="relative"><Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-base-content/45" /><Input className="ps-9" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="کالا، دسته یا انبار…" /></div></Field>
              <Field label="انبار"><Select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}><option value="all">همهٔ انبارها</option><option value="none">بدون انبار</option>{wh.items.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</Select></Field>
              <Field label="دسته"><Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">همهٔ دسته‌ها</option><option value="none">بدون دسته‌بندی</option>{categories.items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
              <Field label="وضعیت موجودی"><Select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}><option value="all">همهٔ وضعیت‌ها</option><option value="empty">اتمام موجودی</option><option value="low">در نقطهٔ سفارش</option><option value="ok">موجودی کافی</option></Select></Field>
              <Field label="مرتب‌سازی"><Select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="name">نام کالا</option><option value="stock-asc">کمترین موجودی</option><option value="stock-desc">بیشترین موجودی</option><option value="value-desc">بیشترین ارزش موجودی</option></Select></Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-base-300 pt-3"><Button size="sm" variant="secondary" onClick={() => exportCsv(items)}><Icon name="download" className="size-4" />خروجی CSV کامل</Button><Button size="sm" variant="secondary" onClick={() => window.print()}><Icon name="print" className="size-4" />چاپ</Button></div>
          </Card>
          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-base-300 p-3"><h3 className="flex items-center gap-2 text-sm font-bold"><Icon name="warning" className="size-4 text-rose-600" />هشدارهای فوری</h3><span className="text-xs text-base-content/55">{formatNumber(lowItems(items).length)} مورد</span></div>{lowItems(items).length === 0 ? <p className="p-4 text-sm text-emerald-700">کمبود موجودی ثبت نشده است.</p> : <div className="divide-y divide-base-300">{lowItems(items).slice(0, 4).map((item) => <div key={item.id} className="flex items-center gap-3 p-3"><span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", item.stock <= 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}><Icon name={item.stock <= 0 ? "circleX" : "warning"} className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.name}</p><p className="text-xs text-base-content/55">{q(item.stock)} از حد سفارش {q(item.minStock)} {item.unit} · {warehouseNameOf(item)}</p></div>{has("stock_movements") && <Button size="sm" variant="secondary" onClick={() => openReceipt("in", item)}>ثبت خرید</Button>}</div>)}</div>}</Card>
            <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-base-300 p-3"><h3 className="flex items-center gap-2 text-sm font-bold"><Icon name="activity" className="size-4 text-brand-700" />آخرین گردش‌ها</h3><Link href="/dashboard/stock-movements" className="text-xs font-semibold text-brand-700">مشاهدهٔ همه</Link></div>{movements.loading ? <Skeleton className="m-3 h-20" /> : movements.error ? <div className="p-3"><ErrorState message={movements.error} onRetry={() => movements.reload()} /></div> : movements.items.length === 0 ? <p className="p-4 text-sm text-base-content/55">هنوز گردش انباری ثبت نشده است.</p> : <div className="divide-y divide-base-300">{movements.items.slice(0, 4).map((movement) => <div key={movement.id} className="flex items-center gap-3 p-3"><span className="min-w-0 flex-1"><b className="block truncate text-sm">{movement.itemName}</b><small className="text-base-content/50">{MV[movement.type]?.[0] ?? movement.type} · {formatDate(movement.createdAt)}</small></span><b dir="ltr" className={cn("text-xs", movement.delta >= 0 ? "text-emerald-700" : "text-rose-700")}>{movement.delta >= 0 ? "+" : "−"}{q(Math.abs(movement.delta))} {movement.unit}</b></div>)}</div>}</Card>
          </div>
          <Card className="mb-5 p-3 sm:p-4">
            <p className="mb-3 text-sm font-bold"><Icon name="box" className="me-1.5 inline size-4 text-brand-700" />انبارها</p>
            <div className="flex flex-wrap items-center gap-2">
              {wh.items.map((w) => <span key={w.id} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-1 pe-1 ps-3 text-sm">{w.name}<button aria-label="حذف" className="flex size-6 items-center justify-center rounded-full text-stone-400 hover:bg-rose-100 hover:text-rose-600" onClick={() => wh.remove(w.id).catch((e) => toast(e.message, "error"))}><Icon name="x" className="size-3.5" /></button></span>)}
              <Input className="h-9 w-40" placeholder="انبار جدید…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addWh()} />
              <Button size="sm" variant="secondary" onClick={addWh}>افزودن</Button>
            </div>
          </Card>
        </>
      )}
    />
  );
}

type Mv = { id: number; itemId: number; itemName: string; unit: string; type: string; delta: number; balanceAfter: number; note: string; createdAt: string; supplierName?: string | null; invoiceNo?: string; receiptId?: number | null; documentId?: number | null; receiptTotal?: number | null; wasteReason?: string | null };
const MV: Record<string, [string, string]> = { in: ["ورود (خرید)", "emerald"], out: ["خروج / مصرف", "amber"], waste: ["ضایعات", "rose"], adjust: ["تعدیل", "blue"], sale: ["مصرف فروش", "violet"] };

export function StockMovements() {
  const mv = useCollection<Mv>("/api/r/stock");
  const items = useCollection<Item>("/api/r/items");
  const toast = useToast();
  const { isManager, role } = useFeatures();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedReceipt | null>(null);
  const rows = mv.items.filter((m) => filter === "all" || m.type === filter);
  return (
    <div className="animate-fade-in">
      <PageHeader title="فاکتور و گردش انبار" subtitle="خرید چندقلمی، خروج، ضایعات و اصلاح موجودی با ثبت خودکار سند حسابداری" actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => document.getElementById("stock-transfer-panel")?.scrollIntoView({ behavior: "smooth" })}><Icon name="layers" className="size-4" />انتقال بین انبارها</Button><Button onClick={() => setOpen(true)}><Icon name="plus" className="size-4" /> ثبت فاکتور / گردش</Button></div>} />
      {saved && <div className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">رسید انبار #{toFa(saved.id)} ثبت شد · {formatPrice(saved.total)}{saved.documentId && <a className="ms-3 font-bold underline" href={`/print/doc/${saved.documentId}`} target="_blank" rel="noreferrer">مشاهده سند حسابداری</a>}</div>}
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">{[["all", "همه"], ...Object.entries(MV).map(([k, v]) => [k, v[0]])].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={cn("shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium", filter === k ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200")}>{l}</button>)}</div>
      <IconText>{mv.loading ? <Skeleton className="h-64 rounded-2xl" /> : mv.error ? <ErrorState message={mv.error} onRetry={() => mv.reload()} /> : rows.length === 0 ? <EmptyState emoji="" title="گردشی ثبت نشده" description="ورود کالا از خرید، مصرف و ضایعات را اینجا ثبت کنید. مصرف فروش خودکار ثبت می‌شود." /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b bg-stone-50/70 text-xs text-stone-500"><th className="p-3 text-start">زمان</th><th className="p-3 text-start">ماده</th><th className="p-3 text-start">نوع</th><th className="p-3 text-start">مقدار</th><th className="p-3 text-start">موجودی پس از</th><th className="p-3 text-start">فاکتور / سند</th><th className="p-3 text-start">شرح</th></tr></thead><tbody className="divide-y divide-stone-100">{rows.map((m) => <tr key={m.id}><td className="p-3 text-xs text-stone-500">{formatDate(m.createdAt)}</td><td className="p-3 font-semibold">{m.itemName}</td><td className="p-3"><Badge color={MV[m.type]?.[1]}>{MV[m.type]?.[0]}</Badge></td><td className="p-3 font-bold" dir="ltr"><span className={m.delta >= 0 ? "text-emerald-600" : "text-rose-600"}>{m.delta >= 0 ? "+" : "-"}{q(Math.abs(m.delta))} {m.unit}</span></td><td className="p-3">{q(m.balanceAfter)} {m.unit}</td><td className="p-3 text-xs">{m.receiptId ? <div className="space-y-1"><p>رسید #{toFa(m.receiptId)}</p>{m.receiptTotal != null && <p className="text-stone-500">جمع فاکتور: {formatPrice(m.receiptTotal)}</p>}{m.documentId && <a className="font-semibold text-emerald-700 underline" href={`/print/doc/${m.documentId}`} target="_blank" rel="noreferrer">سند حسابداری</a>}</div> : "—"}</td><td className="p-3 text-xs text-stone-500">{m.supplierName && <b className="me-1 text-stone-700">{m.supplierName}</b>}{m.invoiceNo && <span className="me-1">(فاکتور {m.invoiceNo})</span>}{m.type === "waste" && <b className="me-1 text-rose-700">{wasteReasonLabel(m.wasteReason)}</b>}{m.note}</td></tr>)}</tbody></table></Card>
      )}</IconText>
      {open && <StockReceiptEditor onClose={() => setOpen(false)} onSaved={(receipt) => { setSaved(receipt); setOpen(false); mv.reload(true); items.reload(true); }} />}
      <StockTransferPanel canRequest={isManager || role === "warehouse"} canDecide={isManager} />
    </div>
  );
}

type TransferLine = { sourceItemId: number; destinationItemId: number; quantity: number };
type Transfer = { id: number; status: "pending" | "approved" | "rejected"; note: string; createdAt: string; lines: (TransferLine & { id: number; source?: { name: string; unit: string }; destination?: { name: string; unit: string } })[] };
function StockTransferPanel({ canRequest, canDecide }: { canRequest: boolean; canDecide: boolean }) {
  const items = useCollection<Item>("/api/r/items");
  const transfers = useCollection<Transfer>("/api/stock-transfers");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState([{ sourceItemId: "", destinationItemId: "", quantity: "" }]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const eligible = (sourceId: string) => {
    const source = items.items.find((item) => String(item.id) === sourceId);
    return source ? items.items.filter((item) => item.id !== source.id && item.warehouseId !== source.warehouseId && item.warehouseId !== null && item.name.trim().toLocaleLowerCase() === source.name.trim().toLocaleLowerCase() && item.unit === source.unit) : [];
  };
  async function submit() {
    const clean = lines.map((line) => ({ sourceItemId: Number(line.sourceItemId), destinationItemId: Number(line.destinationItemId), quantity: Number(faToEn(line.quantity)) }));
    if (!clean.length || clean.some((line) => !line.sourceItemId || !line.destinationItemId || !(line.quantity > 0))) return toast("مبدأ، مقصد و مقدار همه اقلام را کامل کنید.", "error");
    setBusy(true);
    try { await api("/api/stock-transfers", { method: "POST", body: { requestKey: crypto.randomUUID(), lines: clean, note } }); setOpen(false); setLines([{ sourceItemId: "", destinationItemId: "", quantity: "" }]); setNote(""); await transfers.reload(true); toast("درخواست انتقال ثبت شد و پس از تأیید مدیر اعمال می‌شود."); }
    catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }
  async function decide(id: number, action: "approve" | "reject") {
    try { await api("/api/stock-transfers", { method: "PATCH", body: { id, action } }); await Promise.all([transfers.reload(true), items.reload(true)]); toast(action === "approve" ? "انتقال تأیید و موجودی دو انبار به‌روزرسانی شد." : "درخواست انتقال رد شد."); }
    catch (cause) { toast((cause as Error).message, "error"); }
  }
  const statusLabel = { pending: "در انتظار تأیید", approved: "تأییدشده", rejected: "ردشده" };
  return <div id="stock-transfer-panel"><Card className="mt-6 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-4"><div><h2 className="font-bold">انتقال بین انبارها</h2><p className="mt-1 text-xs text-base-content/60">درخواست چندقلمی؛ تأیید، موجودی مبدأ و مقصد را در یک تراکنش تغییر می‌دهد.</p></div>{canRequest && <Button size="sm" onClick={() => setOpen(true)}><Icon name="plus" className="size-4"/>درخواست انتقال</Button>}</div>
    {transfers.loading ? <Skeleton className="m-4 h-24"/> : transfers.error ? <div className="p-4"><ErrorState message={transfers.error} onRetry={() => transfers.reload()}/></div> : transfers.items.length === 0 ? <p className="p-6 text-center text-sm text-base-content/55">درخواستی برای انتقال ثبت نشده است.</p> : <div className="divide-y divide-base-300">{transfers.items.map((transfer) => <article key={transfer.id} className="flex flex-wrap items-start gap-3 p-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b>انتقال #{toFa(transfer.id)}</b><Badge color={transfer.status === "approved" ? "emerald" : transfer.status === "rejected" ? "rose" : "amber"}>{statusLabel[transfer.status]}</Badge><span className="text-xs text-base-content/50">{formatDate(transfer.createdAt)}</span></div><ul className="mt-2 space-y-1 text-sm text-base-content/70">{transfer.lines.map((line) => <li key={line.id}>{line.source?.name ?? "قلم"} · انبار مبدأ #{toFa(line.sourceItemId)} → انبار مقصد #{toFa(line.destinationItemId)} · {q(line.quantity)} {line.source?.unit}</li>)}</ul>{transfer.note && <p className="mt-2 text-xs text-base-content/55">{transfer.note}</p>}</div>{canDecide && transfer.status === "pending" && <div className="flex gap-2"><Button size="sm" onClick={() => void decide(transfer.id, "approve")}>تأیید و اعمال</Button><Button size="sm" variant="secondary" onClick={() => void decide(transfer.id, "reject")}>رد</Button></div>}</article>)}</div>}
    <Modal open={open} onClose={() => setOpen(false)} title="درخواست انتقال بین انبارها" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button><Button loading={busy} onClick={() => void submit()}>ثبت درخواست</Button></>}>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">{lines.map((line, index) => <div key={index} className="grid gap-3 rounded-xl bg-base-200/50 p-3 sm:grid-cols-2"><Field label="قلم در انبار مبدأ"><Select value={line.sourceItemId} onChange={(event) => setLines((current) => current.map((row, i) => i === index ? { ...row, sourceItemId: event.target.value, destinationItemId: "" } : row))}><option value="">انتخاب کنید</option>{items.items.filter((item) => item.warehouseId !== null).map((item) => <option key={item.id} value={item.id}>{item.name} · {q(item.stock)} {item.unit}</option>)}</Select></Field><Field label="قلم هم‌نام در مقصد"><Select value={line.destinationItemId} onChange={(event) => setLines((current) => current.map((row, i) => i === index ? { ...row, destinationItemId: event.target.value } : row))}><option value="">انتخاب کنید</option>{eligible(line.sourceItemId).map((item) => <option key={item.id} value={item.id}>{item.name} · انبار #{toFa(item.warehouseId ?? 0)}</option>)}</Select></Field><Field label="مقدار"><Input inputMode="decimal" value={line.quantity} onChange={(event) => setLines((current) => current.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))}/></Field>{lines.length > 1 && <div className="flex items-end"><Button variant="ghost" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>حذف ردیف</Button></div>}</div>)}<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setLines((current) => [...current, { sourceItemId: "", destinationItemId: "", quantity: "" }])}><Icon name="plus" className="size-4"/>افزودن قلم</Button></div><Field label="یادداشت (اختیاری)"><Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)}/></Field></div>
    </Modal>
  </Card></div>;
}

export function StockControl() {
  const items = useCollection<Item>("/api/r/items");
  const toast = useToast();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const short = items.items.filter((i) => i.isActive !== false && i.trackStock && i.stock <= i.minStock);
  async function count(i: Item) {
    const v = Number(faToEn(counts[i.id] ?? ""));
    if (!Number.isFinite(v) || counts[i.id] === "" || counts[i.id] === undefined) return;
    setBusy(i.id);
    try { await api("/api/r/stockcount", { method: "POST", body: { itemId: i.id, counted: v } }); setCounts((c) => { const n = { ...c }; delete n[i.id]; return n; }); items.reload(true); toast("شمارش ثبت و موجودی اصلاح شد"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(null); }
  }
  return (
    <div className="animate-fade-in">
      <PageHeader title="کنترل انبار" subtitle="شناسایی کمبود کالا و شمارش و تطبیق موجودی واقعی با سیستم" />
      <IconText>{items.loading ? <Skeleton className="h-64 rounded-2xl" /> : items.error ? <ErrorState message={items.error} /> : items.items.length === 0 ? <EmptyState emoji="" title="کالایی برای کنترل نیست" description="ابتدا از بخش انبارداری اقلام را تعریف کنید." /> : (
        <div className="space-y-6">
          <Card className={cn("p-5", short.length ? "bg-rose-50 ring-rose-200" : "bg-emerald-50 ring-emerald-200")}>
            <h3 className="font-bold">{short.length ? ` ${toFa(short.length)} قلم زیر حداقل موجودی است` : " موجودی همه‌ی اقلام در وضعیت مطلوب است"}</h3>
            {short.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{short.map((i) => { const reorderPoint = i.reorderPoint ?? 0; const target = reorderPoint > 0 ? reorderPoint : i.minStock * 2; const suggested = Math.max(0, target - i.stock); return <div key={i.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-rose-100"><p className="font-bold">{i.name}</p><p className="mt-1 text-xs text-stone-500">موجودی {q(i.stock)} {i.unit} · حداقل {q(i.minStock)} · نقطه سفارش {q(reorderPoint)}</p><p className="mt-1 text-xs font-semibold text-rose-600">پیشنهاد خرید: {q(suggested)} {i.unit} (≈ {formatPrice(suggested * i.costPerUnit)})</p></div>; })}</div>}
          </Card>
          <Card className="overflow-x-auto">
            <div className="border-b border-stone-100 p-4 font-bold">شمارش و تطبیق موجودی</div>
            <table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-stone-50/70 text-xs text-stone-500"><th className="p-3 text-start">ماده</th><th className="p-3 text-start">موجودی سیستم</th><th className="p-3 text-start">شمارش واقعی</th><th className="p-3 text-start">اختلاف</th><th className="p-3" /></tr></thead><tbody className="divide-y divide-stone-100">{items.items.map((i) => {
              const raw = counts[i.id]; const v = raw === undefined || raw === "" ? null : Number(faToEn(raw)); const diff = v === null || !Number.isFinite(v) ? null : v - i.stock;
              return <tr key={i.id}><td className="p-3 font-semibold">{i.name}</td><td className="p-3">{q(i.stock)} {i.unit}</td><td className="p-3"><Input className="h-9 w-28" inputMode="decimal" value={raw ?? ""} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} placeholder="؟" /></td><td className="p-3 font-bold" dir="ltr">{diff === null ? "—" : <span className={diff === 0 ? "text-stone-400" : diff > 0 ? "text-emerald-600" : "text-rose-600"}>{diff > 0 ? "+" : ""}{q(diff)}</span>}</td><td className="p-3 text-end"><Button size="sm" variant="secondary" disabled={diff === null || diff === 0} loading={busy === i.id} onClick={() => count(i)}>ثبت شمارش</Button></td></tr>;
            })}</tbody></table>
          </Card>
        </div>
      )}</IconText>
    </div>
  );
}

type PurchaseSuggestion = { id: number; name: string; unit: string; warehouse: string; stock: number; minStock: number; reorderPoint: number; costPerUnit: number; consumed: number; movementCount: number; lastConsumedAt: string | null; avgDailyConsumption: number; usableDays: number | null; incomingConfirmed: number; suggestedQty: number; estimatedCost: number; insufficientData: boolean; fallback: string | null };
export function PurchaseSuggestions() {
  const [items, setItems] = useState<PurchaseSuggestion[]>([]);
  const [days, setDays] = useState("30");
  const [lead, setLead] = useState("3");
  const [safety, setSafety] = useState("2");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const query = `/api/reports/purchase-suggestions?lookbackDays=${days}&leadTimeDays=${lead}&safetyDays=${safety}`;
    api<{ items: PurchaseSuggestion[]; generatedAt: string }>(query)
      .then((result) => { if (active) { setItems(result.items); setUpdatedAt(result.generatedAt); setError(""); } })
      .catch((cause) => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, lead, safety, refresh]);
  return <div className="animate-fade-in">
    <PageHeader title="پیشنهاد خرید بر اساس مصرف" subtitle="برآورد قابل توضیح از گردش مصرف ثبت‌شده؛ هیچ سفارش خرید خودکار ارسال نمی‌شود." />
    <Card className="mb-5 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="بازه محاسبه"><Select value={days} onChange={(event) => setDays(event.target.value)}><option value="7">۷ روز</option><option value="14">۱۴ روز</option><option value="30">۳۰ روز</option><option value="60">۶۰ روز</option></Select></Field>
        <Field label="زمان تأمین (روز)"><Input inputMode="numeric" value={lead} onChange={(event) => setLead(faToEn(event.target.value))}/></Field>
        <Field label="ذخیره اطمینان (روز)"><Input inputMode="numeric" value={safety} onChange={(event) => setSafety(faToEn(event.target.value))}/></Field>
      </div>
      <p className="mt-3 text-xs leading-6 text-stone-500">پیشنهاد = میانگین مصرف روزانه × (زمان تأمین + ذخیره اطمینان) − موجودی − ورودی قطعی. سفارش خرید ثبت‌شده در سیستم فعلاً وجود ندارد، بنابراین ورودی قطعی صفر در نظر گرفته می‌شود. اگر داده فروش کافی نباشد، مقدار تا نقطه سفارش مجدد (یا دو برابر حداقل موجودی) و با برچسب مشخص نمایش داده می‌شود.</p>
    </Card>
    {loading ? <Skeleton className="h-64 rounded-2xl"/> : error ? <ErrorState message={error} onRetry={() => setRefresh((value) => value + 1)}/> : items.length === 0 ? <EmptyState emoji="" title="فعلاً خرید پیشنهادی ندارید" description="برآورد فقط از گردش مصرف فروش محاسبه می‌شود و موجودی انبار را تغییر نمی‌دهد."/> : <>
      {updatedAt && <p className="mb-3 text-xs text-stone-500">محاسبه‌شده در {formatDate(updatedAt)}</p>}
      <Card className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr className="border-b bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">قلم / انبار</th><th className="p-3 text-start">موجودی</th><th className="p-3 text-start">مصرف روزانه</th><th className="p-3 text-start">پوشش موجودی</th><th className="p-3 text-start">پیشنهاد</th><th className="p-3 text-start">هزینه تقریبی</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="p-3"><b>{item.name}</b><p className="text-xs text-stone-500">{item.warehouse}</p>{item.fallback && <Badge color="amber">{item.fallback}</Badge>}</td><td className="p-3">{q(item.stock)} {item.unit}<p className="text-xs text-stone-400">حداقل {q(item.minStock)} · سفارش {q(item.reorderPoint)}</p></td><td className="p-3">{q(item.avgDailyConsumption)} {item.unit}</td><td className="p-3">{item.usableDays === null ? "داده مصرف ندارد" : `${q(item.usableDays)} روز`}</td><td className="p-3 font-extrabold text-brand-700">{q(item.suggestedQty)} {item.unit}</td><td className="p-3">{formatPrice(item.estimatedCost)}</td></tr>)}</tbody></table></Card>
    </>}
  </div>;
}

type Rc = { id: number; productId: number; itemId: number; quantity: number; wastePercent: number };
export function Recipes() {
  const prods = useCollection<Product>("/api/products");
  const items = useCollection<Item>("/api/r/items");
  const rc = useCollection<Rc>("/api/r/recipes");
  const toast = useToast();
  const [sel, setSel] = useState<number | null>(null);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [lineDrafts, setLineDrafts] = useState<Record<number, { quantity: string; wastePercent: string }>>({});
  const activeItems = items.items.filter((item) => item.isActive !== false);
  const cur = sel ?? prods.items[0]?.id ?? null;
  const cost = (pid: number) => rc.items.filter((r) => r.productId === pid).reduce((s, r) => { const material = items.items.find((i) => i.id === r.itemId); return s + r.quantity * (material?.recipeToStockFactor ?? 1) * (1 + (r.wastePercent ?? 0) / 100) * (material?.costPerUnit ?? 0); }, 0);
  async function add() {
    const eligible = activeItems.filter((item) => !rc.items.some((line) => line.productId === cur && line.itemId === item.id));
    const iid = Number(itemId || eligible[0]?.id);
    const n = Number(faToEn(qty));
    if (!cur || !iid || !eligible.some((item) => item.id === iid) || !(n > 0)) return toast("مادهٔ فعال و مقدار مصرف را انتخاب کنید", "error");
    try { await rc.create({ productId: cur, itemId: iid, quantity: n, wastePercent: 0 }, { productId: cur, itemId: iid, quantity: n, wastePercent: 0 }); setQty(""); setItemId(""); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function saveRecipeLine(line: Rc) {
    const draft = lineDrafts[line.id];
    if (!draft || line.id < 0) return;
    const quantity = Number(faToEn(draft.quantity));
    const wastePercent = Number(faToEn(draft.wastePercent));
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 99.9) return toast("مقدار یا ضایعات معتبر نیست", "error");
    try { await rc.update(line.id, { quantity, wastePercent }); setLineDrafts((all) => { const next = { ...all }; delete next[line.id]; return next; }); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  const loading = prods.loading || items.loading || rc.loading;
  return (
    <div className="animate-fade-in">
      <PageHeader title="فرمول ساخت" subtitle="مواد اولیه‌ی محصول را تعریف کنید؛ مصرف فروش فقط از اقلام دارای ردیابی خودکار کم می‌شود" />
      <IconText>{loading ? <Skeleton className="h-80 rounded-2xl" /> : prods.items.length === 0 || activeItems.length === 0 ? <EmptyState emoji="" title="ابتدا محصول و مادهٔ فعال تعریف کنید" description="برای تعریف فرمول، هم به محصول منو و هم به یک مادهٔ فعال در انبار نیاز دارید." /> : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <Card className="max-h-[600px] overflow-y-auto p-2">{prods.items.map((p) => {
            const n = rc.items.filter((r) => r.productId === p.id).length;
            return <button key={p.id} onClick={() => setSel(p.id)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm", cur === p.id ? "bg-brand-50 font-bold text-brand-700" : "hover:bg-stone-50")}><span className="text-lg">{<EmojiIcon emoji={p.emoji} /> }</span><span className="flex-1 truncate">{p.name}</span>{n ? <Badge color="emerald">{toFa(n)}</Badge> : <Badge>—</Badge>}</button>;
          })}</Card>
          <Card className="p-5">
            {(() => {
              const p = prods.items.find((x) => x.id === cur)!;
              const lines = rc.items.filter((r) => r.productId === cur);
              const availableItems = activeItems.filter((item) => !lines.some((line) => line.itemId === item.id));
              const c = cost(cur!);
              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-extrabold">{<EmojiIcon emoji={p.emoji} /> } {p.name}</h3><div className="text-xs text-stone-500">قیمت فروش <b className="text-stone-800">{formatPrice(p.price)}</b> · بهای ماده <b className="text-stone-800">{formatPrice(Math.round(c))}</b></div></div>
                  <div className="mt-4 space-y-2">{lines.length === 0 && <p className="rounded-xl bg-stone-50 p-6 text-center text-sm text-stone-400">هنوز ماده‌ای برای این محصول تعریف نشده.</p>}{lines.map((r) => { const it = items.items.find((i) => i.id === r.itemId); const draft = lineDrafts[r.id] ?? { quantity: String(r.quantity), wastePercent: String(r.wastePercent ?? 0) }; return <div key={r.id} className={cn("grid gap-2 rounded-xl bg-stone-50 p-3 sm:grid-cols-[minmax(8rem,1fr)_8rem_8rem_8rem_auto] sm:items-end", r.id < 0 && "opacity-60")}><span className="pb-2 text-sm font-semibold">{it?.name} <small className="font-normal text-stone-500">({it?.recipeUnit ?? it?.unit})</small>{it?.isActive === false && <Badge color="stone" className="ms-1">غیرفعال</Badge>}{it && !it.trackStock && <Badge className="ms-1">ردیابی فروش خاموش</Badge>}</span><Field label={`مقدار برای یک واحد (${it?.recipeUnit ?? it?.unit ?? "—"})`}><Input inputMode="decimal" value={draft.quantity} disabled={r.id < 0} onChange={(e) => setLineDrafts((all) => ({ ...all, [r.id]: { ...draft, quantity: e.target.value } }))} onBlur={() => void saveRecipeLine(r)} /></Field><Field label="ضایعات ٪"><Input type="number" min="0" max="99.9" step="0.1" value={draft.wastePercent} disabled={r.id < 0} onChange={(e) => setLineDrafts((all) => ({ ...all, [r.id]: { ...draft, wastePercent: e.target.value } }))} onBlur={() => void saveRecipeLine(r)} /></Field><span className="pb-2 text-end text-xs text-stone-500">{formatPrice(Math.round(r.quantity * (it?.recipeToStockFactor ?? 1) * (1 + (r.wastePercent ?? 0) / 100) * (it?.costPerUnit ?? 0)))}</span><IconButton icon="trash" label="حذف" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => rc.remove(r.id).catch((e) => toast(e.message, "error"))} /></div>; })}</div>
                  <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4">
                    <Field label="ماده‌ی اولیه" className="min-w-48 flex-1"><Select value={itemId || String(availableItems[0]?.id ?? "")} onChange={(e) => setItemId(e.target.value)}><option value="">انتخاب کنید</option>{availableItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.recipeUnit ?? i.unit}) · انبار {i.unit}{i.trackStock ? "" : " — ردیابی فروش خاموش"}</option>)}</Select></Field>
                    <Field label="مقدار برای ۱ واحد محصول" className="w-44"><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.15" /></Field>
                    <Button onClick={add} disabled={!availableItems.length}><Icon name="plus" className="size-4" /> افزودن</Button>
                  </div>
                </>
              );
            })()}
          </Card>
        </div>
      )}</IconText>
    </div>
  );
}

type CostLine = { itemId: number; name: string; available: boolean; unit: string; stockUnit: string; recipeToStockFactor: number; costPerUnit: number; costBasis: "last_purchase" | "stock_average"; qty: number; wastePercent?: number; cost: number };
type Cost = { id: number; name: string; emoji: string; price: number; cost: number | null; hasRecipe: boolean; recipeComplete: boolean; margin: number | null; marginPct: number | null; sellingMode: string; yieldRatio: number; lines: CostLine[] };
const foodCostPercent = (item: Cost) => item.cost === null || item.price <= 0 ? null : item.cost / item.price * 100;
const percentLabel = (value: number | null) => value === null ? "—" : `${toFa(Math.round(value * 10) / 10)}٪`;

function CostBreakdown({ item, onChanged }: { item: Cost; onChanged: () => void }) {
  return <div className="space-y-3 rounded-xl bg-base-200/50 p-3 sm:p-4">
    {!item.hasRecipe && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">برای این محصول هنوز دستور تهیه ثبت نشده است؛ از همین‌جا مواد و مقدار مصرف را تعریف کنید تا بهای تمام‌شده محاسبه شود.</p>}
    {!item.recipeComplete && <p role="status" className="rounded-lg bg-rose-50 p-3 text-xs leading-6 text-rose-800">فرمول این محصول ناقص یا نامعتبر است. مواد حذف‌شده، مقدار نامعتبر یا بازده نامعتبر را اصلاح کنید؛ جمع ناقص به‌عنوان بهای واقعی نمایش داده نمی‌شود.</p>}
    {item.hasRecipe && <><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><strong>تحلیل مواد اولیه</strong>{item.recipeComplete && <span>بهای هر واحد: <b>{formatPrice(item.cost ?? 0)}</b>{item.sellingMode === "weight" && ` · بازده ${toFa(Math.round(item.yieldRatio * 100))}٪`}</span>}</div>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{item.lines.map((line) => <div key={line.itemId} className="min-w-0 rounded-lg border border-base-300 bg-base-100 p-3 text-xs">
      <div className="flex items-start justify-between gap-2"><b className="truncate">{line.name}</b>{!line.available && <Badge color="rose">ماده پیدا نشد</Badge>}</div>
      <p className="mt-2 text-base-content/60">مصرف: {q(line.qty)} {line.unit} = {q(line.qty * line.recipeToStockFactor)} {line.stockUnit}</p>
      <p className="mt-1 text-base-content/60">بهای مبنا: {formatPrice(line.costPerUnit)} / {line.stockUnit} · {line.costBasis === "last_purchase" ? "آخرین خرید" : "میانگین موجودی"}</p>
      {line.wastePercent ? <p className="mt-1 text-amber-700">ضایعات فرمول: {q(line.wastePercent)}٪</p> : null}
      <p className="mt-1 font-bold">سهم از بهای محصول: {formatPrice(line.cost)}</p>
    </div>)}</div></>}
    <ProductRecipeEditor productId={item.id} productName={item.name} sellingMode={item.sellingMode} yieldRatio={item.yieldRatio} onChanged={onChanged} />
  </div>;
}

function exportCosting(items: Cost[]) {
  const rows = [
    ["محصول", "قیمت فعلی (تومان)", "بهای تمام‌شده (تومان)", "هزینه مواد از قیمت (%)", "سود ناخالص (تومان)", "حاشیه سود ناخالص (%)", "وضعیت فرمول"],
    ...items.map((item) => [item.name, item.price, item.cost ?? "", foodCostPercent(item) === null ? "" : Math.round(foodCostPercent(item)! * 10) / 10, item.margin ?? "", item.marginPct ?? "", !item.hasRecipe ? "بدون فرمول" : item.recipeComplete ? "کامل" : "ناقص"]),
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `smart-pricing-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date())}.csv`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Costing() {
  const col = useCollection<Cost>("/api/r/costing");
  const [open, setOpen] = useState<number | null>(null);
  const [targetProductId, setTargetProductId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const { isManager } = useFeatures();
  const analyzed = col.items.filter((item) => item.recipeComplete && item.cost !== null);
  const priced = analyzed.filter((item) => item.price > 0);
  const avgMargin = priced.length ? Math.round(priced.reduce((sum, item) => sum + (item.marginPct ?? 0), 0) / priced.length) : null;
  const avgFoodCost = priced.length ? priced.reduce((sum, item) => sum + (foodCostPercent(item) ?? 0), 0) / priced.length : null;
  const lossCount = priced.filter((item) => (item.margin ?? 0) < 0).length;
  const attentionCount = col.items.filter((item) => !item.hasRecipe || !item.recipeComplete || item.price <= 0).length;
  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return [...col.items]
      .filter((item) => !term || item.name.toLocaleLowerCase().includes(term))
      .filter((item) => filter === "all" || (filter === "needs_recipe" ? !item.hasRecipe || !item.recipeComplete || item.price <= 0 : filter === "loss" ? item.recipeComplete && item.price > 0 && (item.margin ?? 0) < 0 : filter === "profitable" ? item.recipeComplete && item.price > 0 && (item.margin ?? 0) >= 0 : true))
      .sort((a, b) => Number(b.recipeComplete) - Number(a.recipeComplete) || (a.marginPct ?? -101) - (b.marginPct ?? -101) || a.name.localeCompare(b.name, "fa"));
  }, [col.items, filter, search]);

  return <div className="animate-fade-in space-y-4 pb-8">
    <PageHeader title="قیمت‌گذاری هوشمند" subtitle="بهای مواد، فودکاست، سود هر محصول و قیمت پیشنهادی بر پایهٔ دستور تهیه و بهای جاری انبار" actions={<div className="flex flex-wrap gap-2"><Link href="/dashboard/recipes" className="btn btn-secondary btn-sm"><Icon name="book" className="size-4" />دستورهای تهیه</Link><Button size="sm" variant="secondary" disabled={!col.items.length} onClick={() => exportCosting(filteredItems)}><Icon name="download" className="size-4" />خروجی CSV</Button></div>} />
    {col.loading ? <Skeleton className="h-72 rounded-2xl" /> : col.error ? <ErrorState message={col.error} onRetry={() => col.reload()} /> : col.items.length === 0 ? <EmptyState icon="calculator" title="محصولی برای قیمت‌گذاری وجود ندارد" description="ابتدا محصول و دستور تهیهٔ آن را ثبت کنید؛ بهای مواد از موجودی همان کسب‌وکار خوانده می‌شود." action={<Link href="/dashboard/products/create" className="btn btn-primary btn-sm">ساخت محصول و دستور تهیه</Link>} /> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-base-content/55">فرمول کامل</p><p className="mt-1 text-xl font-extrabold">{toFa(analyzed.length)} <span className="text-sm font-semibold text-base-content/50">از {toFa(col.items.length)} محصول</span></p><p className="mt-1 text-[11px] text-base-content/45">محصولات ناقص جداگانه مشخص شده‌اند</p></Card>
        <Card className="p-4"><p className="text-xs text-base-content/55">میانگین فودکاست</p><p className="mt-1 text-xl font-extrabold text-primary">{percentLabel(avgFoodCost)}</p><p className="mt-1 text-[11px] text-base-content/45">بهای مواد ÷ قیمت فروش فعلی</p></Card>
        <Card className="p-4"><p className="text-xs text-base-content/55">میانگین حاشیه سود ناخالص</p><p className="mt-1 text-xl font-extrabold text-emerald-700">{percentLabel(avgMargin)}</p><p className="mt-1 text-[11px] text-base-content/45">فقط فرمول کامل و قیمت‌دار</p></Card>
        <Card className="p-4"><p className="text-xs text-base-content/55">نیازمند بررسی</p><p className="mt-1 text-xl font-extrabold text-rose-700">{toFa(lossCount)} زیان‌ده <span className="text-sm font-semibold text-base-content/50">· {toFa(attentionCount)} ناقص/بی‌قیمت</span></p><p className="mt-1 text-[11px] text-base-content/45">فروش کمتر از بهای مواد یا دادهٔ ناقص</p></Card>
      </div>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-end">
          <Field label="جستجوی محصول"><div className="relative"><Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-base-content/45" /><Input className="ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="نام محصول را وارد کنید…" /></div></Field>
          <Field label="وضعیت قیمت"><Select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">همهٔ محصولات</option><option value="needs_recipe">فرمول ناقص یا قیمت خالی</option><option value="loss">فروش زیان‌ده</option><option value="profitable">سود مثبت</option></Select></Field>
        </div>
    <p className="text-[11px] leading-5 text-base-content/50">آنالیز ابتدا آخرین بهای خرید ثبت‌شده را می‌گیرد و اگر خریدی ثبت نشده باشد از میانگین بهای موجودی استفاده می‌کند؛ قیمت پیشنهادی فقط پس از تأیید شما در منو اعمال می‌شود.</p>
      </Card>

      {filteredItems.length === 0 ? <EmptyState icon="search" title="محصولی با این جستجو پیدا نشد" description="عبارت یا فیلتر وضعیت را تغییر دهید." /> : <>
        <div className="hidden md:block"><Card className="overflow-x-auto"><table className="w-full min-w-[940px] text-sm"><thead><tr className="border-b bg-base-200/60 text-xs text-base-content/55"><th className="p-3 text-start">محصول</th><th className="p-3 text-start">قیمت فعلی</th><th className="p-3 text-start">بهای تمام‌شده</th><th className="p-3 text-start">فودکاست</th><th className="p-3 text-start">سود ناخالص</th><th className="p-3 text-start">حاشیه سود</th><th className="p-3 text-start">عملیات</th></tr></thead><tbody>{filteredItems.map((item) => <Fragment key={item.id}>
          <tr className="border-t border-base-300/70 hover:bg-base-200/30">
            <td className="p-3"><div className="flex items-center gap-2"><EmojiIcon emoji={item.emoji} /><div><b>{item.name}</b><div className="mt-1">{!item.hasRecipe ? <Badge color="amber">بدون دستور تهیه</Badge> : !item.recipeComplete ? <Badge color="rose">فرمول ناقص</Badge> : item.price <= 0 ? <Badge color="amber">قیمت ثبت نشده</Badge> : (item.margin ?? 0) < 0 ? <Badge color="rose">زیان‌ده</Badge> : <Badge color="emerald">قابل فروش</Badge>}</div></div></div></td>
            <td className="whitespace-nowrap p-3">{formatPrice(item.price)}</td><td className="whitespace-nowrap p-3 font-semibold">{item.cost === null ? "—" : formatPrice(item.cost)}</td>
            <td className="p-3"><div className="flex items-center gap-2"><span className="min-w-12 font-bold">{percentLabel(foodCostPercent(item))}</span>{foodCostPercent(item) !== null && <div className="h-1.5 w-16 overflow-hidden rounded-full bg-base-200"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, foodCostPercent(item)!))}%` }} /></div>}</div></td>
            <td className={cn("whitespace-nowrap p-3 font-bold", (item.margin ?? 0) < 0 && "text-rose-700")}>{item.margin === null ? "—" : formatPrice(item.margin)}</td>
            <td className="p-3">{percentLabel(item.marginPct)}</td>
            <td className="whitespace-nowrap p-3"><div className="flex gap-1.5"><Button size="sm" variant="secondary" onClick={() => setOpen(open === item.id ? null : item.id)}><Icon name="list" className="size-4" />مواد</Button>{isManager && item.recipeComplete && item.cost !== null && item.cost > 0 && <Button size="sm" onClick={() => setTargetProductId(item.id)}><Icon name="calculator" className="size-4" />قیمت هدف</Button>}</div></td>
          </tr>
          {open === item.id && <tr className="bg-base-200/30"><td colSpan={7} className="p-3"><CostBreakdown item={item} onChanged={() => { void col.reload(true); }} /></td></tr>}
        </Fragment>)}</tbody></table></Card></div>

        <div className="space-y-3 md:hidden">{filteredItems.map((item) => <Card key={item.id} className="space-y-3 p-3">
          <div className="flex items-start gap-2"><EmojiIcon emoji={item.emoji} /><div className="min-w-0 flex-1"><b className="block truncate">{item.name}</b><div className="mt-1">{!item.hasRecipe ? <Badge color="amber">بدون دستور تهیه</Badge> : !item.recipeComplete ? <Badge color="rose">فرمول ناقص</Badge> : item.price <= 0 ? <Badge color="amber">قیمت ثبت نشده</Badge> : (item.margin ?? 0) < 0 ? <Badge color="rose">زیان‌ده</Badge> : <Badge color="emerald">قابل فروش</Badge>}</div></div><span className="shrink-0 text-sm font-bold">{formatPrice(item.price)}</span></div>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-base-200/50 p-3 text-xs"><div><span className="text-base-content/55">بهای مواد</span><b className="mt-1 block">{item.cost === null ? "—" : formatPrice(item.cost)}</b></div><div><span className="text-base-content/55">فودکاست</span><b className="mt-1 block">{percentLabel(foodCostPercent(item))}</b></div><div><span className="text-base-content/55">سود ناخالص</span><b className={cn("mt-1 block", (item.margin ?? 0) < 0 && "text-rose-700")}>{item.margin === null ? "—" : formatPrice(item.margin)}</b></div><div><span className="text-base-content/55">حاشیه سود</span><b className="mt-1 block">{percentLabel(item.marginPct)}</b></div></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setOpen(open === item.id ? null : item.id)}><Icon name="list" className="size-4" />{open === item.id ? "بستن مواد" : item.hasRecipe ? "جزئیات مواد" : "تعریف مواد"}</Button>{isManager && item.recipeComplete && item.cost !== null && item.cost > 0 && <Button size="sm" onClick={() => setTargetProductId(item.id)}><Icon name="calculator" className="size-4" />قیمت هدف</Button>}</div>
          {open === item.id && <CostBreakdown item={item} onChanged={() => { void col.reload(true); }} />}
        </Card>)}</div>
      </>}
    </>}
    {targetProductId !== null && <TargetPriceModal productId={targetProductId} onClose={() => setTargetProductId(null)} onSaved={() => { setTargetProductId(null); void col.reload(); }} />}
  </div>;
}

type TargetSnapshot = { product: { id: number; name: string; price: number; sellingMode: string; yieldRatio: number }; unitCost: number; lines: { itemId: number; name: string; quantity: number; unit: string; stockUnit: string; recipeToStockFactor: number; costPerUnit: number; costBasis: "last_purchase" | "stock_average"; extendedCost: number }[]; snapshotHash: string };
function TargetPriceModal({ productId, onClose, onSaved }: { productId: number; onClose: () => void; onSaved: () => void }) {
  const [snapshot, setSnapshot] = useState<TargetSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [targetType, setTargetType] = useState<PriceTargetType>("food_cost");
  const [targetPercent, setTargetPercent] = useState("30");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const toast = useToast();
  const targetRate = Number(faToEn(targetPercent));

  useEffect(() => {
    let active = true;
    api<{ item: TargetSnapshot }>(`/api/costing/price-target?productId=${productId}`)
      .then((data) => { if (active) { setSnapshot(data.item); setError(""); } })
      .catch((e) => { if (active) setError((e as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId, refreshVersion]);

  let suggested: number | null = null;
  if (snapshot) {
    try { suggested = calculateTargetPrice(snapshot.unitCost, targetRate, targetType); }
    catch { suggested = null; }
  }
  const currentFoodCost = snapshot && snapshot.product.price > 0 ? snapshot.unitCost / snapshot.product.price * 100 : null;
  const currentGrossMargin = snapshot && snapshot.product.price > 0 ? (snapshot.product.price - snapshot.unitCost) / snapshot.product.price * 100 : null;
  const projectedFoodCost = suggested && suggested > 0 && snapshot ? snapshot.unitCost / suggested * 100 : null;
  const projectedGrossMargin = suggested && suggested > 0 && snapshot ? (suggested - snapshot.unitCost) / suggested * 100 : null;
  async function apply() {
    if (!snapshot || suggested === null) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ item: { previousPrice: number; newPrice: number } }>("/api/costing/price-target", { method: "POST", body: { productId, targetType, targetPercent: targetRate, snapshotHash: snapshot.snapshotHash } });
      toast(`قیمت از ${formatPrice(result.item.previousPrice)} به ${formatPrice(result.item.newPrice)} تغییر کرد`);
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const stale = error.includes("قیمت یا بهای مواد تغییر کرده است");
  return <Modal open onClose={onClose} title={`قیمت‌گذاری هوشمند · ${snapshot?.product.name ?? "محصول"}`} size="xl" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>بستن</Button><Button loading={busy} onClick={apply} disabled={!snapshot || suggested === null || suggested === snapshot.product.price || busy}><Icon name="check" className="size-4" /> اعمال قیمت پیشنهادی</Button></>}>
    {loading ? <div className="p-8 text-center text-sm text-stone-500">در حال محاسبهٔ بهای مواد…</div> : error && !snapshot ? <ErrorState message={error} /> : snapshot && <div className="space-y-4">
      {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}{stale && <Button size="sm" variant="secondary" className="ms-2" disabled={loading || busy} onClick={() => { setLoading(true); setError(""); setSnapshot(null); setRefreshVersion((version) => version + 1); }}>محاسبهٔ دوباره</Button>}</div>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><Card className="p-3"><span className="text-xs text-base-content/55">قیمت فعلی</span><b className="mt-1 block">{formatPrice(snapshot.product.price)}</b></Card><Card className="p-3"><span className="text-xs text-base-content/55">بهای مواد / واحد</span><b className="mt-1 block">{formatPrice(snapshot.unitCost)}</b></Card><Card className="p-3"><span className="text-xs text-base-content/55">فودکاست فعلی</span><b className="mt-1 block">{percentLabel(currentFoodCost)}</b></Card><Card className="p-3"><span className="text-xs text-base-content/55">حاشیهٔ سود فعلی</span><b className="mt-1 block">{percentLabel(currentGrossMargin)}</b></Card><Card className="border-primary/30 bg-primary/5 p-3"><span className="text-xs text-base-content/55">قیمت پیشنهادی</span><b className="mt-1 block text-primary">{suggested === null ? "درصد هدف را بررسی کنید" : formatPrice(suggested)}</b></Card></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="مبنای هدف"><Select value={targetType} onChange={(e) => setTargetType(e.target.value as PriceTargetType)}><option value="food_cost">هدف فودکاست (درصد مواد از قیمت)</option><option value="gross_margin">هدف حاشیه سود ناخالص</option></Select></Field><Field label="درصد هدف (۱ تا ۹۹)"><Input type="number" min="1" max="99" step="1" value={targetPercent} onChange={(e) => setTargetPercent(e.target.value)} /></Field></div>
      {suggested !== null && <p className="rounded-xl bg-primary/5 p-3 text-sm leading-6 text-base-content">اختلاف با قیمت فعلی: <b className={suggested >= snapshot.product.price ? "text-amber-700" : "text-emerald-700"}>{suggested - snapshot.product.price >= 0 ? "+" : "−"}{formatPrice(Math.abs(suggested - snapshot.product.price))}</b>. بعد از اعمال، فودکاست {percentLabel(projectedFoodCost)} و حاشیهٔ سود ناخالص {percentLabel(projectedGrossMargin)} خواهد بود. قیمت به نزدیک‌ترین تومان گرد می‌شود. {snapshot.product.sellingMode === "weight" ? `بهای مواد برای فروش وزنی با بازده ${toFa(Math.round(snapshot.product.yieldRatio * 100))}٪ تعدیل شده است.` : "محاسبه بر پایهٔ مقادیر دستور تهیه و بهای جاری مواد در انبار است."}</p>}
      <Card className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="bg-base-200/60 text-xs text-base-content/55"><tr>{["ماده اولیه", "مصرف recipe / انبار", "بهای مبنا / واحد انبار", "هزینه در محصول"].map((x) => <th key={x} className="p-2.5 text-start">{x}</th>)}</tr></thead><tbody>{snapshot.lines.map((line) => <tr key={line.itemId} className="border-t"><td className="p-2.5">{line.name}</td><td className="p-2.5">{q(line.quantity)} {line.unit} → {q(line.quantity * line.recipeToStockFactor)} {line.stockUnit}</td><td className="p-2.5">{formatPrice(line.costPerUnit)}<small className="mt-1 block text-base-content/50">{line.costBasis === "last_purchase" ? "آخرین خرید" : "میانگین موجودی"}</small></td><td className="p-2.5">{formatPrice(line.extendedCost)}</td></tr>)}</tbody></table></Card>
      <p className="text-xs leading-6 text-base-content/55">بهای هر ماده از آخرین خرید ثبت‌شده می‌آید و در نبود آن، میانگین بهای موجودی مبناست. سود نمایش‌داده‌شده سود ناخالص پس از کسر مواد اولیه است؛ دستمزد، اجاره، بسته‌بندی و کارمزد پرداخت در این محاسبه نیست. هیچ قیمتی خودکار تغییر نمی‌کند. با اعمال پیشنهاد، مواد و بازده از سرور دوباره بررسی و مقدار قبل/بعد، بهای snapshot، هدف، زمان و کاربر در سوابق ثبت می‌شود.</p>
    </div>}
  </Modal>;
}
