"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCollection } from "@/lib/api";
import { useFeatures } from "@/components/features";
import { ProductImportWizard } from "@/components/product-import-wizard";
import { formatPrice, toFa } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Input,
  PageHeader,
  ProductThumb,
  Select,
  Skeleton,
  Switch,
  cn,
  useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";

export default function ProductsPage() {
  const router = useRouter();
  const products = useCollection<Product>("/api/products");
  const categories = useCollection<Category>("/api/categories");
  const toast = useToast();
  const feat = useFeatures();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
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
    router.push(`/dashboard/products/create?edit=${p.id}`);
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
