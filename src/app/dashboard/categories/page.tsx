"use client";

import { useMemo, useState } from "react";
import { useCollection } from "@/lib/api";
import { toFa } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, PageHeader, Skeleton, Switch, cn, useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";

const EMOJIS = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];

export default function CategoriesPage() {
  const cats = useCollection<Category>("/api/categories");
  const products = useCollection<Product>("/api/products");
  const toast = useToast();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [deleting, setDeleting] = useState<Category | null>(null);

  const sorted = useMemo(() => [...cats.items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id), [cats.items]);
  const countOf = (id: number) => products.items.filter((p) => p.categoryId === id).length;

  function openNew() {
    setName("");
    setEmoji("");
    setEditing("new");
  }
  function openEdit(c: Category) {
    setName(c.name);
    setEmoji(c.emoji);
    setEditing(c);
  }

  async function save() {
    if (!name.trim()) return toast("نام دسته‌بندی را وارد کنید", "error");
    const target = editing;
    setEditing(null);
    try {
      if (target === "new") {
        const payload = { name: name.trim(), emoji, sortOrder: cats.items.length, isActive: true };
        await cats.create(payload, payload);
        toast("دسته‌بندی اضافه شد");
      } else if (target) {
        await cats.update(target.id, { name: name.trim(), emoji });
        toast("تغییرات ذخیره شد");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const a = sorted[i];
    const b = sorted[i + dir];
    if (!b) return;
    try {
      await Promise.all([cats.update(a.id, { sortOrder: i + dir }), cats.update(b.id, { sortOrder: i })]);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function del(c: Category) {
    try {
      await cats.remove(c.id);
      toast("دسته‌بندی حذف شد");
      products.reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="دسته‌بندی‌ها"
        subtitle="ترتیب نمایش دسته‌ها در منوی مشتری را مدیریت کنید"
        actions={<Button onClick={openNew}><Icon name="plus" className="size-4" /> دسته‌بندی جدید</Button>}
      />

      <IconText>{cats.loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}</div>
      ) : cats.error ? (
        <ErrorState message={cats.error} onRetry={() => cats.reload()} />
      ) : sorted.length === 0 ? (
        <EmptyState emoji="" title="هنوز دسته‌بندی‌ای ندارید" description="محصولات را در دسته‌هایی مثل «قهوه»، «پیتزا» یا «دسر» سازمان‌دهی کنید." action={<Button onClick={openNew}>ساخت اولین دسته‌بندی</Button>} />
      ) : (
        <div className="space-y-3">
          {sorted.map((c, i) => (
            <Card key={c.id} className={cn("flex items-center gap-3 p-3 pe-4 animate-pop sm:gap-4 sm:p-4", c.id < 0 && "opacity-60", !c.isActive && "bg-stone-50")}>
              <div className="flex flex-col">
                <IconButton icon="chevronUp" label="بالا" className="size-6" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon="chevronDown" label="پایین" className="size-6" disabled={i === sorted.length - 1} onClick={() => move(i, 1)} />
              </div>
              <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-2xl", !c.isActive && "grayscale")}>{<EmojiIcon emoji={c.emoji} /> }</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.name}</p>
                <p className="text-xs text-stone-500">{toFa(countOf(c.id))} محصول</p>
              </div>
              <Badge color={c.isActive ? "emerald" : "stone"} className="hidden sm:inline-flex">{c.isActive ? "فعال" : "مخفی"}</Badge>
              <Switch checked={c.isActive} label="فعال" onChange={(v) => cats.update(c.id, { isActive: v }).catch((e) => toast(e.message, "error"))} />
              <div className="flex">
                <IconButton icon="edit" label="ویرایش" onClick={() => openEdit(c)} />
                <IconButton icon="trash" label="حذف" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => setDeleting(c)} />
              </div>
            </Card>
          ))}
        </div>
      )}</IconText>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "دسته‌بندی جدید" : "ویرایش دسته‌بندی"}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>انصراف</Button><Button onClick={save}>ذخیره</Button></>}
      >
        <div className="space-y-4">
          <Field label="نام دسته‌بندی *">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً نوشیدنی گرم" autoFocus onKeyDown={(e) => e.key === "Enter" && save()} />
          </Field>
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-stone-600">آیکن</span>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => setEmoji(e)} className={cn("flex size-10 items-center justify-center rounded-xl text-xl transition", emoji === e ? "bg-brand-100 ring-2 ring-brand-400" : "bg-stone-100 hover:bg-stone-200")}>{e}</button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="حذف دسته‌بندی"
        message={deleting ? `«${deleting.name}» حذف می‌شود. ${toFa(countOf(deleting.id))} محصول داخل آن بدون دسته‌بندی باقی می‌مانند.` : ""}
        onConfirm={() => deleting && del(deleting)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
