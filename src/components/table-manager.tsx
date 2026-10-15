"use client";

import { useMemo, useState } from "react";
import { api, type useCollection } from "@/lib/api";
import { toFa } from "@/lib/format";
import type { DiningTable } from "@/lib/types";
import { Badge, Button, Card, ConfirmDialog, Field, Icon, IconButton, Input, Modal, cn, useToast } from "@/components/ui";

const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
type Col = ReturnType<typeof useCollection<DiningTable>>;

/** Add / edit / delete the restaurant's tables right from the order screen. */
export function TableManager({ open, onClose, tables, onRemoved }: { open: boolean; onClose: () => void; tables: Col; onRemoved?: (id: number) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [form, setForm] = useState({ name: "", zone: "", capacity: "4" });
  const [bulk, setBulk] = useState({ prefix: "میز", from: "1", count: "6", zone: "", capacity: "4" });
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", zone: "", capacity: "4" });
  const [del, setDel] = useState<DiningTable | null>(null);
  const [busy, setBusy] = useState(false);

  const zones = useMemo(() => [...new Set(tables.items.map((t) => t.zone))], [tables.items]);
  const grouped = useMemo(() => zones.map((z) => ({ zone: z, items: tables.items.filter((t) => t.zone === z) })), [zones, tables.items]);
  const nextName = () => {
    const nums = tables.items.map((t) => Number(faToEn(t.name).match(/\d+/)?.[0])).filter(Number.isFinite);
    return `میز ${toFa((nums.length ? Math.max(...nums) : tables.items.length) + 1)}`;
  };
  const cap = (s: string) => Math.max(1, Math.min(100, Number(faToEn(s)) || 1));
  const fail = (e: unknown) => toast((e as Error).message, "error");

  async function add() {
    const name = form.name.trim() || nextName();
    const payload = { name, zone: form.zone.trim() || zones[0] || "سالن اصلی", capacity: cap(form.capacity) };
    try {
      await tables.create(payload, { ...payload, openOrder: null });
      toast(`«${name}» اضافه شد`);
      setForm({ name: "", zone: form.zone, capacity: form.capacity });
    } catch (e) { fail(e); }
  }
  async function addBulk() {
    setBusy(true);
    try {
      const r = await api<{ item: { added: number; skipped: number } }>("/api/r/tablebulk", { method: "POST", body: { prefix: bulk.prefix, from: Number(faToEn(bulk.from)), count: Number(faToEn(bulk.count)), zone: bulk.zone || zones[0] || "سالن اصلی", capacity: cap(bulk.capacity) } });
      tables.reload(true);
      toast(`${toFa(r.item.added)} میز اضافه شد${r.item.skipped ? ` (${toFa(r.item.skipped)} مورد تکراری رد شد)` : ""}`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function saveEdit(t: DiningTable) {
    const payload = { name: draft.name.trim(), zone: draft.zone.trim() || "سالن اصلی", capacity: cap(draft.capacity) };
    if (!payload.name) return toast("نام میز را وارد کنید", "error");
    setEditId(null);
    try { await tables.update(t.id, payload); toast("تغییرات ذخیره شد"); } catch (e) { fail(e); }
  }
  async function remove(t: DiningTable) {
    try { await tables.remove(t.id); onRemoved?.(t.id); toast(`«${t.name}» حذف شد`); } catch (e) { fail(e); }
  }

  return (
    <Modal open={open} onClose={onClose} title="مدیریت میزها" size="lg" footer={<Button onClick={onClose}>تمام</Button>}>
      <div className="space-y-5">
        <Card className="space-y-3 bg-stone-50 p-4 shadow-none">
          <div className="flex gap-2 text-sm">
            {([["single", "افزودن یک میز"], ["bulk", "افزودن چند میز یک‌جا"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className={cn("rounded-lg px-3.5 py-2 font-semibold", mode === k ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200")}>{l}</button>
            ))}
          </div>
          {mode === "single" ? (
            <div className="grid gap-3 sm:grid-cols-[1.2fr_1.2fr_90px_auto] sm:items-end">
              <Field label="نام میز"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={nextName()} onKeyDown={(e) => e.key === "Enter" && add()} /></Field>
              <Field label="محدوده"><Input list="tm-zones" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder={zones[0] ?? "سالن اصلی"} /></Field>
              <Field label="ظرفیت"><Input inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
              <Button onClick={add}><Icon name="plus" className="size-4" /> افزودن</Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <Field label="پیشوند نام"><Input value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })} /></Field>
              <Field label="شروع شماره"><Input inputMode="numeric" value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} /></Field>
              <Field label="تعداد (حداکثر ۶۰)"><Input inputMode="numeric" value={bulk.count} onChange={(e) => setBulk({ ...bulk, count: e.target.value })} /></Field>
              <Field label="محدوده"><Input list="tm-zones" value={bulk.zone} onChange={(e) => setBulk({ ...bulk, zone: e.target.value })} placeholder={zones[0] ?? "سالن اصلی"} /></Field>
              <Field label="ظرفیت هر میز"><Input inputMode="numeric" value={bulk.capacity} onChange={(e) => setBulk({ ...bulk, capacity: e.target.value })} /></Field>
              <Button onClick={addBulk} loading={busy}><Icon name="plus" className="size-4" /> ساخت {toFa(Number(faToEn(bulk.count)) || 0)} میز</Button>
              <p className="text-[11px] text-stone-500 sm:col-span-3">نمونه: «{bulk.prefix} {toFa(Number(faToEn(bulk.from)) || 1)}» تا «{bulk.prefix} {toFa((Number(faToEn(bulk.from)) || 1) + Math.max(0, (Number(faToEn(bulk.count)) || 1) - 1))}». نام‌های تکراری ساخته نمی‌شوند.</p>
            </div>
          )}
          <datalist id="tm-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
        </Card>

        {tables.items.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">هنوز میزی تعریف نشده؛ از بالا اولین میز را اضافه کنید.</p>
        ) : (
          grouped.map((g) => (
            <section key={g.zone}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-stone-700">{g.zone}<Badge>{toFa(g.items.length)} میز</Badge></h3>
              <div className="divide-y divide-stone-100 overflow-hidden rounded-xl ring-1 ring-stone-200">
                {g.items.map((t) => editId === t.id ? (
                  <div key={t.id} className="grid gap-2 bg-brand-50/50 p-3 sm:grid-cols-[1.2fr_1.2fr_80px_auto] sm:items-center">
                    <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus onKeyDown={(e) => e.key === "Enter" && saveEdit(t)} aria-label="نام" />
                    <Input list="tm-zones" value={draft.zone} onChange={(e) => setDraft({ ...draft, zone: e.target.value })} aria-label="محدوده" />
                    <Input inputMode="numeric" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} aria-label="ظرفیت" />
                    <div className="flex gap-1"><Button size="sm" onClick={() => saveEdit(t)}>ذخیره</Button><Button size="sm" variant="ghost" onClick={() => setEditId(null)}>انصراف</Button></div>
                  </div>
                ) : (
                  <div key={t.id} className={cn("flex items-center gap-3 bg-white px-4 py-2.5 text-sm", t.id < 0 && "opacity-60")}>
                    <span className={cn("size-2.5 shrink-0 rounded-full", t.openOrder ? "bg-amber-500" : "bg-emerald-500")} />
                    <b className="min-w-24">{t.name}</b>
                    <span className="text-xs text-stone-500">{toFa(t.capacity)} نفره</span>
                    {t.openOrder && <Badge color="amber">سفارش #{toFa(t.openOrder.number)} باز است</Badge>}
                    <span className="ms-auto flex">
                      <IconButton icon="edit" label="ویرایش" disabled={t.id < 0} onClick={() => { setEditId(t.id); setDraft({ name: t.name, zone: t.zone, capacity: String(t.capacity) }); }} />
                      <IconButton icon="trash" label="حذف" disabled={t.id < 0} className="hover:bg-rose-50 hover:text-rose-600" onClick={() => setDel(t)} />
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      <ConfirmDialog open={!!del} title="حذف میز" message={del ? `«${del.name}» حذف می‌شود. QR چاپ‌شده‌ی این میز دیگر کار نمی‌کند. سفارش‌های قبلی تغییری نمی‌کنند.` : ""} onClose={() => setDel(null)} onConfirm={() => del && remove(del)} />
    </Modal>
  );
}
