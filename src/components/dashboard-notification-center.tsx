"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { formatDate, formatNumber, formatPrice, formatTime } from "@/lib/format";
import { dashboardNotificationCount } from "@/lib/dashboard-notifications";
import type { InventoryAlert, InventoryAlertKind } from "@/lib/inventory-alerts";
import { cn, Icon, useToast } from "@/components/ui";

type OnlineOrderNotification = {
  id: number;
  number: number;
  customerName: string;
  type: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  tableName: string | null;
};
type ReservationNotification = {
  id: number;
  customerName: string;
  guestCount: number;
  startsAt: string;
  status: string;
  createdAt: string;
  tableName: string | null;
};
type WaiterCallNotification = {
  id: number;
  tableName: string;
  kind: string;
  message: string;
  createdAt: string;
};
type ChequeDueNotification = {
  id: number;
  direction: string;
  partnerName: string;
  amount: number;
  dueDate: string;
  chequeNumber: string;
  bank: string;
};
type EventResponse = {
  orders: OnlineOrderNotification[];
  reservations: ReservationNotification[];
  waiterCalls: WaiterCallNotification[];
  cheques: ChequeDueNotification[];
  checkedAt: string;
};
type InventoryResponse = { alerts: InventoryAlert[]; truncated: boolean; checkedAt: string };

const EMPTY_EVENTS: EventResponse = { orders: [], reservations: [], waiterCalls: [], cheques: [], checkedAt: "" };
const inventoryTitles: Record<InventoryAlertKind, string> = {
  stock_out: "موجودی تمام شده",
  stock_low: "موجودی زیر حد مجاز",
  expired: "تاریخ انقضا گذشته",
  expiring: "نزدیک به تاریخ انقضا",
};
const orderStatus: Record<string, string> = {
  awaiting_payment: "در انتظار پرداخت",
  pending: "در انتظار تأیید",
  preparing: "در حال آماده‌سازی",
};
const paymentStatus: Record<string, string> = { paid: "پرداخت‌شده", unpaid: "پرداخت‌نشده", partial: "پرداخت‌جزئی" };

function expiryLabel(alert: InventoryAlert) {
  if (!alert.expiryDate) return "";
  const date = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(`${alert.expiryDate}T12:00:00Z`));
  if (alert.kind === "expired") return `منقضی‌شده از ${date}`;
  return alert.daysUntilExpiry === 0 ? `انقضا امروز · ${date}` : `${formatNumber(alert.daysUntilExpiry ?? 0)} روز تا انقضا · ${date}`;
}

function dateTime(date: string) {
  return `${formatDate(date)} · ${formatTime(date)}`;
}

function Section({ title, count, icon, children }: { title: string; count: number; icon: string; children: ReactNode }) {
  if (!count) return null;
  return <section className="border-b border-base-300 last:border-b-0">
    <div className="sticky top-0 z-[1] flex items-center justify-between bg-base-100/95 px-4 py-2.5 backdrop-blur">
      <h4 className="flex items-center gap-2 text-xs font-extrabold"><Icon name={icon} className="size-4 text-primary" />{title}</h4>
      <span className="rounded-full bg-base-200 px-2 py-0.5 text-[10px] font-bold text-base-content/65">{formatNumber(count)}</span>
    </div>
    <ul className="divide-y divide-base-200">{children}</ul>
  </section>;
}

function NotificationLink({ href, icon, tone, title, detail, time, onClick }: {
  href: string;
  icon: string;
  tone: string;
  title: string;
  detail: string;
  time: string;
  onClick: () => void;
}) {
  return <li><Link href={href} onClick={onClick} className="flex items-start gap-2.5 px-4 py-3 transition hover:bg-base-200/70">
    <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl", tone)}><Icon name={icon} className="size-4" /></span>
    <span className="min-w-0 flex-1"><b className="block truncate text-xs">{title}</b><span className="mt-1 block text-[11px] leading-5 text-base-content/65">{detail}</span><time className="mt-1 block text-[10px] text-base-content/45">{time}</time></span>
    <Icon name="arrowLeft" className="mt-2 size-3.5 shrink-0 text-base-content/35" />
  </Link></li>;
}

export function DashboardNotificationCenter({ businessSlug, enabled, inventoryEnabled, ordersEnabled, reservationsEnabled }: { businessSlug: string; enabled: boolean; inventoryEnabled: boolean; ordersEnabled: boolean; reservationsEnabled: boolean }) {
  const toast = useToast();
  const [events, setEvents] = useState<EventResponse>(EMPTY_EVENTS);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef(new Set<string>());

  const refresh = useCallback(async (notify = true) => {
    if (!enabled) return;
    setLoading(true);
    const [eventResult, inventoryResult] = await Promise.allSettled([
      api<EventResponse>("/api/r/dashboard-notifications"),
      inventoryEnabled ? api<InventoryResponse>("/api/r/inventory-alerts") : Promise.resolve({ alerts: [], truncated: false, checkedAt: "" }),
    ]);
    let failed = eventResult.status === "rejected" || (inventoryEnabled && inventoryResult.status === "rejected");

    if (eventResult.status === "fulfilled") {
      setEvents(eventResult.value);
      if (notify && eventResult.value.cheques.length) {
        const storageKey = `menupeak:cheque-reminders:${businessSlug}`;
        const previous = new Set<string>(seenRef.current);
        try {
          const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
          if (Array.isArray(stored)) for (const key of stored) if (typeof key === "string") previous.add(key);
        } catch { /* ignore malformed session state */ }
        const fresh = eventResult.value.cheques.filter((item) => !previous.has(`${item.id}:${item.dueDate}`));
        if (fresh.length) toast(`${formatNumber(fresh.length)} چک در بازهٔ یادآوری سررسید قرار دارد؛ جزئیات را در اعلان‌ها ببینید.`, "warning");
        const remembered = eventResult.value.cheques.map((item) => `${item.id}:${item.dueDate}`).slice(-300);
        seenRef.current = new Set([...previous, ...remembered]);
        try { sessionStorage.setItem(storageKey, JSON.stringify([...seenRef.current].slice(-300))); } catch { /* toast still works without session storage */ }
      }
    }
    if (inventoryResult.status === "fulfilled") {
      setAlerts(inventoryResult.value.alerts);
      setTruncated(inventoryResult.value.truncated);

      if (notify && inventoryEnabled) {
        const storageKey = `menupeak:inventory-alerts:${businessSlug}`;
        const previous = new Set<string>(seenRef.current);
        try {
          const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
          if (Array.isArray(stored)) for (const key of stored) if (typeof key === "string") previous.add(key);
        } catch { /* malformed session state is safely ignored */ }
        const fresh = inventoryResult.value.alerts.filter((alert) => !previous.has(alert.key));
        if (fresh.length) {
          const stock = fresh.filter((alert) => alert.kind === "stock_out" || alert.kind === "stock_low").length;
          const expired = fresh.filter((alert) => alert.kind === "expired").length;
          const expiring = fresh.filter((alert) => alert.kind === "expiring").length;
          const summary = [stock && `${formatNumber(stock)} مورد کمبود موجودی`, expired && `${formatNumber(expired)} مورد تاریخ‌گذشته`, expiring && `${formatNumber(expiring)} مورد نزدیک انقضا`].filter(Boolean).join("، ");
          toast(`هشدار انبار: ${summary}؛ فهرست اعلان‌ها را بررسی کنید.`, fresh.some((alert) => alert.kind === "stock_out" || alert.kind === "expired") ? "error" : "warning");
        }
        const remembered = inventoryResult.value.alerts.map((alert) => alert.key).slice(-300);
        seenRef.current = new Set(remembered);
        try { sessionStorage.setItem(storageKey, JSON.stringify(remembered)); } catch { /* session notifications still work without storage */ }
      }
    }

    setError(failed);
    setLoading(false);
  }, [businessSlug, enabled, inventoryEnabled, toast]);

  useEffect(() => {
    if (!enabled) return;
    const start = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => { window.clearTimeout(start); window.clearInterval(timer); };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!enabled) return null;
  const count = dashboardNotificationCount({ orders: events.orders, reservations: events.reservations, waiterCalls: events.waiterCalls, inventory: alerts, cheques: events.cheques });
  const close = () => setOpen(false);

  return <div ref={rootRef} className="relative">
    <button type="button" className="btn btn-ghost btn-square btn-sm relative text-base-content/70" aria-label={`اعلان‌های پنل، ${formatNumber(count)} مورد`} aria-expanded={open} aria-controls="dashboard-notification-popover" onClick={() => { setOpen((value) => !value); if (error) void refresh(false); }}>
      <Icon name="bell" className="size-[18px]" />
      {count > 0 && <span className="absolute -end-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-extrabold leading-none text-error-content">{count > 99 ? "۹۹+" : formatNumber(count)}</span>}
    </button>
    {open && <section id="dashboard-notification-popover" role="region" aria-label="اعلان‌های پنل رستوران" className="absolute end-0 top-[calc(100%+0.65rem)] z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-base-300 bg-base-100 text-base-content shadow-2xl">
      <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
        <div><h3 className="text-sm font-extrabold">اعلان‌های پنل</h3><p className="mt-0.5 text-[11px] text-base-content/55">سفارش آنلاین، رزرو، درخواست گارسون، انبار و چک</p></div>
        <button type="button" className="btn btn-ghost btn-square btn-xs" aria-label="به‌روزرسانی اعلان‌ها" disabled={loading} onClick={() => void refresh(false)}><Icon name="refresh" className={cn("size-4", loading && "animate-spin")} /></button>
      </div>
      <div className="max-h-[min(68vh,34rem)] overflow-y-auto overscroll-contain">
        {error && <div className="m-3 flex items-center justify-between gap-3 rounded-xl bg-error/10 px-3 py-2 text-xs text-error"><span>بخشی از اعلان‌ها بارگذاری نشد.</span><button type="button" className="font-bold" onClick={() => void refresh(false)}>تلاش دوباره</button></div>}
        {loading && count === 0 ? <p className="p-5 text-center text-sm text-base-content/55">در حال دریافت اعلان‌ها…</p>
          : count === 0 ? <div className="p-6 text-center"><span className="mx-auto flex size-10 items-center justify-center rounded-full bg-success/10 text-success"><Icon name="circleCheck" className="size-5" /></span><p className="mt-2 text-sm font-bold">اعلان تازه‌ای ندارید</p><p className="mt-1 text-xs text-base-content/55">درخواست‌های فعال و هشدارهای انبار اینجا نمایش داده می‌شوند.</p></div>
            : <>
              <Section title="درخواست‌های گارسون" count={events.waiterCalls.length} icon="bell">
                {events.waiterCalls.map((item) => <NotificationLink key={item.id} href="/dashboard/waiter" onClick={close} icon={item.kind === "message" ? "message" : "bell"} tone="bg-amber-100 text-amber-800" title={`میز ${item.tableName || "بدون نام"} · ${item.kind === "message" ? "پیام مشتری" : "درخواست گارسون"}`} detail={item.message || "مشتری درخواست حضور گارسون دارد."} time={dateTime(item.createdAt)} />)}
              </Section>
              <Section title="سفارش‌های آنلاین" count={events.orders.length} icon="orders">
                {events.orders.map((item) => <NotificationLink key={item.id} href="/dashboard/orders" onClick={close} icon="orders" tone="bg-primary/10 text-primary" title={`سفارش #${formatNumber(item.number)} · ${orderStatus[item.status] ?? "سفارش جدید"}`} detail={`${item.tableName ? `میز ${item.tableName}` : item.type === "delivery" ? "ارسال" : item.type === "takeaway" ? "بیرون‌بر" : "حضوری"} · ${formatPrice(item.total)} · ${paymentStatus[item.paymentStatus] ?? item.paymentStatus}`} time={dateTime(item.createdAt)} />)}
              </Section>
              <Section title="درخواست‌های رزرو" count={events.reservations.length} icon="calendar">
                {events.reservations.map((item) => <NotificationLink key={item.id} href="/dashboard/reservations" onClick={close} icon="calendar" tone="bg-info/10 text-info" title={`${item.customerName} · ${formatNumber(item.guestCount)} نفر`} detail={`${item.tableName ? `میز ${item.tableName} · ` : "میز انتخاب نشده · "}زمان رزرو ${dateTime(item.startsAt)}`} time={`ثبت درخواست · ${dateTime(item.createdAt)}`} />)}
              </Section>
              <Section title="یادآوری سررسید چک" count={events.cheques.length} icon="file">
                {events.cheques.map((item) => <NotificationLink key={`${item.id}:${item.dueDate}`} href="/dashboard/cheques" onClick={close} icon="file" tone="bg-amber-100 text-amber-800" title={`${item.direction === "payable" ? "پرداختنی" : "دریافتنی"} · چک ${item.chequeNumber || `#${formatNumber(item.id)}`}`} detail={`${item.partnerName} · ${item.bank || "بانک نامشخص"} · ${formatPrice(item.amount)}`} time={`سررسید ${dateTime(item.dueDate)}`} />)}
              </Section>
              <Section title="هشدارهای انبار" count={alerts.length} icon="warning">
                {alerts.slice(0, 100).map((alert) => {
                  const expiry = alert.kind === "expired" || alert.kind === "expiring";
                  const detail = expiry ? expiryLabel(alert) : `موجودی ${formatNumber(alert.stock)} ${alert.unit} · حداقل مجاز ${formatNumber(alert.minStock)} ${alert.unit}`;
                  const tone = alert.kind === "expired" || alert.kind === "stock_out" ? "bg-error/10 text-error" : alert.kind === "stock_low" ? "bg-warning/15 text-warning-content" : "bg-info/10 text-info";
                  return <NotificationLink key={alert.key} href="/dashboard/inventory" onClick={close} icon={expiry ? "calendar" : "warning"} tone={tone} title={`${alert.name} · ${inventoryTitles[alert.kind]}`} detail={detail} time="بررسی موجودی جاری" />;
                })}
              </Section>
            </>}
      </div>
      {(truncated || alerts.length > 100) && <p className="border-t border-base-300 px-4 py-2 text-center text-[11px] text-base-content/55">بخشی از هشدارهای انبار محدود شده؛ فهرست کامل در صفحه انبار است.</p>}
      {(ordersEnabled || reservationsEnabled) && <div className={cn("grid border-t border-base-300 bg-base-200/40 text-[11px] font-bold", ordersEnabled && reservationsEnabled ? "grid-cols-2" : "grid-cols-1")}>
        {ordersEnabled && <Link href="/dashboard/orders" onClick={close} className="flex items-center justify-center gap-1.5 px-2 py-3 text-primary hover:bg-base-200">سفارش‌ها<Icon name="arrowLeft" className="size-3.5" /></Link>}
        {reservationsEnabled && <Link href="/dashboard/reservations" onClick={close} className={cn("flex items-center justify-center gap-1.5 px-2 py-3 text-primary hover:bg-base-200", ordersEnabled && "border-s border-base-300")}>رزروها<Icon name="arrowLeft" className="size-3.5" /></Link>}
      </div>}
    </section>}
  </div>;
}
