"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toFa } from "@/lib/format";
import { Button } from "@/components/ui";

type TrackEvent = { kind: "order" | "payment" | "delivery"; value: string; updatedAt: string };
type TrackSummary = {
  orderNumber: number;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  createdAt: string;
  updatedAt: string;
  history: TrackEvent[];
  courierLocation: { latitude: number; longitude: number; accuracyMeters: number; updatedAt: string } | null;
};

const statusLabels: Record<string, string> = { awaiting_payment: "در انتظار پرداخت", pending: "ثبت شده", preparing: "در حال آماده‌سازی", ready: "آماده تحویل", served: "تحویل شده", paid: "پرداخت و تکمیل شده", canceled: "لغو شده" };
const paymentLabels: Record<string, string> = { unpaid: "پرداخت نشده", pending: "در انتظار تأیید پرداخت", paid: "پرداخت موفق", failed: "پرداخت ناموفق", refunded: "بازپرداخت شده" };
const deliveryLabels: Record<string, string> = { none: "بدون ارسال پیک", assigned: "پیک تعیین شده", picked_up: "پیک سفارش را تحویل گرفته", delivered: "تحویل به مشتری", not_home: "مشتری در محل نبوده", failed: "تحویل انجام نشده" };
const final = (summary: TrackSummary) => summary.status === "canceled" || (["served", "paid"].includes(summary.status) && !["assigned", "picked_up"].includes(summary.deliveryStatus));

function subscribeToHashChange(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function getTrackingToken() {
  const value = window.location.hash.slice(1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
}
const localTime = (value: string) => new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function TrackOrderClient({ slug }: { slug: string }) {
  const [summaryState, setSummaryState] = useState<{ token: string; data: TrackSummary } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pollMs, setPollMs] = useState(10_000);
  const token = useSyncExternalStore(subscribeToHashChange, getTrackingToken, () => "");
  const summary = summaryState?.token === token ? summaryState.data : null;

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(slug)}/track`, { method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store", referrerPolicy: "no-referrer" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "رهگیری سفارش در دسترس نیست.");
      setSummaryState({ token, data: result as TrackSummary });
      setError("");
      setPollMs(10_000);
    } catch (cause) {
      setError((cause as Error).message || "رهگیری سفارش در دسترس نیست.");
      setPollMs((current) => Math.min(120_000, current * 2));
    } finally { setLoading(false); }
  }, [slug, token]);

  useEffect(() => {
    if (!token || (summary && final(summary))) return;
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, pollMs);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearTimeout(initial); window.clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); };
  }, [token, summary, pollMs, refresh]);

  const trackingError = error || (!token ? "پیوند رهگیری کامل نیست. همان پیوندی را که پس از ثبت سفارش دریافت کردید باز کنید." : "");
  const eventLabel = (event: TrackEvent) => event.kind === "payment" ? paymentLabels[event.value] ?? "وضعیت پرداخت به‌روزرسانی شد" : event.kind === "delivery" ? deliveryLabels[event.value] ?? "وضعیت ارسال به‌روزرسانی شد" : statusLabels[event.value] ?? "وضعیت سفارش به‌روزرسانی شد";

  return <section className="mx-auto max-w-xl rounded-3xl bg-base-100 p-5 shadow-xl sm:p-8" dir="rtl">
    <div className="text-center"><span className="badge badge-primary badge-outline">پیگیری امن سفارش</span><h1 className="mt-3 text-2xl font-black">سفارش #{toFa(summary?.orderNumber ?? 0)}</h1></div>
    {token && (!summary || loading) && !trackingError ? <div className="mt-8 space-y-3" aria-live="polite"><div className="skeleton h-14 w-full"/><div className="skeleton h-24 w-full"/></div> : trackingError ? <div className="alert alert-error mt-6" role="alert"><span>{trackingError}</span>{token && <Button size="sm" variant="secondary" onClick={() => { setLoading(true); void refresh(); }}>تلاش دوباره</Button>}</div> : summary && <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-primary/10 p-4 text-center"><p className="text-xs text-base-content/60">آماده‌سازی</p><p className="mt-1 font-extrabold text-primary">{statusLabels[summary.status] ?? "در حال بررسی"}</p></div><div className="rounded-2xl bg-base-200 p-4 text-center"><p className="text-xs text-base-content/60">پرداخت</p><p className="mt-1 font-extrabold">{paymentLabels[summary.paymentStatus] ?? "نامشخص"}</p></div></div>
      {summary.deliveryStatus !== "none" && <div className="mt-3 rounded-2xl border border-info/25 bg-info/10 p-4 text-center"><p className="font-bold text-info">{deliveryLabels[summary.deliveryStatus] ?? "وضعیت ارسال به‌روزرسانی شد"}</p>{["assigned", "picked_up"].includes(summary.deliveryStatus) && (summary.courierLocation ? <><p className="mt-1 text-xs text-base-content/65">آخرین موقعیت: {localTime(summary.courierLocation.updatedAt)} · دقت تقریبی {toFa(Math.round(summary.courierLocation.accuracyMeters))} متر</p><a className="btn btn-info btn-sm mt-3" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${summary.courierLocation.latitude},${summary.courierLocation.longitude}`}>دیدن موقعیت پیک روی نقشه</a></> : <p className="mt-1 text-xs text-base-content/65">موقعیت تازه پیک فعلاً در دسترس نیست.</p>)}</div>}
      <section className="mt-5" aria-labelledby="track-history"><h2 id="track-history" className="font-bold">تاریخچه وضعیت</h2>{summary.history.length ? <ol className="mt-3 space-y-0 border-r-2 border-primary/20 pe-4">{summary.history.map((event, index) => <li key={`${event.kind}-${event.value}-${event.updatedAt}-${index}`} className="relative border-b border-base-200 py-3 last:border-0"><span className="absolute -end-[1.32rem] top-4 size-2 rounded-full bg-primary"/><p className="text-sm font-semibold">{eventLabel(event)}</p><time className="mt-1 block text-xs text-base-content/55" dateTime={event.updatedAt}>{localTime(event.updatedAt)}</time></li>)}</ol> : <p className="mt-2 text-sm text-base-content/60">هنوز مرحله‌ای ثبت نشده است.</p>}</section>
      <p className="mt-4 text-center text-xs text-base-content/55">آخرین تغییر {localTime(summary.updatedAt)} · تا زمانی که سفارش نهایی نشود، در تب فعال هر {toFa(Math.round(pollMs / 1000))} ثانیه به‌روزرسانی می‌شود.</p>
    </>}
    <div className="mt-6 text-center"><Link href={`/m/${encodeURIComponent(slug)}`} className="link link-primary text-sm">بازگشت به منو</Link></div>
  </section>;
}
