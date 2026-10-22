"use client";

import { useMemo, useRef, useState } from "react";
import { useCollection } from "@/lib/api";
import { toFa } from "@/lib/format";
import { notifySetupSaved } from "@/lib/onboarding-tour";
import type { Category, Product } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, PageHeader, ProductThumb, Select, Skeleton, Switch, Textarea, useToast } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";

const DEFAULT_CATEGORY_ICON = "utensils";

export default function CategoriesPage() {
  const cats = useCollection<Category>("/api/categories");
  const products = useCollection<Product>("/api/products");
  const toast = useToast();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sortOrder, setSortOrder] = useState("1");
  const [isActive, setIsActive] = useState(true);
  const [query, setQuery] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNames, setBulkNames] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const saveLock = useRef(false);
  const bulkLock = useRef(false);

  const sorted = useMemo(() => [...cats.items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id), [cats.items]);
  const productCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const product of products.items) {
      if (product.categoryId !== null) counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [products.items]);
  const visibleCategories = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return sorted.filter((category) => !term || category.name.toLocaleLowerCase().includes(term));
  }, [query, sorted]);
  const blockedParentIds = useMemo(() => {
    const blocked = new Set<number>();
    if (!editing || editing === "new") return blocked;
    blocked.add(editing.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of cats.items) {
        if (category.parentCategoryId !== null && blocked.has(category.parentCategoryId) && !blocked.has(category.id)) {
          blocked.add(category.id);
          changed = true;
        }
      }
    }
    return blocked;
  }, [cats.items, editing]);
  const loading = cats.loading || products.loading;

  function openNew() {
    setName("");
    setDescription("");
    setParentCategoryId("");
    setImageUrl("");
    setSortOrder(String(sorted.length + 1));
    setIsActive(true);
    setEditing("new");
  }

  function openEdit(category: Category) {
    setName(category.name);
    setDescription(category.description ?? "");
    setParentCategoryId(category.parentCategoryId ? String(category.parentCategoryId) : "");
    setImageUrl(category.imageUrl ?? "");
    const position = sorted.findIndex((item) => item.id === category.id);
    setSortOrder(String(position < 0 ? sorted.length : position + 1));
    setIsActive(category.isActive);
    setEditing(category);
  }

  async function save() {
    if (saveLock.current) return;
    const cleanName = name.trim();
    if (!cleanName) return toast("عنوان دسته‌بندی را وارد کنید", "error");
    const orderNumber = Number(sortOrder);
    if (!Number.isInteger(orderNumber) || orderNumber < 1) return toast("ترتیب نمایش باید عددی بزرگ‌تر از صفر باشد", "error");
    const target = editing;
    if (!target) return;
    saveLock.current = true;
    setSaveBusy(true);
    try {
      const common = {
        name: cleanName,
        description: description.trim(),
        parentCategoryId: parentCategoryId ? Number(parentCategoryId) : null,
        imageUrl: imageUrl.trim(),
        emoji: target === "new" ? DEFAULT_CATEGORY_ICON : target.emoji,
      };
      if (target === "new") {
        const destination = Math.min(sorted.length, orderNumber - 1);
        const payload = { ...common, sortOrder: destination, isActive: true };
        const created = await cats.create(payload, payload);
        setEditing(null);
        const reordered = [...sorted];
        reordered.splice(destination, 0, created);
        try {
          for (const [index, category] of reordered.entries()) {
            if (category.sortOrder !== index) await cats.update(category.id, { sortOrder: index });
          }
        } catch (error) {
          await cats.reload(true);
          toast("دسته ایجاد شد، اما ترتیب کامل ذخیره نشد: " + (error as Error).message, "error");
          notifySetupSaved("categories");
          return;
        }
        toast("دسته‌بندی ایجاد شد");
        notifySetupSaved("categories");
        return;
      }

      const destination = Math.min(sorted.length - 1, orderNumber - 1);
      const reordered = sorted.filter((category) => category.id !== target.id);
      reordered.splice(destination, 0, target);
      for (const [index, category] of reordered.entries()) {
        const nextOrder = index;
        if (category.id === target.id) {
          await cats.update(category.id, { ...common, isActive, sortOrder: nextOrder });
        } else if (category.sortOrder !== nextOrder) {
          await cats.update(category.id, { sortOrder: nextOrder });
        }
      }
      setEditing(null);
      toast("تغییرات دسته‌بندی ذخیره شد");
    } catch (error) {
      await cats.reload(true);
      toast((error as Error).message, "error");
    } finally {
      saveLock.current = false;
      setSaveBusy(false);
    }
  }

  async function addBulk() {
    if (bulkLock.current) return;
    const names = bulkNames.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!names.length) return toast("نام دسته‌ها را هرکدام در یک خط وارد کنید", "error");
    if (names.some((item) => item.length > 60)) return toast("نام دسته‌بندی حداکثر ۶۰ نویسه است", "error");
    const seen = new Set(cats.items.map((category) => category.name.trim().toLocaleLowerCase()));
    const unique: string[] = [];
    let skipped = 0;
    for (const item of names) {
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      unique.push(item);
    }
    if (!unique.length) return toast("همهٔ نام‌ها تکراری هستند", "error");

    bulkLock.current = true;
    setBulkBusy(true);
    let created = 0;
    try {
      let nextOrder = sorted.length;
      for (const item of unique) {
        const payload = { name: item, description: "", parentCategoryId: null, imageUrl: "", emoji: DEFAULT_CATEGORY_ICON, sortOrder: nextOrder++, isActive: true };
        await cats.create(payload, payload);
        created++;
      }
      setBulkOpen(false);
      setBulkNames("");
      toast(skipped ? `${toFa(created)} دسته ساخته شد؛ ${toFa(skipped)} نام تکراری رد شد` : `${toFa(created)} دسته ساخته شد`);
      notifySetupSaved("categories");
    } catch (error) {
      await cats.reload(true);
      toast(created ? `${toFa(created)} دسته ساخته شد؛ ادامه انجام نشد: ${(error as Error).message}` : (error as Error).message, "error");
    } finally {
      bulkLock.current = false;
      setBulkBusy(false);
    }
  }

  async function removeCategory(category: Category) {
    try {
      await cats.remove(category.id);
      await Promise.all([cats.reload(true), products.reload(true)]);
      toast("دسته‌بندی حذف شد");
    } catch (error) {
      toast((error as Error).message, "error");
    }
  }

  const modalTitle = editing === "new" ? "ایجاد دسته‌بندی" : "ویرایش دسته‌بندی";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="دسته‌بندی‌ها"
        subtitle={`${toFa(cats.items.length)} دسته در منوی فروشگاه`}
        actions={<>
          <div className="relative w-full sm:w-64">
            <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-base-content/40" />
            <Input aria-label="جستجو در دسته‌بندی‌ها" className="ps-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجو در دسته‌بندی‌ها..." />
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setBulkNames(""); setBulkOpen(true); }}>
            <Icon name="list" className="size-4" /> افزودن گروهی
          </Button>
          <Button data-tour="category-create" size="sm" onClick={openNew}>
            <Icon name="plus" className="size-4" /> ایجاد دسته‌بندی
          </Button>
        </>}
      />

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)}</div>
        ) : cats.error || products.error ? (
          <div className="p-4"><ErrorState message={cats.error ?? products.error ?? "خطای بارگیری دسته‌بندی‌ها"} onRetry={() => { void cats.reload(); void products.reload(); }} /></div>
        ) : (
          <div>
            <div className="max-h-[min(50dvh,282px)] overflow-auto">
              <table className="w-full min-w-[700px] text-sm" aria-label="لیست تمامی دسته‌بندی‌های منو">
                <thead className="sticky top-0 z-10 bg-base-200/70 text-xs font-semibold text-base-content/60">
                  <tr>
                    <th scope="col" className="border-b border-base-300 px-4 py-3 text-start">تصویر</th>
                    <th scope="col" className="border-b border-base-300 px-4 py-3 text-start">عنوان دسته‌بندی</th>
                    <th scope="col" className="border-b border-base-300 px-4 py-3 text-center">تعداد محصولات</th>
                    <th scope="col" className="border-b border-base-300 px-4 py-3 text-center">ردیف نمایش</th>
                    <th scope="col" className="border-b border-base-300 px-4 py-3 text-center">وضعیت</th>
                    <th scope="col" className="border-b border-base-300 px-4 py-3 text-center">مدیریت</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCategories.map((category) => {
                    const position = sorted.findIndex((item) => item.id === category.id);
                    return (
                      <tr key={category.id} className="border-t border-base-200 transition-colors hover:bg-base-200/40">
                        <td className="px-4 py-2.5">
                          {category.imageUrl ? <ProductThumb imageUrl={category.imageUrl} emoji={category.emoji} className="size-10 rounded-lg" /> : <div className="flex size-10 items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-200/40 text-base-content/35"><Icon name="image" className="size-4" /></div>}
                        </td>
                        <td className="max-w-[20rem] px-4 py-2.5">
                          <span className="block truncate font-bold text-base-content">{category.name}</span>
                          {category.parentCategoryId !== null && <span className="mt-0.5 block truncate text-[11px] text-base-content/55">زیرمجموعهٔ {cats.items.find((parent) => parent.id === category.parentCategoryId)?.name ?? "دستهٔ والد"}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center font-semibold text-base-content/80">{toFa(productCounts.get(category.id) ?? 0)}</td>
                        <td className="px-4 py-2.5 text-center text-base-content/65">ردیف {toFa(position + 1)}</td>
                        <td className="px-4 py-2.5 text-center"><Badge color={category.isActive ? "emerald" : "stone"}>{category.isActive && <Icon name="circleCheck" className="size-3" />}{category.isActive ? "فعال" : "غیرفعال"}</Badge></td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-center gap-1">
                            <IconButton icon="edit" label={"ویرایش دسته‌بندی " + category.name} onClick={() => openEdit(category)} />
                            <IconButton icon="trash" label={"حذف دسته‌بندی " + category.name} className="text-error hover:bg-error/10 hover:text-error" onClick={() => setDeleting(category)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleCategories.length === 0 && (
                    <tr><td colSpan={6} className="p-5">
                      {sorted.length ? <EmptyState icon="search" title="دسته‌بندی پیدا نشد" description="عبارت جستجو را تغییر دهید یا پاک کنید." action={<Button variant="secondary" size="sm" onClick={() => setQuery("")}>پاک‌کردن جستجو</Button>} /> : <EmptyState icon="layers" title="هنوز دسته‌بندی‌ای ندارید" description="برای مرتب‌سازی منو اولین دسته‌بندی را بسازید." action={<Button data-tour="category-create" size="sm" onClick={openNew}><Icon name="plus" className="size-4" /> ایجاد دسته‌بندی</Button>} />}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="border-t border-base-200 px-4 py-3 text-center text-xs text-base-content/55">لیست تمامی دسته‌بندی‌های منو</p>
          </div>
        )}
      </Card>

      <Card className="px-4 py-3 text-xs text-base-content/65">
        نمایش {toFa(visibleCategories.length ? 1 : 0)} تا {toFa(visibleCategories.length)} از مجموع {toFa(sorted.length)} دسته‌بندی
      </Card>

      <Modal
        open={!!editing}
        onClose={() => { if (!saveLock.current) setEditing(null); }}
        title={modalTitle}
        description="اطلاعات و نحوهٔ نمایش دسته‌بندی در منوی فروشگاه"
        size="md"
        footer={<><Button variant="ghost" disabled={saveBusy} onClick={() => setEditing(null)}>انصراف</Button><Button data-tour="category-save" loading={saveBusy} onClick={save}>{editing === "new" ? "ایجاد دسته‌بندی" : "ذخیره تغییرات"}</Button></>}
      >
        <fieldset disabled={saveBusy} className="min-w-0 space-y-4">
          <Field label="عنوان دسته‌بندی *">
            <Input data-tour="category-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="مثلاً: فست فود" maxLength={60} autoFocus onKeyDown={(event) => event.key === "Enter" && save()} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_130px]">
          <Field label="دسته‌بندی والد">
            <Select value={parentCategoryId} onChange={(event) => setParentCategoryId(event.target.value)}>
              <option value="">بدون والد</option>
              {sorted.filter((category) => !blockedParentIds.has(category.id)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
          </Field>
          <Field label="ترتیب نمایش">
            <Input type="number" min={1} max={Math.max(1, sorted.length + (editing === "new" ? 1 : 0))} inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
          </Field>
          </div>
          {editing !== "new" && <Field label="توضیحات">
            <Textarea aria-label="توضیحات دسته‌بندی" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} placeholder="توضیحات کوتاه درباره این دسته‌بندی..." />
          </Field>}
          <div>
            <ImageUpload compact disabled={saveBusy} value={imageUrl} emoji={editing === "new" ? DEFAULT_CATEGORY_ICON : editing?.emoji ?? DEFAULT_CATEGORY_ICON} onChange={setImageUrl} label="تصویر دسته‌بندی" description="برای آپلود تصویر کلیک کنید؛ PNG، JPG یا WEBP." />
          </div>

          {editing !== "new" && <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
            <div><p className="text-sm font-semibold">نمایش در منو</p><p className="mt-1 text-xs text-base-content/55">دسته‌بندی برای مشتریان فعال باشد</p></div>
            <Switch checked={isActive} label="وضعیت دسته‌بندی" onChange={setIsActive} />
          </div>}
        </fieldset>
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => { if (!bulkLock.current) setBulkOpen(false); }}
        title="افزودن گروهی دسته‌بندی"
        description="چند دسته‌بندی را هم‌زمان به منوی خود اضافه کنید"
        size="md"
        footer={<><Button variant="ghost" disabled={bulkBusy} onClick={() => setBulkOpen(false)}>انصراف</Button><Button onClick={addBulk} loading={bulkBusy}>افزودن دسته‌ها</Button></>}
      >
        <div className="space-y-3">
          <p className="rounded-xl border border-brand-100 bg-brand-50/50 p-3 text-xs leading-6 text-brand-700">نام هر دسته‌بندی را در یک خط بنویسید. نام‌های خالی و تکراری نادیده گرفته می‌شوند.</p>
          <Textarea disabled={bulkBusy} autoFocus aria-label="نام دسته‌بندی‌ها برای افزودن گروهی" value={bulkNames} onChange={(event) => setBulkNames(event.target.value)} rows={7} className="min-h-40" placeholder={"قهوه گرم\nنوشیدنی سرد\nدسر"} />
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        title="حذف دسته‌بندی"
        description="پیش از حذف، وابستگی محصولات را بررسی کنید"
        size="sm"
        onClose={() => setDeleting(null)}
        footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>انصراف</Button><Button variant="danger" onClick={() => { if (deleting) void removeCategory(deleting); setDeleting(null); }}><Icon name="trash" className="size-4" />حذف دسته‌بندی</Button></>}
      >
        <div className="rounded-2xl border border-error/20 bg-error/5 p-4">
          <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-base-100 text-error"><Icon name="trash" className="size-5" /></span>
          <p className="text-sm font-bold text-base-content">{deleting ? `«${deleting.name}» حذف شود؟` : ""}</p>
          <p className="mt-2 text-xs leading-6 text-base-content/70">{toFa(deleting ? productCounts.get(deleting.id) ?? 0 : 0)} محصول بدون دسته‌بندی می‌ماند. خود محصولات حذف نمی‌شوند.</p>
        </div>
      </Modal>
    </div>
  );
}
