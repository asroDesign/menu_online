"use client";

import { Fragment, useState } from "react";
import { api, useCollection } from "@/lib/api";
import { formatDate, formatNumber, formatPrice, toFa } from "@/lib/format";
import { ResourcePage } from "@/components/resource-page";
import { StockReceiptEditor, type SavedReceipt } from "@/components/stock-receipt-editor";
import { useFeatures } from "@/components/features";
import type { Product } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, PageHeader, Select, Skeleton, cn, useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";

type Item = { id: number; name: string; unit: string; stock: number; minStock: number; costPerUnit: number; warehouseId: number | null };
type Wh = { id: number; name: string; location: string };
const q = (n: number) => toFa(Math.round(n * 100) / 100);
const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

export function Inventory() {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const { has } = useFeatures();
  const wh = useCollection<Wh>("/api/r/warehouses");
  const toast = useToast();
  const [name, setName] = useState("");
  async function addWh() {
    if (!name.trim()) return;
    try { await wh.create({ name: name.trim() }, { name: name.trim(), location: "" }); setName(""); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <ResourcePage<Item>
      key={version}
      title="انبارداری"
      subtitle="مواد اولیه و اقلام مصرفی در انبارهای مختلف با هشدار کمبود موجودی"
      endpoint="/api/r/items"
      emoji=""
      emptyTitle="انبار خالی است"
      emptyDesc="کالا را تعریف کنید یا در یک فاکتور، چند کالای جدید را همراه با موجودی خرید ثبت کنید."
      addLabel="تعریف کالا"
      actions={has("stock_movements") && <Button onClick={() => setReceiptOpen(true)}><Icon name="plus" className="size-4" />ثبت فاکتور / گردش</Button>}
      footer={receiptOpen && <StockReceiptEditor onClose={() => setReceiptOpen(false)} onSaved={() => { setReceiptOpen(false); setVersion((v) => v + 1); }} />}
      search={(r, t) => r.name.includes(t)}
      fields={[
        { key: "name", label: "نام ماده / کالا", required: true },
        { key: "unit", label: "واحد", type: "select", options: ["کیلوگرم", "گرم", "لیتر", "عدد", "بسته", "کارتن"].map((x) => ({ value: x, label: x })) },
        { key: "warehouseId", label: "انبار", remote: { url: "/api/r/warehouses", label: (r: Wh) => r.name, none: "بدون انبار" } },
        { key: "minStock", label: "حداقل موجودی (هشدار)", type: "number", initial: "0" },
      ]}
      header={({ items }) => (
        <>
          <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs leading-6 text-emerald-900">تعریف کالا فقط نام، واحد و انبار را ثبت می‌کند. برای ورود موجودی و قیمت خرید از «ثبت فاکتور / گردش» استفاده کنید؛ کالای جدید را می‌توانید داخل همان فاکتور تعریف کنید.</p>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Card className="p-4"><p className="text-xs text-stone-500">تعداد اقلام</p><p className="mt-1 text-xl font-extrabold">{formatNumber(items.length)}</p></Card>
            <Card className="p-4"><p className="text-xs text-stone-500">ارزش کل موجودی</p><p className="mt-1 text-xl font-extrabold">{formatPrice(items.reduce((s, i) => s + Math.max(0, i.stock) * i.costPerUnit, 0))}</p></Card>
            <Card className="p-4"><p className="text-xs text-stone-500">کمبود موجودی</p><p className={cn("mt-1 text-xl font-extrabold", items.some((i) => i.stock <= i.minStock) ? "text-rose-600" : "text-emerald-600")}>{formatNumber(items.filter((i) => i.stock <= i.minStock).length)} قلم</p></Card>
          </div>
          <Card className="mb-5 p-4">
            <p className="mb-3 text-sm font-bold"><IconText>{<EmojiIcon emoji="" />}</IconText> انبارها</p>
            <div className="flex flex-wrap items-center gap-2">
              {wh.items.map((w) => <span key={w.id} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-1 pe-1 ps-3 text-sm">{w.name}<button aria-label="حذف" className="flex size-6 items-center justify-center rounded-full text-stone-400 hover:bg-rose-100 hover:text-rose-600" onClick={() => wh.remove(w.id).catch((e) => toast(e.message, "error"))}><Icon name="x" className="size-3.5" /></button></span>)}
              <Input className="h-9 w-40" placeholder="انبار جدید…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addWh()} />
              <Button size="sm" variant="secondary" onClick={addWh}>افزودن</Button>
            </div>
          </Card>
        </>
      )}
      columns={[
        { label: "ماده", render: (r) => <div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-400">{wh.items.find((w) => w.id === r.warehouseId)?.name ?? "بدون انبار"}</p></div> },
        { label: "موجودی", render: (r) => <span className={cn("font-bold", r.stock <= r.minStock && "text-rose-600")}>{q(r.stock)} {r.unit} {r.stock <= r.minStock && <Badge color="rose">کمبود</Badge>}</span> },
        { label: "حداقل", render: (r) => `${q(r.minStock)} ${r.unit}` },
        { label: "قیمت واحد", render: (r) => formatPrice(r.costPerUnit) },
        { label: "ارزش", render: (r) => formatPrice(Math.max(0, r.stock) * r.costPerUnit) },
      ]}
    />
  );
}

type Mv = { id: number; itemId: number; itemName: string; unit: string; type: string; delta: number; balanceAfter: number; note: string; createdAt: string; supplierName?: string | null; invoiceNo?: string; receiptId?: number | null; documentId?: number | null; receiptTotal?: number | null };
const MV: Record<string, [string, string]> = { in: ["ورود (خرید)", "emerald"], out: ["خروج / مصرف", "amber"], waste: ["ضایعات", "rose"], adjust: ["تعدیل", "blue"], sale: ["مصرف فروش", "violet"] };

export function StockMovements() {
  const mv = useCollection<Mv>("/api/r/stock");
  const items = useCollection<Item>("/api/r/items");
  const toast = useToast();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedReceipt | null>(null);
  const rows = mv.items.filter((m) => filter === "all" || m.type === filter);
  return (
    <div className="animate-fade-in">
      <PageHeader title="فاکتور و گردش انبار" subtitle="خرید چندقلمی، خروج، ضایعات و اصلاح موجودی با ثبت خودکار سند حسابداری" actions={<Button onClick={() => setOpen(true)}><Icon name="plus" className="size-4" /> ثبت فاکتور / گردش</Button>} />
      {saved && <div className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">رسید انبار #{toFa(saved.id)} ثبت شد · {formatPrice(saved.total)}{saved.documentId && <a className="ms-3 font-bold underline" href={`/print/doc/${saved.documentId}`} target="_blank" rel="noreferrer">مشاهده سند حسابداری</a>}</div>}
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">{[["all", "همه"], ...Object.entries(MV).map(([k, v]) => [k, v[0]])].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={cn("shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium", filter === k ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200")}>{l}</button>)}</div>
      <IconText>{mv.loading ? <Skeleton className="h-64 rounded-2xl" /> : mv.error ? <ErrorState message={mv.error} onRetry={() => mv.reload()} /> : rows.length === 0 ? <EmptyState emoji="" title="گردشی ثبت نشده" description="ورود کالا از خرید، مصرف و ضایعات را اینجا ثبت کنید. مصرف فروش خودکار ثبت می‌شود." /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b bg-stone-50/70 text-xs text-stone-500"><th className="p-3 text-start">زمان</th><th className="p-3 text-start">ماده</th><th className="p-3 text-start">نوع</th><th className="p-3 text-start">مقدار</th><th className="p-3 text-start">موجودی پس از</th><th className="p-3 text-start">فاکتور / سند</th><th className="p-3 text-start">شرح</th></tr></thead><tbody className="divide-y divide-stone-100">{rows.map((m) => <tr key={m.id}><td className="p-3 text-xs text-stone-500">{formatDate(m.createdAt)}</td><td className="p-3 font-semibold">{m.itemName}</td><td className="p-3"><Badge color={MV[m.type]?.[1]}>{MV[m.type]?.[0]}</Badge></td><td className="p-3 font-bold" dir="ltr"><span className={m.delta >= 0 ? "text-emerald-600" : "text-rose-600"}>{m.delta >= 0 ? "+" : "-"}{q(Math.abs(m.delta))} {m.unit}</span></td><td className="p-3">{q(m.balanceAfter)} {m.unit}</td><td className="p-3 text-xs">{m.receiptId ? <div className="space-y-1"><p>رسید #{toFa(m.receiptId)}</p>{m.receiptTotal != null && <p className="text-stone-500">جمع فاکتور: {formatPrice(m.receiptTotal)}</p>}{m.documentId && <a className="font-semibold text-emerald-700 underline" href={`/print/doc/${m.documentId}`} target="_blank" rel="noreferrer">سند حسابداری</a>}</div> : "—"}</td><td className="p-3 text-xs text-stone-500">{m.supplierName && <b className="me-1 text-stone-700">{m.supplierName}</b>}{m.invoiceNo && <span className="me-1">(فاکتور {m.invoiceNo})</span>}{m.note}</td></tr>)}</tbody></table></Card>
      )}</IconText>
      {open && <StockReceiptEditor onClose={() => setOpen(false)} onSaved={(receipt) => { setSaved(receipt); setOpen(false); mv.reload(true); items.reload(true); }} />}
    </div>
  );
}

export function StockControl() {
  const items = useCollection<Item>("/api/r/items");
  const toast = useToast();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const short = items.items.filter((i) => i.stock <= i.minStock);
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
            {short.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{short.map((i) => <div key={i.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-rose-100"><p className="font-bold">{i.name}</p><p className="mt-1 text-xs text-stone-500">موجودی {q(i.stock)} {i.unit} · حداقل {q(i.minStock)}</p><p className="mt-1 text-xs font-semibold text-rose-600">پیشنهاد خرید: {q(Math.max(0, i.minStock * 2 - i.stock))} {i.unit} (≈ {formatPrice(Math.max(0, i.minStock * 2 - i.stock) * i.costPerUnit)})</p></div>)}</div>}
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

type Rc = { id: number; productId: number; itemId: number; quantity: number };
export function Recipes() {
  const prods = useCollection<Product>("/api/products");
  const items = useCollection<Item>("/api/r/items");
  const rc = useCollection<Rc>("/api/r/recipes");
  const toast = useToast();
  const [sel, setSel] = useState<number | null>(null);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const cur = sel ?? prods.items[0]?.id ?? null;
  const cost = (pid: number) => rc.items.filter((r) => r.productId === pid).reduce((s, r) => s + r.quantity * (items.items.find((i) => i.id === r.itemId)?.costPerUnit ?? 0), 0);
  async function add() {
    const iid = Number(itemId || items.items[0]?.id);
    const n = Number(faToEn(qty));
    if (!cur || !iid || !(n > 0)) return toast("مقدار را وارد کنید", "error");
    try { await rc.create({ productId: cur, itemId: iid, quantity: n }, { productId: cur, itemId: iid, quantity: n }); setQty(""); } catch (e) { toast((e as Error).message, "error"); }
  }
  const loading = prods.loading || items.loading || rc.loading;
  return (
    <div className="animate-fade-in">
      <PageHeader title="فرمول ساخت" subtitle="مواد اولیه‌ی هر محصول را تعریف کنید؛ با هر فروش، مصرف از انبار کم می‌شود" />
      <IconText>{loading ? <Skeleton className="h-80 rounded-2xl" /> : prods.items.length === 0 || items.items.length === 0 ? <EmptyState emoji="" title="ابتدا محصول و مواد اولیه تعریف کنید" description="برای تعریف فرمول، هم به محصول در منو و هم به ماده در انبار نیاز دارید." /> : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <Card className="max-h-[600px] overflow-y-auto p-2">{prods.items.map((p) => {
            const n = rc.items.filter((r) => r.productId === p.id).length;
            return <button key={p.id} onClick={() => setSel(p.id)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm", cur === p.id ? "bg-brand-50 font-bold text-brand-700" : "hover:bg-stone-50")}><span className="text-lg">{<EmojiIcon emoji={p.emoji} /> }</span><span className="flex-1 truncate">{p.name}</span>{n ? <Badge color="emerald">{toFa(n)}</Badge> : <Badge>—</Badge>}</button>;
          })}</Card>
          <Card className="p-5">
            {(() => {
              const p = prods.items.find((x) => x.id === cur)!;
              const lines = rc.items.filter((r) => r.productId === cur);
              const c = cost(cur!);
              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-extrabold">{<EmojiIcon emoji={p.emoji} /> } {p.name}</h3><div className="text-xs text-stone-500">قیمت فروش <b className="text-stone-800">{formatPrice(p.price)}</b> · بهای ماده <b className="text-stone-800">{formatPrice(Math.round(c))}</b></div></div>
                  <div className="mt-4 space-y-2">{lines.length === 0 && <p className="rounded-xl bg-stone-50 p-6 text-center text-sm text-stone-400">هنوز ماده‌ای برای این محصول تعریف نشده.</p>}{lines.map((r) => { const it = items.items.find((i) => i.id === r.itemId); return <div key={r.id} className={cn("flex items-center gap-3 rounded-xl bg-stone-50 px-4 py-3 text-sm", r.id < 0 && "opacity-60")}><span className="flex-1 font-semibold">{it?.name}</span><span>{q(r.quantity)} {it?.unit}</span><span className="w-28 text-end text-xs text-stone-500">{formatPrice(Math.round(r.quantity * (it?.costPerUnit ?? 0)))}</span><IconButton icon="trash" label="حذف" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => rc.remove(r.id).catch((e) => toast(e.message, "error"))} /></div>; })}</div>
                  <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4">
                    <Field label="ماده‌ی اولیه" className="min-w-48 flex-1"><Select value={itemId || String(items.items[0].id)} onChange={(e) => setItemId(e.target.value)}>{items.items.filter((i) => !lines.some((l) => l.itemId === i.id)).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</Select></Field>
                    <Field label="مقدار برای ۱ واحد محصول" className="w-44"><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.15" /></Field>
                    <Button onClick={add}><Icon name="plus" className="size-4" /> افزودن</Button>
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

type Cost = { id: number; name: string; emoji: string; price: number; cost: number; hasRecipe: boolean; margin: number; marginPct: number; lines: { name: string; unit: string; qty: number; cost: number }[] };
export function Costing() {
  const col = useCollection<Cost>("/api/r/costing");
  const [open, setOpen] = useState<number | null>(null);
  const withR = col.items.filter((c) => c.hasRecipe);
  const avg = withR.length ? Math.round(withR.reduce((s, c) => s + c.marginPct, 0) / withR.length) : 0;
  return (
    <div className="animate-fade-in">
      <PageHeader title="بهای تمام‌شده" subtitle="هزینه‌ی واقعی هر محصول بر اساس فرمول ساخت و قیمت روز مواد اولیه، و حاشیه‌ی سود" />
      <IconText>{col.loading ? <Skeleton className="h-72 rounded-2xl" /> : col.error ? <ErrorState message={col.error} onRetry={() => col.reload()} /> : col.items.length === 0 ? <EmptyState emoji="" title="محصولی وجود ندارد" description="ابتدا محصولات و فرمول ساخت را تعریف کنید." /> : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3"><Card className="p-4"><p className="text-xs text-stone-500">محصولات دارای فرمول</p><p className="mt-1 text-xl font-extrabold">{toFa(withR.length)} از {toFa(col.items.length)}</p></Card><Card className="p-4"><p className="text-xs text-stone-500">میانگین حاشیه سود</p><p className="mt-1 text-xl font-extrabold text-emerald-600">{toFa(avg)}٪</p></Card><Card className="p-4"><p className="text-xs text-stone-500">کم‌سودترین محصول</p><p className="mt-1 truncate text-base font-extrabold">{[...withR].sort((a, b) => a.marginPct - b.marginPct)[0]?.name ?? "—"}</p></Card></div>
          <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b bg-stone-50/70 text-xs text-stone-500"><th className="p-3 text-start">محصول</th><th className="p-3 text-start">قیمت فروش</th><th className="p-3 text-start">بهای تمام‌شده</th><th className="p-3 text-start">سود</th><th className="p-3 text-start">حاشیه</th></tr></thead><tbody>{[...col.items].sort((a, b) => Number(b.hasRecipe) - Number(a.hasRecipe) || a.marginPct - b.marginPct).map((c) => (
            <Fragment key={c.id}>
              <tr className="cursor-pointer border-t border-stone-100 hover:bg-stone-50/60" onClick={() => c.hasRecipe && setOpen(open === c.id ? null : c.id)}>
                <td className="p-3 font-semibold">{<EmojiIcon emoji={c.emoji} /> } {c.name}</td><td className="p-3">{formatPrice(c.price)}</td>
                {c.hasRecipe ? <><td className="p-3">{formatPrice(c.cost)}</td><td className="p-3 font-bold">{formatPrice(c.margin)}</td><td className="p-3"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-stone-100"><div className={cn("h-full rounded-full", c.marginPct < 40 ? "bg-rose-400" : c.marginPct < 60 ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${Math.max(0, Math.min(100, c.marginPct))}%` }} /></div><span className="text-xs font-bold">{toFa(c.marginPct)}٪</span></div></td></> : <td colSpan={3} className="p-3 text-xs text-stone-400">فرمول ساخت تعریف نشده</td>}
              </tr>
              {open === c.id && <tr className="bg-stone-50"><td colSpan={5} className="p-4"><div className="flex flex-wrap gap-2">{c.lines.map((l) => <Badge key={l.name}>{l.name}: {q(l.qty)} {l.unit} ≈ {formatPrice(l.cost)}</Badge>)}</div></td></tr>}
            </Fragment>
          ))}</tbody></table></Card>
        </>
      )}</IconText>
    </div>
  );
}
