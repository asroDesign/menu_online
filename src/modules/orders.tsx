"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/api";
import {
  ACTIVE_STATUSES,
  formatDate,
  formatPrice,
  formatTime,
  ORDER_STATUSES,
  SOURCES,
  statusInfo,
  timeAgo,
  toFa,
} from "@/lib/format";
import type { Order, StaffMember } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  cn,
  useToast,
} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { DELIVERY_STATUS } from "@/lib/admin-meta";
import { MapPicker } from "@/components/map-picker";
import { useFeatures } from "@/components/features";
import { api } from "@/lib/api";

const TABS = [
  { key: "active", label: "فعال" },
  { key: "all", label: "همه" },
  ...ORDER_STATUSES.map((s) => ({ key: s.key, label: s.short })),
];

const stripe: Record<string, string> = {
  pending: "bg-amber-400",
  preparing: "bg-blue-400",
  ready: "bg-violet-400",
  served: "bg-teal-400",
  paid: "bg-emerald-400",
  canceled: "bg-rose-400",
};

export default function OrdersPage() {
  const orders = useCollection<Order>("/api/orders?limit=300", { poll: 8000 });
  const staff = useCollection<StaffMember>("/api/staff");
  const couriers = useCollection<{ id: number; name: string; status: string; activeCount: number; vehicle: string }>("/api/r/couriers");
  const toast = useToast();
  const feat = useFeatures();
  const [tab, setTab] = useState("active");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Order | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.items.length, active: 0 };
    for (const o of orders.items) {
      c[o.status] = (c[o.status] ?? 0) + 1;
      if (ACTIVE_STATUSES.includes(o.status)) c.active++;
    }
    return c;
  }, [orders.items]);

  const filtered = useMemo(() => {
    const term = q.trim();
    return orders.items.filter((o) => {
      if (tab === "active" ? !ACTIVE_STATUSES.includes(o.status) : tab !== "all" && o.status !== tab) return false;
      if (!term) return true;
      return (
        String(o.number).includes(term.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) ||
        (o.tableName ?? "").includes(term) ||
        o.customerName.includes(term)
      );
    });
  }, [orders.items, tab, q]);

  const selected = orders.items.find((o) => o.id === selectedId) ?? null;

  async function setStatus(o: Order, status: string) {
    try {
      await orders.update(o.id, { status });
      toast(`سفارش #${toFa(o.number)}: ${statusInfo(status).label}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function del(o: Order) {
    try {
      await orders.remove(o.id);
      setSelectedId(null);
      toast("سفارش حذف شد");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="سفارش‌ها"
        subtitle="سفارش‌های گارسون و مشتریان را لحظه‌ای مدیریت کنید"
        actions={
          <Link href="/dashboard/waiter">
            <Button>
              <Icon name="plus" className="size-4" /> سفارش جدید
            </Button>
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
                tab === t.key ? "bg-stone-900 text-white shadow" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50",
              )}
            >
              {t.label}
              <span className={cn("rounded-md px-1.5 text-[11px] font-bold", tab === t.key ? "bg-white/20" : "bg-stone-100 text-stone-500")}>
                {toFa(counts[t.key] ?? 0)}
              </span>
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-64">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <Input className="ps-9" placeholder="جستجو: شماره، میز، مشتری" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {orders.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : orders.error ? (
        <ErrorState message={orders.error} onRetry={() => orders.reload()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          emoji={orders.items.length === 0 ? "🧾" : "🔍"}
          title={orders.items.length === 0 ? "هنوز سفارشی ثبت نشده" : "سفارشی با این فیلتر پیدا نشد"}
          description={
            orders.items.length === 0
              ? "با پنل گارسون اولین سفارش را ثبت کنید یا منتظر سفارش مشتریان از طریق QR باشید."
              : "فیلتر یا عبارت جستجو را تغییر دهید."
          }
          action={
            orders.items.length === 0 && (
              <Link href="/dashboard/waiter">
                <Button>ثبت اولین سفارش</Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((o) => {
            const s = statusInfo(o.status);
            const pendingOpt = o.id < 0;
            return (
              <Card key={o.id} className={cn("relative flex flex-col overflow-hidden animate-pop", pendingOpt && "opacity-60")}>
                <span className={cn("absolute inset-y-0 end-0 w-1", stripe[o.status])} />
                <button className="flex flex-1 flex-col p-4 pe-5 text-start" onClick={() => setSelectedId(o.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-extrabold">#{toFa(o.number)}</p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {formatTime(o.createdAt)} · {timeAgo(o.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge color="brand">{o.type === "takeaway" ? "🛍️ بیرون‌بر" : o.type === "delivery" ? "🛵 ارسال" : `🪑 ${o.tableName ?? "بدون میز"}`}</Badge>
                    <Badge>{o.source === "customer" ? "📱" : o.source === "kiosk" ? "🖥️" : "🧑‍🍳"} {SOURCES[o.source] ?? o.source}</Badge>
                    {o.scheduledFor && <Badge color="violet">⏰ پیش‌سفارش {formatTime(o.scheduledFor)}</Badge>}
                    {o.paymentStatus === "paid" && <Badge color="emerald">💰 پرداخت‌شده</Badge>}
                    {o.type === "delivery" && o.deliveryStatus !== "none" && <Badge color={DELIVERY_STATUS[o.deliveryStatus]?.[1]}>🛵 {DELIVERY_STATUS[o.deliveryStatus]?.[0]}{o.courierName ? ` · ${o.courierName}` : ""}</Badge>}
                    {o.type === "delivery" && o.deliveryStatus === "none" && !["paid", "canceled"].includes(o.status) && <Badge color="amber">🛵 پیک تعیین نشده</Badge>}
                  </div>
                  <ul className="mt-3 flex-1 space-y-1 text-sm text-stone-600">
                    {o.items.slice(0, 3).map((i) => (
                      <li key={i.id} className="flex justify-between gap-2">
                        <span className="truncate">{i.emoji} {i.name}</span>
                        <span className="shrink-0 text-stone-400">×{toFa(i.quantity)}</span>
                      </li>
                    ))}
                    {o.items.length > 3 && <li className="text-xs text-stone-400">+{toFa(o.items.length - 3)} مورد دیگر</li>}
                  </ul>
                  {o.note && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">📝 {o.note}</p>}
                  <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
                    <span className="text-xs text-stone-500">{o.waiterName ? `گارسون: ${o.waiterName}` : o.customerName || "—"}</span>
                    <span className="font-extrabold">{formatPrice(o.total)}</span>
                  </div>
                </button>
                {s.next && (
                  <div className="px-4 pb-4 pe-5">
                    <Button size="sm" className="w-full" disabled={pendingOpt} onClick={() => setStatus(o, s.next!)}>
                      {s.nextLabel}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? `سفارش #${toFa(selected.number)}` : ""}
        size="md"
        footer={
          selected && (
            <>
              <Button variant="ghost" className="me-auto text-rose-600 hover:bg-rose-50" onClick={() => setDeleting(selected)}>
                <Icon name="trash" className="size-4" /> حذف
              </Button>
              <a href={`/print/receipt/${selected.id}`} target="_blank"><Button variant="secondary">🖨️ رسید</Button></a>
              {feat.has("tablet_pos") && selected.paymentStatus !== "paid" && selected.status !== "canceled" && (
                <Button variant="secondary" onClick={() => api("/api/r/posrequests", { method: "POST", body: { orderId: selected.id } }).then(() => toast("مبلغ برای کارتخوان ارسال شد")).catch((e) => toast(e.message, "error"))}>💳 کارتخوان</Button>
              )}
              {selected.status !== "canceled" && selected.status !== "paid" && (
                <Button variant="secondary" onClick={() => setStatus(selected, "canceled")}>
                  لغو سفارش
                </Button>
              )}
              {statusInfo(selected.status).next && (
                <Button onClick={() => setStatus(selected, statusInfo(selected.status).next!)}>{statusInfo(selected.status).nextLabel}</Button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              <Badge color="brand">{selected.type === "takeaway" ? "بیرون‌بر" : selected.type === "delivery" ? "ارسال" : selected.tableName ?? "بدون میز"}</Badge>
              {selected.paymentStatus === "paid" && <Badge color="emerald">پرداخت‌شده ({selected.paymentMethod})</Badge>}
              <span className="text-xs text-stone-500">
                {formatDate(selected.createdAt)} · {formatTime(selected.createdAt)}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl ring-1 ring-stone-200">
              {selected.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 text-sm last:border-0">
                  <span className="min-w-0 truncate">
                    {i.emoji} {i.name} <span className="text-stone-400">×{toFa(i.quantity)}</span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatPrice(i.price * i.quantity)}</span>
                </div>
              ))}
              <div className="space-y-1.5 bg-stone-50 px-4 py-3 text-sm">
                <Row label="جمع اقلام" value={formatPrice(selected.subtotal)} />
                {selected.discountAmount > 0 && <Row label={`تخفیف (${selected.discountCode})`} value={`-${formatPrice(selected.discountAmount)}`} />}
                {selected.deliveryFee > 0 && <Row label="هزینه ارسال" value={formatPrice(selected.deliveryFee)} />}
                {selected.cashbackUsed > 0 && <Row label="اعتبار کش‌بک" value={`-${formatPrice(selected.cashbackUsed)}`} />}
                {selected.tax > 0 && <Row label="مالیات" value={formatPrice(selected.tax)} />}
                {selected.service > 0 && <Row label="خدمات" value={formatPrice(selected.service)} />}
                <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-extrabold">
                  <span>مبلغ نهایی</span>
                  <span>{formatPrice(selected.total)}</span>
                </div>
              </div>
            </div>

            {selected.note && <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">📝 {selected.note}</p>}
            {selected.address && <p className="rounded-xl bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">📍 {selected.address}{selected.customerPhone && <span className="mt-1 block text-xs" dir="ltr" style={{ textAlign: "start" }}>{selected.customerPhone}</span>}{selected.courierName && <span className="mt-1 block text-xs">🛵 پیک: {selected.courierName}</span>}</p>}
            {selected.lat != null && selected.lng != null && <div className="space-y-2"><MapPicker readOnly height={190} value={{ lat: selected.lat, lng: selected.lng }} /><a className="inline-flex items-center gap-1 text-xs font-bold text-brand-600" target="_blank" href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}>🧭 مسیریابی تا مقصد</a></div>}
            {selected.type === "delivery" && selected.status !== "canceled" && (
              <div className="space-y-3 rounded-2xl bg-sky-50/70 p-4 ring-1 ring-sky-200">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-extrabold">🛵 ارسال با پیک</p><Badge color={DELIVERY_STATUS[selected.deliveryStatus]?.[1]}>{DELIVERY_STATUS[selected.deliveryStatus]?.[0]}</Badge></div>
                {(selected.deliveryStatus === "not_home" || selected.deliveryStatus === "failed") && <p className="rounded-xl bg-rose-100 p-3 text-sm font-semibold text-rose-800">{selected.deliveryStatus === "not_home" ? "پیک گزارش داد مشتری در محل حاضر نبود." : "پیک گزارش داد سفارش تحویل داده نشد."}{selected.courierNote && <span className="mt-1 block font-normal">«{selected.courierNote}»</span>} می‌توانید سفارش را به پیک دیگری بسپارید یا لغو کنید.</p>}
                {selected.deliveryStatus === "delivered" ? (
                  <p className="text-sm text-emerald-800">✅ تحویل توسط <b>{selected.courierName}</b>{selected.deliveryFinishedAt && ` در ساعت ${formatTime(selected.deliveryFinishedAt)}`}.</p>
                ) : selected.deliveryStatus === "picked_up" ? (
                  <p className="text-sm text-amber-800">🛵 سفارش در دست <b>{selected.courierName}</b> و در مسیر مشتری است.</p>
                ) : !feat.has("courier") ? <p className="text-xs text-stone-500">قابلیت مدیریت پیک در پلن شما فعال نیست.</p> : couriers.items.length === 0 ? (
                  <p className="text-sm text-stone-600">هنوز پیکی تعریف نشده است. <Link href="/dashboard/couriers" className="font-bold text-brand-600 underline">افزودن پیک</Link></p>
                ) : (
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-stone-600">{selected.courierId ? "تغییر پیک" : "انتخاب پیک و ارسال"}</span>
                    <Select value={selected.courierId ?? ""} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; const c = couriers.items.find((x) => x.id === v); orders.update(selected.id, { courierId: v, courierName: c?.name ?? null, deliveryStatus: v ? "assigned" : "none" }).then(() => toast(v ? `سفارش به ${c?.name} سپرده شد` : "پیک برداشته شد")).catch((err) => toast(err.message, "error")); }}>
                      <option value="">— بدون پیک —</option>
                      {couriers.items.filter((c) => c.status !== "off" || c.id === selected.courierId).map((c) => <option key={c.id} value={c.id}>{c.name} — {c.vehicle}{c.activeCount ? ` (${toFa(c.activeCount)} سفارش فعال)` : ""}</option>)}
                    </Select></label>
                )}
                {selected.deliveryStatus === "assigned" && selected.status !== "ready" && selected.status !== "served" && <p className="text-xs text-stone-500">پیک می‌تواند پس از «آماده سرو» شدن سفارش، آن را تحویل بگیرد.</p>}
              </div>
            )}
            {selected.scheduledFor && <p className="rounded-xl bg-violet-50 px-3.5 py-2.5 text-sm text-violet-900">⏰ پیش‌سفارش برای {formatDate(selected.scheduledFor)} ساعت {formatTime(selected.scheduledFor)}</p>}
            {selected.customerName && <p className="text-sm text-stone-600">مشتری: <b>{selected.customerName}</b></p>}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-stone-600">گارسون</span>
                <Select
                  value={selected.waiterId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    const w = staff.items.find((s) => s.id === v);
                    orders.update(selected.id, { waiterId: v, waiterName: w?.name ?? null }).catch((err) => toast(err.message, "error"));
                  }}
                >
                  <option value="">— بدون گارسون —</option>
                  {staff.items.filter((s) => s.role === "waiter" && s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-stone-600">تغییر وضعیت</span>
                <Select value={selected.status} onChange={(e) => setStatus(selected, e.target.value)}>
                  {ORDER_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </Select>
              </label>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="حذف سفارش"
        message={deleting ? `سفارش #${toFa(deleting.number)} برای همیشه حذف می‌شود. این عمل قابل بازگشت نیست.` : ""}
        onConfirm={() => deleting && del(deleting)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-stone-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
