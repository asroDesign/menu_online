"use client";

import { useEffect, useMemo, useState } from "react";
import { api, useCollection } from "@/lib/api";
import { formatPrice, statusInfo, toFa } from "@/lib/format";
import type { Category, DiningTable, Order, Product, StaffMember } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Modal,
  PageHeader,
  ProductThumb,
  Select,
  Skeleton,
  Textarea,
  cn,
  useToast,
} from "@/components/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFeatures } from "@/components/features";
import { MapPicker } from "@/components/map-picker";
import { TableManager } from "@/components/table-manager";

type Cart = Record<number, number>;

export default function WaiterPage({ mode = "waiter" }: { mode?: "waiter" | "cashier" }) {
  const f = useFeatures();
  const sp = useSearchParams();
  const products = useCollection<Product>("/api/products");
  const categories = useCollection<Category>("/api/categories");
  const tables = useCollection<DiningTable>("/api/tables", { poll: 10000 });
  const staff = useCollection<StaffMember>("/api/staff");
  const toast = useToast();

  const [tax, setTax] = useState({ taxPercent: 0, servicePercent: 0 });
  const [cart, setCart] = useState<Cart>({});
  const [tableId, setTableId] = useState<number | "takeaway" | "delivery" | null>(sp.get("phone") && f.has("delivery_order") ? "delivery" : null);
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
  const canManageTables = f.has(["self_order", "cashier_pos"]) && (f.isManager || f.role === "cashier");
  const [bizLoc, setBizLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ code: string; amount: number } | null>(null);
  const [useCashback, setUseCashback] = useState(false);
  const [member, setMember] = useState<{ exists: boolean; balance: number } | null>(null);
  const [payMethod, setPayMethod] = useState<"later" | "cash" | "pos" | "card">(mode === "cashier" ? "cash" : "later");

  useEffect(() => {
    api<{ item: { taxPercent: number; servicePercent: number; slug: string; lat: number | null; lng: number | null } }>("/api/business").then((r) => {
      if (r.item.lat != null && r.item.lng != null) setBizLoc({ lat: r.item.lat, lng: r.item.lng });
      setTax({ taxPercent: r.item.taxPercent, servicePercent: r.item.servicePercent });
      setSlug(r.item.slug);
    });
    api<{ items: { id: number; name: string; fee: number; radiusKm: number }[] }>("/api/r/zones").then((r) => setZones(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    const p = phone.trim();
    if (!slug || !f.has("cashback") || p.length < 10) { setMember(null); setUseCashback(false); return; }
    let live = true;
    const h = setTimeout(() => { api<{ exists: boolean; balance: number }>(`/api/public/${slug}/customer?phone=${encodeURIComponent(p)}`).then((r) => { if (live) { setMember(r); if (!(r.exists && r.balance > 0)) setUseCashback(false); } }).catch(() => {}); }, 400);
    return () => { live = false; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, slug]);

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

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.items.find((p) => p.id === Number(id))!, qty }))
    .filter((l) => l.product);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const disc = applied ? Math.min(applied.amount, subtotal) : 0;
  const isDelivery = tableId === "delivery";
  const fee = isDelivery ? (zones.find((z) => String(z.id) === zoneId)?.fee ?? 0) : 0;
  const taxAmt = Math.round(((subtotal - disc) * tax.taxPercent) / 100);
  const svc = isDelivery ? 0 : Math.round(((subtotal - disc) * tax.servicePercent) / 100);
  const total = subtotal - disc + taxAmt + svc + fee;

  async function applyCode() {
    try {
      const r = await api<{ code: string; amount: number }>(`/api/public/${slug}/discount?code=${encodeURIComponent(code)}&subtotal=${subtotal}`);
      setApplied(r);
      toast(`کد تخفیف اعمال شد: ${formatPrice(r.amount)}`);
    } catch (e) {
      setApplied(null);
      toast((e as Error).message, "error");
    }
  }

  const add = (id: number, d = 1) =>
    setCart((c) => {
      const next = { ...c };
      const v = (next[id] ?? 0) + d;
      if (v <= 0) delete next[id];
      else next[id] = Math.min(50, v);
      return next;
    });

  async function submit() {
    if (!lines.length) return;
    if (tableId === null) {
      toast("ابتدا میز یا بیرون‌بر را انتخاب کنید", "error");
      setSheet(false);
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
        type: tableId === "takeaway" ? "takeaway" : tableId === "delivery" ? "delivery" : "dine_in",
        tableId: typeof tableId === "number" ? tableId : null,
        customerPhone: phone,
        address,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
        zoneId: zoneId ? Number(zoneId) : null,
        scheduledFor: scheduled ? new Date(scheduled).toISOString() : null,
        discountCode: applied?.code ?? "",
        useCashback,
        payNow: mode === "cashier" && payMethod !== "later" ? payMethod : null,
        source: mode,
        waiterId: waiterId ? Number(waiterId) : null,
        customerName,
        note,
        appendTo: open && append ? open.id : null,
      };
      const { item } = await api<{ item: Order }>("/api/orders", { method: "POST", body });
      toast(open && append ? `به سفارش #${toFa(item.number)} اضافه شد` : `سفارش #${toFa(item.number)} ثبت شد ✅`);
      setCart({});
      setNote("");
      setCustomerName("");
      setPhone("");
      setAddress("");
      setPin(null);
      setCode("");
      setApplied(null);
      setScheduled("");
      setUseCashback(false);
      setSheet(false);
      tables.reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const loading = products.loading || categories.loading || tables.loading;

  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-stone-100 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">سفارش جاری</h3>
          {count > 0 && (
            <button className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setCart({})}>
              خالی کردن
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={waiterId} onChange={(e) => setWaiterId(e.target.value)} aria-label="گارسون">
            <option value="">گارسون…</option>
            {waiters.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
          <Input placeholder="نام مشتری (اختیاری)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </div>
        <div className={cn("flex items-center justify-between rounded-xl px-3 py-2 text-sm", tableId === null ? "bg-rose-50 text-rose-700" : "bg-brand-50 text-brand-800")}>
          <span className="font-semibold">
            {tableId === null ? "میز انتخاب نشده" : tableId === "takeaway" ? "🛍️ بیرون‌بر" : tableId === "delivery" ? "🛵 ارسال با پیک" : `🪑 ${selectedTable?.name}`}
          </span>
          {open && (
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={append} onChange={(e) => setAppend(e.target.checked)} className="accent-brand-500" />
              افزودن به #{toFa(open.number)}
            </label>
          )}
        </div>
      </div>

      <div className="min-h-32 flex-1 overflow-y-auto p-4">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-8 text-center text-stone-400">
            <Icon name="cart" className="mb-2 size-10" />
            <p className="text-sm">برای افزودن، روی محصولات بزنید</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {lines.map(({ product: p, qty }) => (
              <li key={p.id} className="flex items-center gap-3 animate-pop">
                <ProductThumb imageUrl={p.imageUrl} emoji={p.emoji} className="size-12 shrink-0 rounded-xl text-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-stone-500">{formatPrice(p.price * qty)}</p>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-0.5">
                  <button className="flex size-7 items-center justify-center rounded-md hover:bg-white" onClick={() => add(p.id, -1)} aria-label="کم">
                    <Icon name={qty === 1 ? "trash" : "minus"} className="size-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{toFa(qty)}</span>
                  <button className="flex size-7 items-center justify-center rounded-md hover:bg-white" onClick={() => add(p.id, 1)} aria-label="زیاد">
                    <Icon name="plus" className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-stone-100 p-4">
        {(f.has("loyalty") || isDelivery) && (
          <Input inputMode="tel" dir="ltr" className="text-left" placeholder="موبایل مشتری (باشگاه مشتریان)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        )}
        {isDelivery && (
          <div className="space-y-2">
            <Textarea rows={2} placeholder="آدرس تحویل *" value={address} onChange={(e) => setAddress(e.target.value)} />
            <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => setMapOpen(true)}>{pin ? "📍 موقعیت روی نقشه ثبت شد (تغییر)" : "📍 انتخاب محل تحویل روی نقشه"}</Button>
            {f.has("zones") && zones.length > 0 && (
              <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">محدوده ارسال…</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {formatPrice(z.fee)}</option>)}
              </Select>
            )}
          </div>
        )}
        {f.has("preorder") && (
          <label className="block text-xs font-semibold text-stone-600">پیش‌سفارش (اختیاری)
            <Input type="datetime-local" className="mt-1" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </label>
        )}
        {f.has("discount") && (
          <div className="flex gap-2">
            <Input dir="ltr" className="text-left uppercase" placeholder="کد تخفیف" value={code} onChange={(e) => { setCode(e.target.value); setApplied(null); }} />
            <Button variant="secondary" onClick={applyCode} disabled={!code.trim() || !subtotal}>اعمال</Button>
          </div>
        )}
        {f.has("cashback") && phone.trim().length >= 10 && (
          member?.exists && member.balance > 0 ? <label className="flex items-center gap-2 text-xs text-emerald-700"><input type="checkbox" className="accent-emerald-600" checked={useCashback} onChange={(e) => setUseCashback(e.target.checked)} /> استفاده از اعتبار کش‌بک ({formatPrice(member.balance)})</label>
          : <p className="text-[11px] text-stone-500">{member === null ? "بررسی عضویت…" : member.exists ? "اعتبار کش‌بک این مشتری صفر است" : "مشتری در باشگاه ثبت نشده؛ کش‌بک فقط برای مشتریان قبلی قابل استفاده است"}</p>
        )}
        {mode === "cashier" && (
          <div className="grid grid-cols-4 gap-1.5 text-xs font-semibold">
            {([["cash", "💵 نقد"], ["pos", "💳 پوز"], ["card", "🏦 کارت"], ["later", "⏳ بعداً"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPayMethod(k)} className={cn("rounded-lg py-2 ring-1 transition", payMethod === k ? "bg-stone-900 text-white ring-stone-900" : "bg-white ring-stone-200")}>{l}</button>
            ))}
          </div>
        )}
        <Textarea rows={2} placeholder="توضیحات سفارش (مثلاً بدون پیاز)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="space-y-1 text-sm text-stone-600">
          <div className="flex justify-between"><span>جمع اقلام</span><span>{formatPrice(subtotal)}</span></div>
          {disc > 0 && <div className="flex justify-between text-emerald-600"><span>تخفیف ({applied?.code})</span><span>-{formatPrice(disc)}</span></div>}
          {fee > 0 && <div className="flex justify-between"><span>هزینه ارسال</span><span>{formatPrice(fee)}</span></div>}
          {tax.taxPercent > 0 && <div className="flex justify-between"><span>مالیات ({toFa(tax.taxPercent)}٪)</span><span>{formatPrice(taxAmt)}</span></div>}
          {tax.servicePercent > 0 && <div className="flex justify-between"><span>خدمات ({toFa(tax.servicePercent)}٪)</span><span>{formatPrice(svc)}</span></div>}
          <div className="flex justify-between pt-1 text-base font-extrabold text-stone-900"><span>مبلغ نهایی</span><span>{formatPrice(total)}</span></div>
        </div>
        <Button size="lg" className="w-full" disabled={!lines.length} loading={submitting} onClick={submit}>
          {open && append && typeof tableId === "number" ? "افزودن به سفارش میز" : mode === "cashier" && payMethod !== "later" ? "ثبت سفارش و دریافت وجه" : "ثبت و ارسال به آشپزخانه"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in pb-24 lg:pb-0">
      <PageHeader title={mode === "cashier" ? "سفارش‌گیر صندوق" : "پنل گارسون"} subtitle={mode === "cashier" ? "ثبت سریع سفارش و دریافت وجه (نقد، پوز، کارت)" : "میز را انتخاب کنید، محصولات را لمس کنید و سفارش را ثبت کنید"} />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          {/* Tables */}
          <section className="mb-5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-stone-700">۱. انتخاب میز</h2>
              {canManageTables && <Button size="sm" variant="secondary" onClick={() => setTmOpen(true)}><Icon name="edit" className="size-4" /> مدیریت میزها</Button>}
            </div>
            {loading ? (
              <div className="flex gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-24 shrink-0 rounded-xl" />)}</div>
            ) : tables.items.length === 0 ? (
              <EmptyState emoji="🪑" title="هنوز میزی تعریف نشده" description="برای سفارش‌گیری سالن ابتدا میزها را اضافه کنید یا از گزینه بیرون‌بر استفاده کنید." action={canManageTables ? <Button size="sm" onClick={() => setTmOpen(true)}>افزودن میز</Button> : undefined} />
            ) : null}
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              <button
                onClick={() => setTableId("takeaway")}
                className={cn("flex h-16 w-24 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-semibold ring-1 transition", tableId === "takeaway" ? "bg-brand-500 text-white ring-brand-500 shadow-md" : "bg-white ring-stone-200 hover:ring-brand-300")}
              >
                <span className="text-lg">🛍️</span>بیرون‌بر
              </button>
              {f.has("delivery_order") && (
                <button
                  onClick={() => setTableId("delivery")}
                  className={cn("flex h-16 w-24 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-semibold ring-1 transition", tableId === "delivery" ? "bg-brand-500 text-white ring-brand-500 shadow-md" : "bg-white ring-stone-200 hover:ring-brand-300")}
                >
                  <span className="text-lg">🛵</span>دلیوری
                </button>
              )}
              {tables.items.map((t) => {
                const busy = !!t.openOrder;
                const sel = tableId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTableId(t.id)}
                    className={cn(
                      "relative flex h-16 w-24 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-semibold ring-1 transition",
                      sel ? "bg-brand-500 text-white ring-brand-500 shadow-md" : busy ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-white ring-stone-200 hover:ring-brand-300",
                    )}
                  >
                    <span>{t.name}</span>
                    <span className={cn("text-[10px] font-normal", sel ? "text-white/80" : busy ? "text-amber-700" : "text-stone-400")}>
                      {busy ? statusInfo(t.openOrder!.status).short : `${toFa(t.capacity)} نفره`}
                    </span>
                    <span className={cn("absolute end-2 top-2 size-2 rounded-full", busy ? "bg-amber-500" : "bg-emerald-500")} />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Products */}
          <section>
            <h2 className="mb-2.5 text-sm font-bold text-stone-700">۲. انتخاب محصولات</h2>
            <div className="sticky top-14 z-10 -mx-4 mb-4 space-y-3 bg-[#f6f5f3]/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0 lg:top-0">
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                <Input className="ps-9" placeholder="جستجوی محصول…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {[{ id: "all" as const, name: "همه", emoji: "✨" }, ...cats].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCatId(c.id)}
                    className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition", catId === c.id ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50")}
                  >
                    {c.emoji} {c.name}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
            ) : products.items.length === 0 ? (
              <EmptyState emoji="🍽️" title="منو خالی است" description="ابتدا محصولاتی به منو اضافه کنید." action={<Link href="/dashboard/products"><Button size="sm">افزودن محصول</Button></Link>} />
            ) : visible.length === 0 ? (
              <EmptyState emoji="🔍" title="محصولی پیدا نشد" description="عبارت جستجو یا دسته‌بندی را تغییر دهید." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visible.map((p) => {
                  const qty = cart[p.id] ?? 0;
                  return (
                    <Card key={p.id} className={cn("group relative overflow-hidden transition", qty > 0 && "ring-2 ring-brand-400")}>
                      <button className="block w-full text-start" onClick={() => add(p.id)}>
                        <ProductThumb imageUrl={p.imageUrl} emoji={p.emoji} className="h-28 w-full" />
                        <div className="p-3">
                          <p className="truncate text-sm font-bold">{p.name}</p>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-xs font-bold text-brand-600">{formatPrice(p.price)}</span>
                            {p.isFeatured && <Badge color="amber">⭐</Badge>}
                          </div>
                        </div>
                      </button>
                      {qty > 0 && (
                        <div className="absolute start-2 top-2 flex items-center gap-1 rounded-full bg-brand-500 px-1 py-0.5 text-white shadow-lg animate-pop">
                          <button className="flex size-6 items-center justify-center rounded-full hover:bg-white/20" onClick={() => add(p.id, -1)} aria-label="کم"><Icon name="minus" className="size-3.5" /></button>
                          <span className="min-w-4 text-center text-xs font-bold">{toFa(qty)}</span>
                          <button className="flex size-6 items-center justify-center rounded-full hover:bg-white/20" onClick={() => add(p.id)} aria-label="زیاد"><Icon name="plus" className="size-3.5" /></button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Desktop cart */}
        <aside className="hidden lg:block">
          <Card className="sticky top-6 h-[calc(100dvh-3rem)] overflow-hidden">{cartPanel}</Card>
        </aside>
      </div>

      {/* Mobile cart bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 p-3 lg:hidden">
        <button
          onClick={() => setSheet(true)}
          className="flex w-full items-center justify-between rounded-2xl bg-stone-900 px-4 py-3.5 text-white shadow-2xl"
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
        <div className="-mx-5 -my-5 h-[70dvh]">{cartPanel}</div>
      </Modal>
      <TableManager open={tmOpen} onClose={() => setTmOpen(false)} tables={tables} onRemoved={(id) => setTableId((cur) => (cur === id ? null : cur))} />
      <Modal open={mapOpen} onClose={() => setMapOpen(false)} title="محل تحویل روی نقشه" size="lg" footer={<><Button variant="ghost" onClick={() => { setPin(null); setMapOpen(false); }}>حذف موقعیت</Button><Button onClick={() => setMapOpen(false)}>تأیید</Button></>}>
        <MapPicker value={pin} height={380} onChange={(lat, lng) => setPin({ lat, lng })} onAddress={(a) => setAddress((cur) => cur.trim() ? cur : a)} origin={bizLoc} radii={zones.map((z) => z.radiusKm).filter((r) => r > 0)} />
      </Modal>
    </div>
  );
}
