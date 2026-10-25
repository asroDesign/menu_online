"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { InventoryAlert, InventoryAlertKind } from "@/lib/inventory-alerts";
import { cn, Icon, useToast } from "@/components/ui";

type AlertResponse = { alerts: InventoryAlert[]; truncated: boolean; checkedAt: string };

const titleFor: Record<InventoryAlertKind, string> = {
  stock_out: "موجودی تمام شده",
  stock_low: "موجودی زیر حد مجاز",
  expired: "تاریخ انقضا گذشته",
  expiring: "نزدیک به تاریخ انقضا",
};

function expiryLabel(alert: InventoryAlert) {
  if (!alert.expiryDate) return "";
  const date = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(`${alert.expiryDate}T12:00:00Z`));
  if (alert.kind === "expired") return `منقضی‌شده از ${date}`;
  return alert.daysUntilExpiry === 0 ? `انقضا امروز · ${date}` : `${formatNumber(alert.daysUntilExpiry ?? 0)} روز تا انقضا · ${date}`;
}

function alertToast(alerts: InventoryAlert[]) {
  const stock = alerts.filter((alert) => alert.kind === "stock_out" || alert.kind === "stock_low").length;
  const expired = alerts.filter((alert) => alert.kind === "expired").length;
  const expiring = alerts.filter((alert) => alert.kind === "expiring").length;
  const parts = [
    stock ? `${formatNumber(stock)} قلم کمبود یا اتمام موجودی` : "",
    expired ? `${formatNumber(expired)} قلم تاریخ‌گذشته` : "",
    expiring ? `${formatNumber(expiring)} قلم در آستانه انقضا` : "",
  ].filter(Boolean);
  return `هشدار انبار: ${parts.join("، ")}؛ برای بررسی، فهرست اعلان‌ها را باز کنید.`;
}

export function InventoryAlertCenter({ businessSlug, enabled }: { businessSlug: string; enabled: boolean }) {
  const toast = useToast();
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
    try {
      const result = await api<AlertResponse>("/api/r/inventory-alerts");
      setAlerts(result.alerts);
      setTruncated(result.truncated);
      setError(false);

      if (notify) {
        const storageKey = `menupeak:inventory-alerts:${businessSlug}`;
        const previous = new Set<string>(seenRef.current);
        try {
          const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
          if (Array.isArray(stored)) for (const key of stored) if (typeof key === "string") previous.add(key);
        } catch { /* malformed session state is safely ignored */ }
        const fresh = result.alerts.filter((alert) => !previous.has(alert.key));
        if (fresh.length) toast(alertToast(fresh), fresh.some((alert) => alert.kind === "stock_out" || alert.kind === "expired") ? "error" : "warning");
        const remembered = result.alerts.map((alert) => alert.key).slice(-300);
        seenRef.current = new Set(remembered);
        try { sessionStorage.setItem(storageKey, JSON.stringify(remembered)); } catch { /* notifications still work if storage is unavailable */ }
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [businessSlug, enabled, toast]);

  useEffect(() => {
    if (!enabled) return;
    const start = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 120_000);
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
  return (
    <div ref={rootRef} className="relative">
      <button type="button" className="btn btn-ghost btn-square btn-sm relative text-base-content/70" aria-label={`هشدارهای انبار، ${formatNumber(alerts.length)} مورد`} aria-expanded={open} aria-controls="inventory-alert-popover" onClick={() => { setOpen((value) => !value); if (error) void refresh(false); }}>
        <Icon name="bell" className="size-[18px]" />
        {alerts.length > 0 && <span className="absolute -end-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-extrabold leading-none text-error-content">{alerts.length > 99 ? "۹۹+" : formatNumber(alerts.length)}</span>}
      </button>
      {open && <section id="inventory-alert-popover" role="region" aria-label="هشدارهای انبار" className="absolute end-0 top-[calc(100%+0.65rem)] z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-base-300 bg-base-100 text-base-content shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
          <div><h3 className="text-sm font-extrabold">هشدارهای انبار</h3><p className="mt-0.5 text-[11px] text-base-content/55">کمبود موجودی و انقضای هفت روز آینده</p></div>
          <button type="button" className="btn btn-ghost btn-square btn-xs" aria-label="به‌روزرسانی هشدارها" disabled={loading} onClick={() => void refresh(false)}><Icon name="refresh" className={cn("size-4", loading && "animate-spin")} /></button>
        </div>
        <div className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain">
          {loading && alerts.length === 0 ? <p className="p-5 text-center text-sm text-base-content/55">در حال بررسی موجودی…</p>
            : error ? <div className="p-4 text-center"><p className="text-sm text-error">بارگذاری هشدارها انجام نشد.</p><button type="button" className="mt-2 text-xs font-bold text-primary" onClick={() => void refresh(false)}>تلاش دوباره</button></div>
              : alerts.length === 0 ? <div className="p-6 text-center"><span className="mx-auto flex size-10 items-center justify-center rounded-full bg-success/10 text-success"><Icon name="circleCheck" className="size-5" /></span><p className="mt-2 text-sm font-bold">هشدار فعالی ندارید</p><p className="mt-1 text-xs text-base-content/55">موجودی و تاریخ انقضای اقلام بررسی شده است.</p></div>
                : <ul className="divide-y divide-base-300">{alerts.slice(0, 100).map((alert) => {
                  const expiry = alert.kind === "expired" || alert.kind === "expiring";
                  return <li key={alert.key}><Link href="/dashboard/inventory" onClick={() => setOpen(false)} className="flex items-start gap-3 px-4 py-3 transition hover:bg-base-200/70">
                    <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl", alert.kind === "expired" || alert.kind === "stock_out" ? "bg-error/10 text-error" : alert.kind === "stock_low" ? "bg-warning/15 text-warning-content" : "bg-info/10 text-info")}><Icon name={expiry ? "calendar" : "warning"} className="size-4" /></span>
                    <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><b className="truncate text-xs">{alert.name}</b><small className="shrink-0 rounded-full bg-base-200 px-2 py-1 text-[10px] font-bold">{titleFor[alert.kind]}</small></span>
                      <span className="mt-1 block text-[11px] leading-5 text-base-content/60">{expiry ? expiryLabel(alert) : `موجودی ${formatNumber(alert.stock)} ${alert.unit} · حداقل مجاز ${formatNumber(alert.minStock)} ${alert.unit}`}</span></span>
                  </Link></li>;
                })}</ul>}
        </div>
        {(truncated || alerts.length > 100) && <p className="border-t border-base-300 px-4 py-2 text-center text-[11px] text-base-content/55">فهرست برای نمایش سریع محدود شده؛ صفحه انبار همه موارد را دارد.</p>}
        <Link href="/dashboard/inventory" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 border-t border-base-300 bg-base-200/50 px-4 py-3 text-xs font-bold text-primary hover:bg-base-200">رفتن به صفحه انبار<Icon name="arrowLeft" className="size-3.5" /></Link>
      </section>}
    </div>
  );
}
