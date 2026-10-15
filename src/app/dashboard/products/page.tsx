"use client";

import { useMemo, useState } from "react";
import { useCollection } from "@/lib/api";
import { useFeatures } from "@/components/features";
import { ImageUpload } from "@/components/image-upload";
import { formatPrice, toFa } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
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
  useToast,
} from "@/components/ui";

type Form = {
  name: string;
  description: string;
  price: string;
  oldPrice: string;
  categoryId: string;
  emoji: string;
  imageUrl: string;
  prepMinutes: string;
  isAvailable: boolean;
  isFeatured: boolean;
  arModelUrl: string;
};

const blank: Form = {
  name: "",
  description: "",
  price: "",
  oldPrice: "",
  categoryId: "",
  emoji: "🍽️",
  imageUrl: "",
  prepMinutes: "10",
  isAvailable: true,
  isFeatured: false,
  arModelUrl: "",
};

const EMOJIS = ["🍽️", "☕", "🍕", "🍔", "🍟", "🥗", "🍰", "🍝", "🍛", "🍢", "🥪", "🌮", "🍣", "🍹", "🧁", "🍳"];

const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "");

export default function ProductsPage() {
  const products = useCollection<Product>("/api/products");
  const categories = useCollection<Category>("/api/categories");
  const toast = useToast();
  const feat = useFeatures();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [deleting, setDeleting] = useState<Product | null>(null);

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
    setForm({ ...blank, categoryId: cat !== "all" && cat !== "none" ? cat : "" });
    setEditing("new");
  }
  function openEdit(p: Product) {
    setForm({
      name: p.name,
      description: p.description,
      price: String(p.price),
      oldPrice: p.oldPrice ? String(p.oldPrice) : "",
      categoryId: p.categoryId ? String(p.categoryId) : "",
      emoji: p.emoji,
      imageUrl: p.imageUrl,
      prepMinutes: String(p.prepMinutes),
      isAvailable: p.isAvailable,
      isFeatured: p.isFeatured,
      arModelUrl: p.arModelUrl ?? "",
    });
    setEditing(p);
  }

  async function save() {
    const price = Number(faToEn(form.price));
    if (!form.name.trim()) return toast("نام محصول را وارد کنید", "error");
    if (!Number.isFinite(price) || price < 0 || faToEn(form.price) === "") return toast("قیمت معتبر وارد کنید", "error");
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price,
      oldPrice: form.oldPrice ? Number(faToEn(form.oldPrice)) : null,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      emoji: form.emoji || "🍽️",
      imageUrl: form.imageUrl.trim(),
      prepMinutes: Number(faToEn(form.prepMinutes)) || 0,
      isAvailable: form.isAvailable,
      isFeatured: form.isFeatured,
      arModelUrl: form.arModelUrl.trim(),
    };
    const target = editing;
    setEditing(null);
    try {
      if (target === "new") {
        await products.create(payload, { ...payload, createdAt: new Date().toISOString() });
        toast("محصول اضافه شد");
      } else if (target) {
        await products.update(target.id, payload);
        toast("تغییرات ذخیره شد");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
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
  const loading = products.loading || categories.loading;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="منو و محصولات"
        subtitle={`${toFa(products.items.length)} محصول در کاتالوگ شما`}
        actions={
          <Button onClick={openNew}>
            <Icon name="plus" className="size-4" /> محصول جدید
          </Button>
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
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
          <option value="none">بدون دسته‌بندی</option>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      ) : products.error ? (
        <ErrorState message={products.error} onRetry={() => products.reload()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          emoji={products.items.length ? "🔍" : "🍽️"}
          title={products.items.length ? "محصولی پیدا نشد" : "هنوز محصولی اضافه نکرده‌اید"}
          description={products.items.length ? "جستجو یا فیلتر را تغییر دهید." : "اولین محصول منوی خود را با قیمت، توضیحات و تصویر اضافه کنید."}
          action={!products.items.length && <Button onClick={openNew}>افزودن اولین محصول</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((p) => {
            const c = catName(p.categoryId);
            return (
              <Card key={p.id} className={cn("group flex flex-col overflow-hidden animate-pop transition hover:shadow-md", p.id < 0 && "opacity-60")}>
                <div className="relative">
                  <ProductThumb imageUrl={p.imageUrl} emoji={p.emoji} className={cn("h-40 w-full", !p.isAvailable && "grayscale")} />
                  <div className="absolute start-3 top-3 flex gap-1.5">
                    {p.isFeatured && <Badge color="amber" className="bg-amber-50/95">⭐ ویژه</Badge>}
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
                    <h3 className="font-bold leading-6">{p.emoji} {p.name}</h3>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-400">{c ? `${c.emoji} ${c.name}` : "بدون دسته‌بندی"} · {toFa(p.prepMinutes)} دقیقه</p>
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
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "محصول جدید" : "ویرایش محصول"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button>
            <Button onClick={save}>{editing === "new" ? "افزودن محصول" : "ذخیره تغییرات"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام محصول *" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="مثلاً کاپوچینو" autoFocus />
          </Field>
          <Field label="دسته‌بندی">
            <Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">بدون دسته‌بندی</option>
              {categories.items.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </Select>
          </Field>
          <Field label="زمان آماده‌سازی (دقیقه)">
            <Input inputMode="numeric" value={form.prepMinutes} onChange={(e) => set("prepMinutes", e.target.value)} />
          </Field>
          <Field label="قیمت (تومان) *">
            <Input inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="۱۲۰۰۰۰" />
          </Field>
          <Field label="قیمت قبل از تخفیف" hint="اختیاری؛ برای نمایش تخفیف">
            <Input inputMode="numeric" value={form.oldPrice} onChange={(e) => set("oldPrice", e.target.value)} />
          </Field>
          <Field label="توضیحات" className="sm:col-span-2">
            <Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="مواد تشکیل‌دهنده، مقدار، نکات…" />
          </Field>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold text-stone-600">ایموجی</span>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => set("emoji", e)} className={cn("flex size-9 items-center justify-center rounded-lg text-lg transition", form.emoji === e ? "bg-brand-100 ring-2 ring-brand-400" : "bg-stone-100 hover:bg-stone-200")}>{e}</button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold text-stone-600">تصویر محصول</span>
            <ImageUpload value={form.imageUrl} emoji={form.emoji} onChange={(u) => set("imageUrl", u)} />
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
          <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
            <span className="text-sm font-medium">موجود در منو</span>
            <Switch checked={form.isAvailable} onChange={(v) => set("isAvailable", v)} label="موجود" />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
            <span className="text-sm font-medium">پیشنهاد ویژه ⭐</span>
            <Switch checked={form.isFeatured} onChange={(v) => set("isFeatured", v)} label="ویژه" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="حذف محصول"
        message={deleting ? `«${deleting.name}» از منو حذف می‌شود. سفارش‌های قبلی تغییری نمی‌کنند.` : ""}
        onConfirm={() => deleting && del(deleting)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
