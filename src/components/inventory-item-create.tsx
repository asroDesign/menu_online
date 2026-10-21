"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, useCollection } from "@/lib/api";
import { recipeToStockFactor } from "@/lib/inventory-units";
import { notifySetupSaved } from "@/lib/onboarding-tour";
import { formatPrice, toFa } from "@/lib/format";
import { useFeatures } from "@/components/features";
import { Badge, Button, Card, ErrorState, Field, Icon, Input, PersianDateInput, Select, Switch, Textarea, cn, useToast } from "@/components/ui";

type Named = { id: number; name: string };
type Saved = Named & { unit: string; stock: number; costPerUnit: number; warehouseId: number | null; trackStock: boolean };
type SectionProps = { number: string; title: string; description: string; icon: string; children: ReactNode };

const units = ["عدد", "کیلوگرم", "گرم", "لیتر", "میلی‌لیتر", "بسته", "کارتن", "متر"];
const faDigits = "۰۱۲۳۴۵۶۷۸۹";
const arDigits = "٠١٢٣٤٥٦٧٨٩";
const parseNumber = (value: string) => Number(value
  .replace(/[۰-۹]/g, (digit) => String(faDigits.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String(arDigits.indexOf(digit)))
  .replace(/[٬,\s]/g, "")
  .replace(/[٫]/g, "."));
const numberText = (value: number) => Number.isFinite(value) ? String(value) : "0";

function Section({ number, title, description, icon, children }: SectionProps) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon name={icon} className="size-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="text-[11px] font-bold tabular-nums text-blue-700">مرحله {toFa(number)}</span><span className="size-1 rounded-full bg-slate-300" /><h2 className="text-sm font-extrabold text-slate-900">{title}</h2></div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
    <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">{children}</div>
  </section>;
}

function QuickUnits({ value, onChange, disabled }: { value: string; onChange: (unit: string) => void; disabled?: boolean }) {
  return <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" aria-label="واحدهای پرکاربرد">
    {units.slice(0, 6).map((unit) => <button key={unit} type="button" disabled={disabled} aria-pressed={value === unit} onClick={() => onChange(unit)} className={cn("shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition", value === unit ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50", disabled && "cursor-not-allowed opacity-50")}>{unit}</button>)}
  </div>;
}

export function InventoryItemCreate() {
  const router = useRouter();
  const toast = useToast();
  const { has } = useFeatures();
  const warehouses = useCollection<Named>("/api/r/warehouses");
  const categories = useCollection<Named>("/api/r/inventory-categories");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("عدد");
  const [recipeUnit, setRecipeUnit] = useState("عدد");
  const [manualFactor, setManualFactor] = useState("1");
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [openingStock, setOpeningStock] = useState("0");
  const [openingUnitCost, setOpeningUnitCost] = useState("0");
  const [lastPurchaseCost, setLastPurchaseCost] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [reorderPoint, setReorderPoint] = useState("0");
  const [openingNote, setOpeningNote] = useState("");
  const [trackStock, setTrackStock] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [showCategoryCreate, setShowCategoryCreate] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  const factor = recipeToStockFactor(unit, recipeUnit);
  const effectiveFactor = factor ?? parseNumber(manualFactor);
  const stock = parseNumber(openingStock || "0");
  const unitCost = parseNumber(openingUnitCost || "0");
  const minimum = parseNumber(minStock || "0");
  const openingValue = Math.round(stock * unitCost);
  const stockStatus = !isActive ? "غیرفعال" : !trackStock ? "ردیابی خاموش" : stock <= 0 ? "بدون موجودی اولیه" : stock <= minimum ? "نیازمند سفارش" : "موجودی کافی";
  const stockStatusColor = !isActive || !trackStock ? "stone" : stock <= minimum && stock > 0 ? "amber" : stock <= 0 ? "blue" : "emerald";

  function updateStockUnit(next: string) {
    setUnit(next);
    const compatibleFactor = recipeToStockFactor(next, recipeUnit);
    if (compatibleFactor !== null) setManualFactor(numberText(compatibleFactor));
  }
  function updateRecipeUnit(next: string) {
    setRecipeUnit(next);
    const compatibleFactor = recipeToStockFactor(unit, next);
    if (compatibleFactor !== null) setManualFactor(numberText(compatibleFactor));
  }
  function createSku() {
    setSku(`INV-${window.crypto.randomUUID().slice(0, 8).toUpperCase()}`);
  }

  async function addCategory() {
    const clean = newCategory.trim();
    if (!clean || categoryBusy) return;
    setCategoryBusy(true);
    try {
      const result = await api<{ item: Named }>("/api/r/inventory-categories", { method: "POST", body: { name: clean } });
      await categories.reload(true);
      setCategoryId(String(result.item.id));
      setNewCategory("");
      setShowCategoryCreate(false);
      toast("دسته‌بندی ساخته شد");
    } catch (cause) {
      toast((cause as Error).message, "error");
    } finally {
      setCategoryBusy(false);
    }
  }

  function validate() {
    const parsed = [stock, unitCost, parseNumber(lastPurchaseCost || "0"), minimum, parseNumber(reorderPoint || "0")];
    if (!name.trim()) return "نام کالا یا ماده اولیه را وارد کنید.";
    if (parsed.some((value) => !Number.isFinite(value) || value < 0 || value > 1_000_000_000)) return "مقادیر عددی باید نامنفی و معتبر باشند.";
    if (!Number.isSafeInteger(unitCost) || !Number.isSafeInteger(parseNumber(lastPurchaseCost || "0"))) return "بهای واحد باید مبلغ صحیح به تومان باشد.";
    if (!Number.isFinite(effectiveFactor) || effectiveFactor <= 0 || effectiveFactor > 1_000_000_000) return "ضریب تبدیل واحد مصرف معتبر نیست.";
    if (!Number.isSafeInteger(openingValue) || openingValue > 1_000_000_000_000) return "ارزش موجودی اول دوره از سقف مجاز بیشتر است.";
    return "";
  }

  async function save(addNext = false) {
    if (submitting.current) return;
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await api<{ item: Saved }>("/api/r/inventory-items", {
        method: "POST",
        body: {
          name: name.trim(), sku, unit, recipeUnit, recipeToStockFactor: effectiveFactor,
          warehouseId: warehouseId || null, categoryId: categoryId || null, expiryDate: expiryDate || null,
          openingStock: stock, openingUnitCost: unitCost, lastPurchaseCost: parseNumber(lastPurchaseCost || "0"),
          minStock: minimum, reorderPoint: parseNumber(reorderPoint || "0"), openingNote,
          trackStock, isActive,
        },
      });
      notifySetupSaved("inventory");
      if (addNext) {
        setName(""); setSku(""); setExpiryDate(""); setOpeningStock("0"); setOpeningUnitCost("0"); setLastPurchaseCost("0"); setMinStock("0"); setReorderPoint("0"); setOpeningNote("");
        setTrackStock(true); setIsActive(true);
        setError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
        toast("کالا ثبت شد؛ مشخصات کالای بعدی را وارد کنید");
      } else {
        toast("کالا و موجودی اول دوره ثبت شد");
        router.push("/dashboard/inventory");
        router.refresh();
      }
    } catch (cause) {
      setError((cause as Error).message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <div dir="rtl" className="mx-auto max-w-[1440px] pb-36 sm:pb-32">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/dashboard/inventory" className="transition hover:text-blue-700">انبارداری</Link><Icon name="chevronLeft" className="size-3.5" /><span className="text-slate-400">تعریف قلم جدید</span></div>
        <div className="flex flex-wrap items-center gap-2.5"><h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">افزودن کالا به انبار</h1><Badge color="blue"><Icon name="plus" className="size-3" /> قلم جدید</Badge></div>
        <p className="mt-1.5 max-w-2xl text-xs leading-6 text-slate-500 sm:text-sm">مشخصات قلم، واحد خرید و مصرف، موجودی آغازین و نقطه سفارش را یک‌جا تعریف کنید.</p>
      </div>
      <Link href="/dashboard/inventory" className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"><Icon name="arrowRight" className="size-4" />بازگشت به فهرست</Link>
    </div>

    {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><Icon name="warning" className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => setError("")} aria-label="بستن خطا"><Icon name="x" className="size-4" /></button></div>}
    {(categories.error || warehouses.error) && <div className="mb-4"><ErrorState message={categories.error || warehouses.error || ""} onRetry={() => { void categories.reload(); void warehouses.reload(); }} /></div>}

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(285px,0.8fr)] xl:gap-5">
      <form id="inventory-item-create-form" onSubmit={(event) => { event.preventDefault(); void save(false); }} className="min-w-0 space-y-4">
        <Section number="۱" title="اطلاعات پایه کالا" description="نام و مشخصات شناسایی قلم را وارد کنید." icon="box">
          <Field label="نام کالا یا ماده اولیه *" className="sm:col-span-2"><Input autoFocus required maxLength={80} disabled={busy} value={name} onChange={(event) => setName(event.target.value)} placeholder="مثلاً قهوه اسپرسو، شیر یا لیوان کاغذی" /></Field>
          <div className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold text-stone-600">دسته‌بندی انبار</span><div className="flex gap-2"><Select disabled={busy || categories.loading || !!categories.error} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">بدون دسته‌بندی</option>{categories.items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select><Button type="button" size="sm" variant="secondary" disabled={busy} className="h-10 shrink-0 px-3" aria-label="افزودن دسته‌بندی" onClick={() => setShowCategoryCreate((value) => !value)}><Icon name={showCategoryCreate ? "x" : "plus"} className="size-4" /><span className="hidden sm:inline">دسته جدید</span></Button></div><span className="mt-1 block text-[11px] text-stone-400">برای مرتب‌سازی و گزارش‌گیری، دستهٔ مناسب را انتخاب کنید.</span>
            {showCategoryCreate && <div className="mt-2 flex gap-2"><Input aria-label="نام دسته جدید" autoFocus maxLength={60} disabled={categoryBusy || busy} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addCategory(); } }} placeholder="مثلاً مواد لبنی" /><Button type="button" size="sm" loading={categoryBusy} disabled={!newCategory.trim() || busy} onClick={() => void addCategory()}>ثبت</Button></div>}
          </div>
          <Field label="انبار نگهداری" hint="در صورت خالی‌گذاشتن، قلم در فهرست کلی انبار ثبت می‌شود."><Select disabled={busy || warehouses.loading || !!warehouses.error} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">بدون انبار مشخص</option>{warehouses.items.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</Select></Field>
          <Field label="کد کالا / SKU" hint="برای شناسایی سریع و اتصال به بارکد استفاده می‌شود."><div className="flex gap-2"><Input dir="ltr" maxLength={64} disabled={busy} value={sku} onChange={(event) => setSku(event.target.value.toUpperCase())} placeholder="INV-0001" /><Button type="button" size="sm" variant="secondary" disabled={busy} className="shrink-0 px-3" onClick={createSku}>ساخت خودکار</Button></div></Field>
          <Field label="تاریخ انقضا" hint="برای اقلام تاریخ‌دار؛ اختیاری است."><PersianDateInput value={expiryDate} onChange={setExpiryDate} disabled={busy} placeholder="انتخاب تاریخ شمسی" /></Field>
        </Section>

        <Section number="۲" title="واحد خرید و مصرف" description="واحد موجودی انبار را از واحد مصرف در دستور تهیه جدا کنید." icon="scale">
          <div className="space-y-2"><Field label="واحد خرید و نگهداری در انبار *"><Select disabled={busy} value={unit} onChange={(event) => updateStockUnit(event.target.value)}>{units.map((itemUnit) => <option key={itemUnit} value={itemUnit}>{itemUnit}</option>)}</Select></Field><QuickUnits value={unit} onChange={updateStockUnit} disabled={busy} /></div>
          <div className="space-y-2"><Field label="واحد مصرف در دستور تهیه *"><Select disabled={busy} value={recipeUnit} onChange={(event) => updateRecipeUnit(event.target.value)}>{units.map((itemUnit) => <option key={itemUnit} value={itemUnit}>{itemUnit}</option>)}</Select></Field><QuickUnits value={recipeUnit} onChange={updateRecipeUnit} disabled={busy} /></div>
          <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5">
            {factor !== null ? <div className="flex items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700"><Icon name="refresh" className="size-4" /></span><p className="text-xs leading-6 text-blue-950">هر <b>{recipeUnit}</b> مصرف در دستور تهیه، معادل <b dir="ltr">{toFa(effectiveFactor)}</b> {unit} از موجودی انبار است. تبدیل برای واحدهای هم‌جنس به‌صورت خودکار انجام می‌شود.</p></div> : <div className="grid items-end gap-3 sm:grid-cols-[1fr_220px]"><p className="text-xs leading-6 text-amber-900">این دو واحد تبدیل استاندارد ندارند. ضریب را براساس بسته‌بندی واقعی وارد کنید؛ مثلاً هر بسته چند عدد دارد.</p><Field label={`مقدار ${unit} در هر ${recipeUnit} *`}><Input type="number" min="0.000001" step="any" inputMode="decimal" disabled={busy} value={manualFactor} onChange={(event) => setManualFactor(event.target.value)} /></Field></div>}
          </div>
        </Section>

        <Section number="۳" title="موجودی و قیمت آغازین" description="اگر موجودی فعلی دارید، مقدار و بهای ورود اولیه را ثبت کنید." icon="file">
          <Field label={`موجودی اول دوره (${unit})`} hint="این مقدار به‌عنوان ورود آغازین در سوابق گردش انبار ثبت می‌شود."><Input type="number" min="0" step="any" inputMode="decimal" disabled={busy} value={openingStock} onChange={(event) => setOpeningStock(event.target.value)} /></Field>
          <Field label="بهای واحد موجودی آغازین (تومان)" hint="برای ثبت ارزش موجودی و سند افتتاحیهٔ حسابداری."><Input type="number" min="0" step="1" inputMode="numeric" disabled={busy} value={openingUnitCost} onChange={(event) => setOpeningUnitCost(event.target.value)} /></Field>
          <Field label="آخرین قیمت خرید (تومان)" hint="برای نمایش در برآوردها و خرید بعدی نگهداری می‌شود."><Input type="number" min="0" step="1" inputMode="numeric" disabled={busy} value={lastPurchaseCost} onChange={(event) => setLastPurchaseCost(event.target.value)} /></Field>
          <div className="flex min-h-[76px] flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3"><span className="text-[11px] font-semibold text-slate-500">ارزش موجودی آغازین</span><b className="mt-1 text-base font-extrabold tabular-nums text-slate-900">{formatPrice(Number.isSafeInteger(openingValue) ? openingValue : 0)}</b><span className="mt-0.5 text-[10px] text-slate-400">مقدار × بهای واحد</span></div>
          <Field label="یادداشت ورود اولیه" className="sm:col-span-2" hint="مثلاً شماره فاکتور یا علت ثبت موجودی آغازین."><Textarea disabled={busy} maxLength={300} rows={2} value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} placeholder="یادداشت اختیاری برای سابقهٔ انبار" /></Field>
        </Section>

        <Section number="۴" title="کنترل موجودی و وضعیت قلم" description="هشدارهای کمبود و رفتار قلم را برای گردش‌های بعدی مشخص کنید." icon="activity">
          <Field label={`حداقل موجودی (${unit})`} hint="رسیدن به این مقدار یا کمتر، قلم را در هشدار کمبود قرار می‌دهد."><Input type="number" min="0" step="any" inputMode="decimal" disabled={busy} value={minStock} onChange={(event) => setMinStock(event.target.value)} /></Field>
          <Field label={`نقطه سفارش مجدد (${unit})`} hint="این مقدار برای پیشنهاد زمان خرید دوباره استفاده می‌شود."><Input type="number" min="0" step="any" inputMode="decimal" disabled={busy} value={reorderPoint} onChange={(event) => setReorderPoint(event.target.value)} /></Field>
          <label className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 p-3.5"><span className="min-w-0"><b className="block text-xs font-extrabold text-slate-800">ردیابی خودکار موجودی در فروش</b><span className="mt-1 block text-[11px] leading-5 text-slate-500">با اتصال به دستور تهیه، هنگام فروش از موجودی این قلم کم می‌شود.</span></span><Switch checked={trackStock} onChange={setTrackStock} label="ردیابی خودکار موجودی در فروش" disabled={busy} /></label>
          <label className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 p-3.5"><span className="min-w-0"><b className="block text-xs font-extrabold text-slate-800">وضعیت فعال</b><span className="mt-1 block text-[11px] leading-5 text-slate-500">قلم غیرفعال در پیشنهادهای عملیاتی و انتخاب‌های جدید نمایش داده نمی‌شود.</span></span><Switch checked={isActive} onChange={setIsActive} label="فعال بودن قلم انبار" disabled={busy} /></label>
          {!trackStock && <p className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900"><Icon name="warning" className="mt-0.5 size-4 shrink-0" />موجودی فروش خودکار تغییر نمی‌کند؛ ورود، خروج و شمارش دستی همچنان در سوابق انبار ثبت می‌شوند.</p>}
        </Section>
      </form>

      <aside className="min-w-0 space-y-4 xl:sticky xl:top-24">
        <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5"><h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Icon name="eye" className="size-4 text-blue-700" />پیش‌نمایش قلم</h2><Badge color={stockStatusColor}>{stockStatus}</Badge></div>
          <div className="p-4">
            <div className="rounded-2xl bg-gradient-to-br from-blue-700 to-blue-900 p-4 text-white shadow-lg shadow-blue-900/10"><div className="flex items-start justify-between gap-3"><span className="flex size-11 items-center justify-center rounded-xl bg-white/15"><Icon name="box" className="size-5" /></span><span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold">{categories.items.find((item) => String(item.id) === categoryId)?.name ?? "بدون دسته"}</span></div><p className="mt-4 truncate text-base font-extrabold">{name.trim() || "نام کالا"}</p><p className="mt-1 text-xs text-blue-100">{sku || "کد کالا پس از ثبت ساخته می‌شود"}</p></div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold text-slate-500">موجودی آغازین</p><p className="mt-1 text-sm font-extrabold text-slate-900">{toFa(Number.isFinite(stock) ? stock : 0)} <span className="text-[11px] font-semibold text-slate-500">{unit}</span></p></div>
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold text-slate-500">واحد مصرف</p><p className="mt-1 text-sm font-extrabold text-slate-900">{recipeUnit}</p></div>
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold text-slate-500">ارزش موجودی</p><p className="mt-1 truncate text-xs font-extrabold text-slate-900">{formatPrice(Number.isSafeInteger(openingValue) ? openingValue : 0)}</p></div>
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold text-slate-500">حداقل موجودی</p><p className="mt-1 text-sm font-extrabold text-slate-900">{toFa(Number.isFinite(minimum) ? minimum : 0)} <span className="text-[11px] font-semibold text-slate-500">{unit}</span></p></div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs"><span className="text-slate-500">انبار</span><b className="truncate text-slate-800">{warehouses.items.find((item) => String(item.id) === warehouseId)?.name ?? "بدون انبار مشخص"}</b></div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs"><span className="text-slate-500">نقطه سفارش</span><b className="text-slate-800">{toFa(parseNumber(reorderPoint || "0"))} {unit}</b></div>
            {expiryDate && <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs"><span className="text-amber-800">تاریخ انقضا</span><b className="text-amber-950">{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(new Date(`${expiryDate}T12:00:00`))}</b></div>}
          </div>
        </Card>

        <Card className="rounded-2xl border-slate-200 p-4 shadow-sm sm:p-5"><h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon name="flask" className="size-4" /></span>راهنمای واحدها و دستور تهیه</h2><div className="mt-3 space-y-3 text-xs leading-6 text-slate-600"><p>واحد انبار، مقدار خرید و نگهداری را مشخص می‌کند. واحد مصرف در فرمول محصول می‌تواند کوچک‌تر باشد؛ برای نمونه خرید به کیلوگرم و مصرف به گرم.</p><p>برای واحدهای وزنی و حجمی ضریب تبدیل خودکار محاسبه می‌شود. برای بسته یا کارتن، ضریب را مطابق تعداد واقعی داخل بسته وارد کنید.</p><Link href="/dashboard/recipes" className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:text-blue-900"><Icon name="book" className="size-4" />رفتن به دستور تهیه محصولات<Icon name="arrowLeft" className="size-3.5" /></Link></div></Card>

        <Card className="rounded-2xl border-slate-200 p-4 shadow-sm sm:p-5"><h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><span className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Icon name="warning" className="size-4" /></span>کنترل و تأمین موجودی</h2><div className="mt-3 space-y-3 text-xs leading-6 text-slate-600"><p>حداقل موجودی برای هشدار کمبود و نقطه سفارش برای برآورد خرید بعدی استفاده می‌شود. اقلام تاریخ‌دار را با تاریخ شمسی ثبت کنید.</p><p>ثبت موجودی آغازین، سابقه ورود انبار و سند افتتاحیه حسابداری را هم‌زمان ایجاد می‌کند.</p><div className="flex flex-wrap gap-2">{has("stock_control") && <Link href="/dashboard/stock-control" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50">کنترل موجودی</Link>}{has("stock_movements") && <Link href="/dashboard/stock-movements" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50">گردش انبار</Link>}</div></div></Card>
      </aside>
    </div>

    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-6 lg:start-72">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 sm:gap-3">
        <p className="hidden text-xs text-slate-500 md:block">پس از ثبت، موجودی آغازین در سوابق انبار و حسابداری ثبت می‌شود.</p>
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          <Button type="button" variant="ghost" disabled={busy} className="h-10 px-3 text-xs sm:px-4" onClick={() => router.push("/dashboard/inventory")}><Icon name="x" className="size-4" />انصراف</Button>
          <Button type="submit" form="inventory-item-create-form" disabled={busy} loading={busy} className="h-10 px-3 text-xs sm:px-5"><Icon name="check" className="size-4" />ذخیره کالا</Button>
          <Button type="button" variant="secondary" disabled={busy} loading={busy} className="h-10 px-3 text-xs sm:px-4" onClick={() => void save(true)}><Icon name="plus" className="size-4" /><span className="hidden min-[420px]:inline">ذخیره و افزودن بعدی</span><span className="min-[420px]:hidden">افزودن بعدی</span></Button>
        </div>
      </div>
    </div>
  </div>;
}
