"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon, useToast } from "@/components/ui";

type PushSettings = { configured: boolean; publicKey: string; subscribed: boolean };
type PushSubscriptionBody = { endpoint: string; keys: { p256dh: string; auth: string } };

function decodeVapidKey(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function subscriptionBody(subscription: PushSubscription): PushSubscriptionBody {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) throw new Error("اطلاعات اشتراک اعلان ناقص است");
  return { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

export function WaiterPushEnrollment() {
  const toast = useToast();
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const readStatus = useCallback(async () => {
    const available = typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available);
    if (!available) { setPermission("unsupported"); setSettings(null); return; }
    setPermission(Notification.permission);
    const result = await api<PushSettings>("/api/r/push-subscriptions");
    setSettings(result);
    if (!result.configured || Notification.permission !== "granted") { setActive(false); return; }
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) { setActive(false); return; }
    await api("/api/r/push-subscriptions", { method: "POST", body: { subscription: subscriptionBody(subscription) } });
    setActive(true);
  }, []);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      void readStatus().catch(() => { if (live) setLoadFailed(true); });
    }, 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [readStatus]);

  async function enable() {
    if (!settings?.configured || !settings.publicKey || !supported || busy) return;
    setBusy(true);
    try {
      // This call is intentionally made directly from the button gesture; browsers reject unsolicited prompts.
      const nextPermission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        toast(nextPermission === "denied" ? "اجازه اعلان در مرورگر رد شده است؛ آن را از تنظیمات سایت فعال کنید." : "برای دریافت اعلان، اجازه مرورگر لازم است.", "warning");
        return;
      }
      const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(settings.publicKey) as BufferSource,
        });
      }
      await api("/api/r/push-subscriptions", { method: "POST", body: { subscription: subscriptionBody(subscription) } });
      setActive(true);
      toast("اعلان درخواست‌های مشتری روی این دستگاه فعال شد.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "فعال‌سازی اعلان روی این دستگاه انجام نشد", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api("/api/r/push-subscriptions", { method: "DELETE", body: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setActive(false);
      toast("اعلان پس‌زمینه روی این دستگاه غیرفعال شد.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "غیرفعال‌سازی اعلان انجام نشد", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return <div role="status" className="mb-4 flex items-center gap-3 rounded-2xl border border-base-300 bg-base-100 px-4 py-3 text-xs text-base-content/65"><Icon name="bell" className="size-4 shrink-0" /><span>این مرورگر یا اتصال امن، اعلان پس‌زمینه را پشتیبانی نمی‌کند.</span></div>;
  if (loadFailed) return <div role="status" className="mb-4 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-base-content/75"><Icon name="warning" className="size-4 shrink-0 text-warning" /><span>وضعیت اعلان دستگاه بارگذاری نشد؛ صفحه را تازه‌سازی کنید یا migration اعلان را اجرا کنید.</span></div>;
  if (!settings) return null;

  return <section aria-label="اعلان درخواست‌های گارسون" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-base-100 px-4 py-3 shadow-sm">
    <div className="flex min-w-0 items-center gap-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${active ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}><Icon name="bell" className="size-5" /></span>
      <div className="min-w-0"><p className="text-sm font-extrabold">اعلان درخواست مشتری</p><p className="mt-0.5 text-xs leading-5 text-base-content/60">{!settings.configured ? "ارسال پس‌زمینه هنوز در تنظیمات سرور پیکربندی نشده است." : active ? "این دستگاه اعلان می‌گیرد؛ حتی وقتی پنل باز نباشد." : permission === "denied" ? "اجازهٔ مرورگر بسته است؛ آن را از تنظیمات همین سایت فعال کنید." : "برای خبر شدن از صدا زدن گارسون، اعلان این دستگاه را روشن کنید."}</p></div>
    </div>
    {settings.configured && (active
      ? <button type="button" className="btn btn-ghost btn-sm rounded-xl text-error" disabled={busy} onClick={() => void disable()}>{busy ? <span className="loading loading-spinner loading-xs" /> : <Icon name="x" className="size-4" />} خاموش‌کردن این دستگاه</button>
      : <button type="button" className="btn btn-primary btn-sm rounded-xl" disabled={busy || permission === "denied"} onClick={() => void enable()}>{busy ? <span className="loading loading-spinner loading-xs" /> : <Icon name="bell" className="size-4" />} فعال‌سازی اعلان</button>)}
  </section>;
}
