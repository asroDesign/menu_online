"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Check, Volume2, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatTime, toFa } from "@/lib/format";
import { Badge, Button, cn, useToast } from "@/components/ui";

type ServiceRequest = {
  id: number;
  tableId: number;
  tableName: string;
  kind: "call" | "message";
  message: string;
  status: "open" | "resolved";
  createdAt: string;
};

type ToastRequest = ServiceRequest & { toastId: number };

function playRequestTone(context: AudioContext) {
  for (const [offset, frequency] of [[0, 880], [0.16, 660]] as const) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + offset);
    gain.gain.setValueAtTime(0.001, context.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + offset + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + offset + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime + offset);
    oscillator.stop(context.currentTime + offset + 0.15);
  }
}

export function WaiterServiceRequestNotifications() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [toasts, setToasts] = useState<ToastRequest[]>([]);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);
  const known = useRef(new Set<number>());
  const initialized = useRef(false);
  const timers = useRef(new Map<number, number>());
  const audioContext = useRef<AudioContext | null>(null);
  const soundReady = useRef(false);
  const toast = useToast();

  async function enableSound() {
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) throw new Error("مرورگر از صدای اعلان پشتیبانی نمی‌کند");
      const context = audioContext.current ?? new AudioContextConstructor();
      audioContext.current = context;
      if (context.state !== "running") await context.resume();
      if (context.state !== "running") throw new Error("اجازهٔ پخش صدا داده نشد");
      soundReady.current = true;
      setSoundEnabled(true);
      setSoundBlocked(false);
      playRequestTone(context);
    } catch {
      soundReady.current = false;
      setSoundBlocked(true);
      toast("برای پخش صدای اعلان، اجازهٔ صدا را در مرورگر فعال کنید", "error");
    }
  }

  useEffect(() => {
    let live = true;
    let inFlight = false;
    const activeTimers = timers.current;
    async function load() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const { items } = await api<{ items: ServiceRequest[] }>("/api/r/service-requests");
        if (!live) return;
        const fresh = initialized.current ? items.filter((item) => !known.current.has(item.id)) : items;
        initialized.current = true;
        items.forEach((item) => known.current.add(item.id));
        setRequests(items);
        const openIds = new Set(items.map((item) => item.id));
        setToasts((current) => current.filter((item) => openIds.has(item.id)));
        if (fresh.length) {
          setToasts((current) => [...current, ...fresh.map((item) => ({ ...item, toastId: item.id }))].slice(-4));
          fresh.forEach((item) => {
            const timer = window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== item.id)), 12_000);
            activeTimers.set(item.id, timer);
          });
          try {
            const context = audioContext.current;
            if (!soundReady.current || !context) throw new Error("sound-not-enabled");
            if (context.state !== "running") await context.resume();
            if (context.state !== "running") throw new Error("sound-not-running");
            playRequestTone(context);
            setSoundBlocked(false);
          } catch { setSoundBlocked(true); }
        }
      } catch {
        // The next poll retries. A transient connection error should not cover the order screen.
      } finally {
        inFlight = false;
      }
    }
    void load();
    const interval = window.setInterval(() => { void load(); }, 3_000);
    const onVisibility = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      activeTimers.forEach((timer) => window.clearTimeout(timer));
      activeTimers.clear();
      if (audioContext.current && audioContext.current.state !== "closed") void audioContext.current.close();
    };
  }, []);

  function dismissToast(id: number) {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  async function resolveRequest(id: number) {
    setResolving(id);
    try {
      await api(`/api/r/service-requests/${id}`, { method: "PATCH", body: { action: "resolve" } });
      setRequests((current) => current.filter((item) => item.id !== id));
      dismissToast(id);
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setResolving(null);
    }
  }

  return <>
    <section dir="rtl" aria-label="اعلان درخواست‌های مشتری" className="mb-4">
      <div className="aura aura-sm aura-glow rounded-2xl text-sky-500">
        <div className="flex flex-col gap-3 rounded-2xl border border-sky-100 bg-gradient-to-l from-sky-50 via-white to-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-800 shadow-inner shadow-white/70">
              <BellRing className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-extrabold text-slate-900">اعلان درخواست مشتری</h2>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", soundEnabled && !soundBlocked ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")} role="status" aria-live="polite">
                  <span className={cn("size-1.5 rounded-full", soundEnabled && !soundBlocked ? "bg-emerald-500" : "bg-amber-500")} />
                  {soundEnabled && !soundBlocked ? "هشدار صوتی روشن" : soundBlocked ? "صدا نیاز به فعال‌سازی دارد" : "اعلان دیداری فعال است"}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
                {soundEnabled && !soundBlocked
                  ? "درخواست تازهٔ مشتری با صدا و پیام روی صفحه اعلام می‌شود."
                  : soundBlocked
                    ? "مرورگر پخش صدا را متوقف کرده است؛ با فعال‌سازی دوباره، درخواست‌ها را فوری می‌شنوید. پیام‌ها در هر حال در فهرست ثبت می‌شوند."
                    : "برای شنیدن فوری درخواست میزها، هشدار صوتی را فعال کنید. پیام‌ها حتی بدون صدا هم در این پنل نمایش داده می‌شوند."}
              </p>
            </div>
          </div>
          <Button type="button" size="sm" variant="secondary" className="min-h-10 w-full shrink-0 gap-2 rounded-xl border-sky-200 bg-white px-4 text-xs font-bold text-sky-900 shadow-sm hover:bg-sky-50 sm:w-auto" onClick={() => void enableSound()}>
            <Volume2 className="size-4" aria-hidden="true" />
            {soundEnabled && !soundBlocked ? "آزمایش صدای اعلان" : soundBlocked ? "فعال‌سازی صدا" : "فعال‌کردن صدای اعلان"}
          </Button>
        </div>
      </div>
    </section>
    {toasts.length > 0 && <div dir="rtl" aria-live="assertive" aria-relevant="additions" className="pointer-events-none fixed inset-x-3 top-[5.25rem] z-[120] mx-auto grid max-w-lg gap-2">
      {toasts.map((item) => <div key={item.toastId} className="aura aura-xs aura-glow rounded-2xl text-sky-500">
        <article role="status" className="pointer-events-auto overflow-hidden rounded-2xl border border-sky-200 bg-white/95 shadow-2xl shadow-slate-900/15 ring-1 ring-white backdrop-blur animate-pop">
          <div className="flex items-start gap-3 p-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-800"><BellRing className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><p className="font-extrabold text-slate-900">درخواست مشتری · {item.tableName}</p><Badge color="brand">جدید</Badge></div>
              <p className="mt-1 text-sm leading-6 text-slate-700">{item.kind === "call" ? "مشتری گارسون را صدا کرده است." : item.message}</p>
              <p className="mt-1 text-[11px] text-slate-400">میز {item.tableName} · {formatTime(item.createdAt)}</p>
              <Button size="sm" className="mt-2 min-h-9" loading={resolving === item.id} onClick={() => void resolveRequest(item.id)}><Check className="size-4" /> رسیدگی شد</Button>
            </div>
            <button type="button" aria-label="بستن اعلان" onClick={() => dismissToast(item.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="size-4" /></button>
          </div>
        </article>
      </div>)}
    </div>}

    {requests.length > 0 && <section dir="rtl" className="mb-3 rounded-2xl border border-sky-200/80 bg-gradient-to-l from-sky-50 to-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer select-none text-sm font-bold text-sky-950">درخواست‌های میزها <Badge color="brand">{toFa(requests.length)}</Badge></summary>
          {requests.length > 0 && <ul className="mt-3 space-y-2">
            {requests.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-100 bg-white p-2.5 text-sm">
              <span className="shrink-0 rounded-lg bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800">{item.tableName}</span>
              <span className="min-w-0 flex-1 leading-6">{item.kind === "call" ? "درخواست حضور گارسون" : item.message}</span>
              <span className="text-[11px] text-slate-400">{formatTime(item.createdAt)}</span>
              <Button size="sm" variant="secondary" className="min-h-8" loading={resolving === item.id} onClick={() => void resolveRequest(item.id)}><Check className="size-3.5" /> رسیدگی شد</Button>
            </li>)}
          </ul>}
        </details>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-sky-900/65">درخواست‌های تازه در این پنل و صندوق نمایش داده می‌شوند؛ بررسی هر درخواست برای هر دو پنل ثبت می‌شود.</p>
    </section>}
  </>;
}
