"use client";

import { notifySetupSaved } from "@/lib/onboarding-tour";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCollection } from "@/lib/api";
import { useFeatures } from "@/components/features";
import { ImageUpload } from "@/components/image-upload";
import { ProductImportWizard } from "@/components/product-import-wizard";
import { ProductRecipeEditor } from "@/components/product-recipe-editor";
import { formatPrice, toFa } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { ALLERGEN_TAGS, DIETARY_TAGS, optionId, type ProductOptionGroup } from "@/lib/product-options";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  FOOD_IMAGES,
  Icon,
  IconButton,
  Input,
  Modal,
  PageHeader,
  ProductThumb,
  Select,
  Skeleton,
  Switch,
  Textarea,
  cn,
  useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";

type Form = {
  name: string;
  description: string;
  price: string;
  sellingMode: "count" | "weight";
  yieldRatio: string;
  oldPrice: string;
  categoryId: string;
  emoji: string;
  imageUrl: string;
  prepMinutes: string;
  isAvailable: boolean;
  isFeatured: boolean;
  arModelUrl: string;
  modifierGroups: ProductOptionGroup[];
  dietaryTags: string[];
  allergenTags: string[];
  priceVariants: { id: string; name: string; price: string; active: boolean }[];
};

const PRICE_VARIANT_GROUP_ID = "product-price-variants";

const blank: Form = {
  name: "",
  description: "",
  price: "",
  sellingMode: "count",
  yieldRatio: "1",
  oldPrice: "",
  categoryId: "",
  emoji: "",
  imageUrl: "",
  prepMinutes: "10",
  isAvailable: true,
  isFeatured: false,
  arModelUrl: "",
  modifierGroups: [],
  dietaryTags: [],
  allergenTags: [],
  priceVariants: [],
};

const EMOJIS = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];

const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "");

export default function ProductsPage() {
  const router = useRouter();
  const products = useCollection<Product>("/api/products");
  const categories = useCollection<Category>("/api/categories");
  const toast = useToast();
  const feat = useFeatures();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const catName = (id: number | null) => categories.items.find((c) => c.id === id);

  const filtered = useMemo(() => {
    const term = q.trim();
    return products.items.filter(
      (p) =>
        (cat === "all" || (cat === "none" ? p.categoryId === null : p.categoryId === Number(cat))) &&
        (!term || p.name.includes(term) || p.description.includes(term)),
    );
  }, [products.items, q, cat]);

  function openNew() {
    router.push("/dashboard/products/create");
  }
  function openEdit(p: Product) {
    const priceVariantGroup = (p.modifierGroups ?? []).find((group) => group.id === PRICE_VARIANT_GROUP_ID);
    setForm({
      name: p.name,
      description: p.description,
      price: String(p.price),
      sellingMode: p.sellingMode === "weight" ? "weight" : "count",
      yieldRatio: String(p.yieldRatio ?? 1),
      oldPrice: p.oldPrice ? String(p.oldPrice) : "",
      categoryId: p.categoryId ? String(p.categoryId) : "",
      emoji: p.emoji,
      imageUrl: p.imageUrl,
      prepMinutes: String(p.prepMinutes),
      isAvailable: p.isAvailable,
      isFeatured: p.isFeatured,
      arModelUrl: p.arModelUrl ?? "",
      modifierGroups: (p.modifierGroups ?? []).filter((group) => group.id !== PRICE_VARIANT_GROUP_ID),
      dietaryTags: p.dietaryTags ?? [],
      allergenTags: p.allergenTags ?? [],
      priceVariants: priceVariantGroup?.options.map((option) => ({ id: option.id, name: option.name, price: String(p.price + option.priceDelta), active: option.active })) ?? [],
    });
    setEditing(p);
  }

  const saveLock = useRef(false);

  async function save() {
    if (saveLock.current) return;
    const enteredPrice = Number(faToEn(form.price));
    const yieldRatio = Number(faToEn(form.yieldRatio));
    if (!form.name.trim()) return toast("نام محصول را وارد کنید", "error");
    if (!Number.isFinite(enteredPrice) || enteredPrice < 0 || faToEn(form.price) === "") return toast("قیمت معتبر وارد کنید", "error");
    if (!Number.isFinite(yieldRatio) || yieldRatio <= 0 || yieldRatio > 1) return toast("بازده خام به پخته باید بیشتر از صفر و حداکثر یک باشد", "error");
    const activeVariants = form.priceVariants.filter((variant) => variant.active);
    if (form.sellingMode === "weight" && activeVariants.length) return toast("برای محصول وزنی تنوع قیمت فعال نمی‌شود", "error");
    if (form.priceVariants.length && (!activeVariants.length || activeVariants.some((variant) => !variant.name.trim() || !Number.isSafeInteger(Number(faToEn(variant.price))) || Number(faToEn(variant.price)) < 0 || Number(faToEn(variant.price)) > 100_000_000))) return toast("عنوان و مبلغ تنوع‌های فعال را تا سقف ۱۰۰ میلیون تومان کامل کنید", "error");
    const price = activeVariants.length ? Math.min(...activeVariants.map((variant) => Number(faToEn(variant.price)))) : enteredPrice;
    const priceVariantGroup: ProductOptionGroup | null = activeVariants.length ? { id: PRICE_VARIANT_GROUP_ID, name: "تنوع قیمت", required: true, min: 1, max: 1, active: true, options: activeVariants.map((variant) => ({ id: variant.id, name: variant.name.trim(), priceDelta: Number(faToEn(variant.price)) - price, active: true })) } : null;
    const modifierGroups = [...form.modifierGroups.filter((group) => group.id !== PRICE_VARIANT_GROUP_ID), ...(priceVariantGroup ? [priceVariantGroup] : [])];
    if (modifierGroups.length > 12) return toast("حداکثر ۱۲ گروه انتخاب برای هر محصول ثبت می‌شود", "error");
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price,
      sellingMode: form.sellingMode,
      yieldRatio,
      oldPrice: form.oldPrice ? Number(faToEn(form.oldPrice)) : null,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      emoji: form.emoji || "",
      imageUrl: form.imageUrl.trim(),
      prepMinutes: Number(faToEn(form.prepMinutes)) || 0,
      isAvailable: form.isAvailable,
      isFeatured: form.isFeatured,
      arModelUrl: form.arModelUrl.trim(),
      modifierGroups,
      dietaryTags: form.dietaryTags,
      allergenTags: form.allergenTags,
    };
    const target = editing;
    saveLock.current = true;
    try {
      if (target === "new") {
        await products.create(payload, { ...payload, createdAt: new Date().toISOString() });
        setEditing(null);
        toast("محصول اضافه شد"); notifySetupSaved("products");
      } else if (target) {
        await products.update(target.id, payload);
        setEditing(null);
        toast("تغییرات ذخیره شد");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally { saveLock.current = false; }
  }

  async function toggle(p: Product, patch: Partial<Product>) {
    try {
      await products.update(p.id, patch);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function del(p: Product) {
    try {
      await products.remove(p.id);
      toast("محصول حذف شد");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const updateGroup = (groupId: string, update: (group: ProductOptionGroup) => ProductOptionGroup) =>
    set("modifierGroups", form.modifierGroups.map((group) => group.id === groupId ? update(group) : group));
  const toggleTag = (field: "dietaryTags" | "allergenTags", id: string) =>
    set(field, form[field].includes(id) ? form[field].filter((x) => x !== id) : [...form[field], id]);
  function applyRecipeSuggestedPrice(nextPrice: number) {
    const active = form.priceVariants.filter((variant) => variant.active);
    const currentPrices = active.map((variant) => Number(faToEn(variant.price)));
    if (active.length && currentPrices.every(Number.isFinite)) {
      const delta = nextPrice - Math.min(...currentPrices);
      set("priceVariants", form.priceVariants.map((variant) => variant.active
        ? { ...variant, price: String(Math.max(0, Number(faToEn(variant.price)) + delta)) }
        : variant));
    }
    set("price", String(nextPrice));
  }
  const loading = products.loading || categories.loading;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="منو و محصولات"
        subtitle={`${toFa(products.items.length)} محصول در کاتالوگ شما`}
        actions={
          <div className="flex flex-wrap gap-2">
            {feat.has("menu_import") && <Button variant="secondary" onClick={() => setImportOpen(true)}><Icon name="upload" className="size-4" /> ورود گروهی CSV</Button>}
            <Button data-tour="product-create" onClick={openNew}><Icon name="plus" className="size-4" /> محصول جدید</Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <Input className="ps-9" placeholder="جستجوی محصول…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="sm:w-56" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">همه دسته‌بندی‌ها</option>
          {categories.items.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="none">بدون دسته‌بندی</option>
        </Select>
      </div>

      <IconText>{loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      ) : products.error ? (
        <ErrorState message={products.error} onRetry={() => products.reload()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          emoji={products.items.length ? "" : ""}
          title={products.items.length ? "محصولی پیدا نشد" : "هنوز محصولی اضافه نکرده‌اید"}
          description={products.items.length ? "جستجو یا فیلتر را تغییر دهید." : "اولین محصول منوی خود را با قیمت، توضیحات و تصویر اضافه کنید."}
          action={!products.items.length && <Button data-tour="product-create" onClick={openNew}>افزودن اولین محصول</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((p) => {
            const c = catName(p.categoryId);
            return (
              <Card key={p.id} className={cn("group flex flex-col overflow-hidden animate-pop transition hover:shadow-md", p.id < 0 && "opacity-60")}>
                <div className="relative">
                  <ProductThumb imageUrl={p.imageUrl} emoji={iconGlyph(p.emoji)} className={cn("h-40 w-full", !p.isAvailable && "grayscale")} />
                  <div className="absolute start-3 top-3 flex gap-1.5">
                    {p.isFeatured && <Badge color="amber" className="bg-amber-50/95">{<EmojiIcon emoji="" />} ویژه</Badge>}
                    {!p.isAvailable && <Badge color="rose" className="bg-rose-50/95">ناموجود</Badge>}
                  </div>
                  {p.oldPrice && p.oldPrice > p.price && (
                    <span className="absolute end-3 top-3 rounded-full bg-rose-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow">
                      {toFa(Math.round((1 - p.price / p.oldPrice) * 100))}٪ تخفیف
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold leading-6">{<EmojiIcon emoji={p.emoji} /> } {p.name}</h3>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-400">{c ? <><EmojiIcon emoji={c.emoji} /> {c.name}</> : "بدون دسته‌بندی"} · {toFa(p.prepMinutes)} دقیقه</p>
                  <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-stone-500">{p.description || "—"}</p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-base font-extrabold text-brand-600">{formatPrice(p.price)}</span>
                    {p.oldPrice && p.oldPrice > p.price && <span className="text-xs text-stone-400 line-through">{formatPrice(p.oldPrice)}</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
                    <label className="flex items-center gap-2 text-xs text-stone-500">
                      <Switch checked={p.isAvailable} onChange={(v) => toggle(p, { isAvailable: v })} label="موجود" />
                      {p.isAvailable ? "موجود" : "ناموجود"}
                    </label>
                    <div className="flex">
                      <IconButton icon="sparkle" label={p.isFeatured ? "حذف از ویژه‌ها" : "ویژه کردن"} className={p.isFeatured ? "text-amber-500" : ""} onClick={() => toggle(p, { isFeatured: !p.isFeatured })} />
                      <IconButton icon="edit" label="ویرایش" onClick={() => openEdit(p)} />
                      <IconButton icon="trash" label="حذف" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeleting(p)} />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}</IconText>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "محصول جدید" : "ویرایش محصول"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button>
            <Button data-tour="product-save" onClick={save}>{editing === "new" ? "افزودن محصول" : "ذخیره تغییرات"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام محصول *" className="sm:col-span-2">
            <Input data-tour="product-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="مثلاً کاپوچینو" autoFocus />
          </Field>
          <Field label="دسته‌بندی">
            <Select data-tour="product-category" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">بدون دسته‌بندی</option>
              {categories.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="زمان آماده‌سازی (دقیقه)">
            <Input data-tour="product-prep" inputMode="numeric" value={form.prepMinutes} onChange={(e) => set("prepMinutes", e.target.value)} />
          </Field>
          <Field label="نوع فروش">
            <Select data-tour="product-mode" value={form.sellingMode} onChange={(e) => set("sellingMode", e.target.value as Form["sellingMode"])}><option value="count">تعدادی</option><option value="weight">وزنی (قیمت هر کیلو)</option></Select>
          </Field>
          <Field label={form.sellingMode === "weight" ? "قیمت هر کیلوگرم (تومان) *" : "قیمت هر عدد (تومان) *"}>
            <Input data-tour="product-price" inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="۱۲۰۰۰۰" />
          </Field>
          <section className="space-y-3 rounded-2xl border border-stone-200 p-4 sm:col-span-2" aria-labelledby="product-price-variants-title">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="product-price-variants-title" className="font-bold">تنوع قیمت</h3><p className="mt-1 text-xs text-stone-500">در منوی سفارش، مشتری یکی از قیمت‌های فعال را انتخاب می‌کند.</p></div><Button size="sm" variant="secondary" disabled={form.sellingMode === "weight"} onClick={() => set("priceVariants", [...form.priceVariants, { id: optionId("price"), name: "", price: "", active: true }])}><Icon name="plus" className="size-4"/> افزودن تنوع</Button></div>
            {form.sellingMode === "weight" && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">برای محصول وزنی، قیمت هر کیلو مبنای محاسبه است و تنوع قیمت فعال نمی‌شود.</p>}
            {form.priceVariants.map((variant) => <div key={variant.id} className="grid gap-2 rounded-xl bg-stone-50 p-3 sm:grid-cols-[1fr_10rem_auto_auto] sm:items-end"><Field label="نام تنوع"><Input value={variant.name} onChange={(e) => set("priceVariants", form.priceVariants.map((v) => v.id === variant.id ? { ...v, name: e.target.value } : v))} placeholder="مثلاً سایز بزرگ" /></Field><Field label="مبلغ (تومان)"><Input inputMode="numeric" value={variant.price} onChange={(e) => set("priceVariants", form.priceVariants.map((v) => v.id === variant.id ? { ...v, price: e.target.value } : v))} placeholder="۰" /></Field><label className="flex items-center gap-2 text-xs"><input type="checkbox" className="checkbox checkbox-sm" checked={variant.active} onChange={(e) => set("priceVariants", form.priceVariants.map((v) => v.id === variant.id ? { ...v, active: e.target.checked } : v))}/> فعال</label><Button size="sm" variant="ghost" className="text-error" onClick={() => set("priceVariants", form.priceVariants.filter((v) => v.id !== variant.id))}>حذف</Button></div>)}
            {form.priceVariants.length > 0 && <p className="text-xs leading-5 text-stone-500">کمترین مبلغ فعال، قیمت پایهٔ محصول است. برای هر سفارش انتخاب یک تنوع الزامی است.</p>}
          </section>
          {form.sellingMode === "weight" && <Field label="بازده خام به پخته" hint="مثلاً ۰٫۸ یعنی برای هر کیلو محصول پخته، ۱٫۲۵ کیلو ماده خام لازم است."><Input dir="ltr" inputMode="decimal" value={form.yieldRatio} onChange={(e) => set("yieldRatio", e.target.value)} placeholder="0.8" /></Field>}
          <Field label="قیمت قبل از تخفیف" hint="اختیاری؛ برای نمایش تخفیف">
            <Input inputMode="numeric" value={form.oldPrice} onChange={(e) => set("oldPrice", e.target.value)} />
          </Field>
          <Field label="توضیحات" className="sm:col-span-2">
            <Textarea data-tour="product-description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="مواد تشکیل‌دهنده، مقدار، نکات…" />
          </Field>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold text-stone-600">آیکن</span>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => set("emoji", e)} className={cn("flex size-9 items-center justify-center rounded-lg text-lg transition", form.emoji === e ? "bg-brand-100 ring-2 ring-brand-400" : "bg-stone-100 hover:bg-stone-200")}>{e}</button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold text-stone-600">تصویر محصول</span>
            <div data-tour="product-image"><ImageUpload value={form.imageUrl} emoji={iconGlyph(form.emoji)} onChange={(u) => set("imageUrl", u)} /></div>
            <details className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-semibold text-stone-600">یا از تصاویر آماده یا آدرس اینترنتی استفاده کنید</summary>
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => set("imageUrl", "")} className={cn("flex size-16 shrink-0 items-center justify-center rounded-xl bg-stone-200 text-xs text-stone-500", !form.imageUrl && "ring-2 ring-brand-400")}>بدون تصویر</button>
                {FOOD_IMAGES.map((i) => (
                  <button key={i.key} type="button" title={i.label} onClick={() => set("imageUrl", `/food/${i.key}.jpg`)} className={cn("size-16 shrink-0 overflow-hidden rounded-xl", form.imageUrl === `/food/${i.key}.jpg` && "ring-2 ring-brand-400 ring-offset-2")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/food/${i.key}.jpg`} alt={i.label} className="size-full object-cover" />
                  </button>
                ))}
              </div>
              <Input className="mt-2 text-left" dir="ltr" value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://… (یا آدرس تصویر دلخواه)" />
            </details>
          </div>
          {feat.has("ar") && (
            <Field label="مدل سه‌بعدی برای واقعیت افزوده (GLB)" className="sm:col-span-2" hint="اختیاری؛ مشتری می‌تواند محصول را در فضای واقعی ببیند">
              <Input className="text-left" dir="ltr" value={form.arModelUrl} onChange={(e) => set("arModelUrl", e.target.value)} placeholder="https://…/model.glb" />
            </Field>
          )}
          <section className="space-y-3 rounded-2xl border border-stone-200 p-4 sm:col-span-2" aria-labelledby="product-options-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 id="product-options-title" className="font-bold">افزودنی‌ها و انتخاب‌های محصول</h3><p className="mt-1 text-xs text-stone-500">قیمت گزینه‌ها هنگام ثبت سفارش از سرور محاسبه می‌شود.</p></div>
              <Button size="sm" variant="secondary" onClick={() => set("modifierGroups", [...form.modifierGroups, { id: optionId("group"), name: "", required: false, min: 0, max: 1, active: true, options: [{ id: optionId("option"), name: "", priceDelta: 0, active: true }] }])}><Icon name="plus" className="size-4"/> افزودن گروه</Button>
            </div>
            {form.modifierGroups.map((group) => <div key={group.id} className="space-y-3 rounded-xl bg-stone-50 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                <Field label="نام گروه"><Input value={group.name} onChange={(e) => updateGroup(group.id, (g) => ({ ...g, name: e.target.value }))} placeholder="مثلاً انتخاب سایز" /></Field>
                <Field label="حداقل"><Input inputMode="numeric" type="number" min={group.required ? 1 : 0} max={10} className="w-24" value={group.min} onChange={(e) => updateGroup(group.id, (g) => ({ ...g, min: Number(e.target.value), required: Number(e.target.value) > 0 }))} /></Field>
                <Field label="حداکثر"><Input inputMode="numeric" type="number" min={1} max={10} className="w-24" value={group.max} onChange={(e) => updateGroup(group.id, (g) => ({ ...g, max: Number(e.target.value) }))} /></Field>
                <Button size="sm" variant="ghost" className="text-error" onClick={() => set("modifierGroups", form.modifierGroups.filter((g) => g.id !== group.id))}>حذف گروه</Button>
              </div>
              <div className="space-y-2">
                {group.options.map((option) => <div key={option.id} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto_auto] sm:items-center">
                  <Input aria-label="نام گزینه" value={option.name} onChange={(e) => updateGroup(group.id, (g) => ({ ...g, options: g.options.map((o) => o.id === option.id ? { ...o, name: e.target.value } : o) }))} placeholder="نام گزینه" />
                  <Input aria-label="تغییر قیمت به تومان" inputMode="numeric" type="number" value={option.priceDelta} onChange={(e) => updateGroup(group.id, (g) => ({ ...g, options: g.options.map((o) => o.id === option.id ? { ...o, priceDelta: Number(e.target.value) } : o) }))} placeholder="تغییر قیمت (تومان)" />
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="checkbox checkbox-sm" checked={option.active} onChange={(e) => updateGroup(group.id, (g) => ({ ...g, options: g.options.map((o) => o.id === option.id ? { ...o, active: e.target.checked } : o) }))}/> فعال</label>
                  <Button size="sm" variant="ghost" disabled={group.options.length <= 1} onClick={() => updateGroup(group.id, (g) => { const options = g.options.filter((o) => o.id !== option.id); return { ...g, options, min: Math.min(g.min, options.filter((o) => o.active).length), max: Math.min(g.max, options.length) }; })}>حذف</Button>
                </div>)}
                <Button size="sm" variant="ghost" onClick={() => updateGroup(group.id, (g) => ({ ...g, options: [...g.options, { id: optionId("option"), name: "", priceDelta: 0, active: true }], max: Math.min(10, g.max + 1) }))}><Icon name="plus" className="size-4"/> افزودن گزینه</Button>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox checkbox-sm" checked={group.active} onChange={(e) => updateGroup(group.id, (g) => ({ ...g, active: e.target.checked }))}/> گروه فعال باشد</label>
            </div>)}
          </section>
          <section className="grid gap-4 rounded-2xl border border-stone-200 p-4 sm:grid-cols-2 sm:col-span-2">
            <fieldset><legend className="mb-2 text-sm font-bold">ویژگی‌های تغذیه‌ای اعلام‌شده</legend><div className="flex flex-wrap gap-2">{DIETARY_TAGS.map((tag) => <label key={tag.id} className="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-xs"><input type="checkbox" className="checkbox checkbox-xs" checked={form.dietaryTags.includes(tag.id)} onChange={() => toggleTag("dietaryTags", tag.id)}/>{tag.label}</label>)}</div></fieldset>
            <fieldset><legend className="mb-2 text-sm font-bold">آلرژن‌های اعلام‌شده</legend><div className="flex flex-wrap gap-2">{ALLERGEN_TAGS.map((tag) => <label key={tag.id} className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs"><input type="checkbox" className="checkbox checkbox-xs" checked={form.allergenTags.includes(tag.id)} onChange={() => toggleTag("allergenTags", tag.id)}/>{tag.label}</label>)}</div><p className="mt-2 text-xs text-stone-500">خالی بودن فهرست به معنی نبود آلرژن نیست.</p></fieldset>
          </section>
          <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
            <span className="text-sm font-medium">موجود در منو</span>
            <Switch checked={form.isAvailable} onChange={(v) => set("isAvailable", v)} label="موجود" />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
            <span className="text-sm font-medium">پیشنهاد ویژه <IconText>{<EmojiIcon emoji="" />}</IconText></span>
            <Switch checked={form.isFeatured} onChange={(v) => set("isFeatured", v)} label="ویژه" />
          </div>
          {editing && editing !== "new" && <div className="sm:col-span-2">{feat.has("recipes") || feat.has("costing") ? <ProductRecipeEditor productId={editing.id} productName={form.name || editing.name} sellingMode={form.sellingMode} yieldRatio={Number(faToEn(form.yieldRatio)) || 1} onApplySuggestedPrice={applyRecipeSuggestedPrice} /> : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">ویرایش دستور تهیه و آنالیز بهای مواد در پلن فعلی فعال نیست.</p>}</div>}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="حذف محصول"
        message={deleting ? `«${deleting.name}» از منو حذف می‌شود. سفارش‌های قبلی تغییری نمی‌کنند.` : ""}
        onConfirm={() => deleting && del(deleting)}
        onClose={() => setDeleting(null)}
      />
      <ProductImportWizard open={importOpen} onClose={() => setImportOpen(false)} onCommitted={() => { void products.reload(true); void categories.reload(true); }} />
    </div>
  );
}
