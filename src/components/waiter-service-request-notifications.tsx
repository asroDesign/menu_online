"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
const SOUND_COOKIE = "menupeak_waiter_alert_sound";
const SOUND_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function savedSoundPreference() {
  return document.cookie.split(";").some((part) => part.trim() === `${SOUND_COOKIE}=enabled`);
}

function saveSoundPreference(enabled: boolean) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SOUND_COOKIE}=${enabled ? "enabled" : "disabled"}; Max-Age=${SOUND_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

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
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);
  const known = useRef(new Set<number>());
  const initialized = useRef(false);
  const timers = useRef(new Map<number, number>());
  const audioContext = useRef<AudioContext | null>(null);
  const soundReady = useRef(false);
  const soundPreferred = useRef(false);
  const toast = useToast();

  const activateSound = useCallback(async (playTest = false) => {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) throw new Error("مرورگر از صدای اعلان پشتیبانی نمی‌کند");
      const context = audioContext.current ?? new AudioContextConstructor();
      audioContext.current = context;
      if (context.state !== "running") await context.resume();
      if (context.state !== "running") throw new Error("اجازهٔ پخش صدا داده نشد");
      soundReady.current = true;
      soundPreferred.current = true;
      saveSoundPreference(true);
      setSoundEnabled(true);
      setSoundBlocked(false);
      if (playTest) playRequestTone(context);
  }, []);

  async function enableSound() {
    try {
      await activateSound(true);
      setTooltipOpen(false);
      toast("صدای هشدار درخواست‌های میز فعال شد.");
    } catch {
      soundReady.current = false;
      setSoundBlocked(true);
      setTooltipOpen(true);
      toast("برای پخش صدای اعلان، اجازهٔ صدا را در مرورگر فعال کنید", "error");
    }
  }

  useEffect(() => {
    let live = true;
    let inFlight = false;
    const activeTimers = timers.current;
    soundPreferred.current = savedSoundPreference();
    const unlockSound = () => {
      if (!soundPreferred.current) return;
      void activateSound(false).catch(() => setSoundBlocked(true));
    };
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
    if (soundPreferred.current) {
      window.addEventListener("pointerdown", unlockSound, { once: true });
      window.addEventListener("keydown", unlockSound, { once: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", unlockSound);
      window.removeEventListener("keydown", unlockSound);
      document.removeEventListener("visibilitychange", onVisibility);
      activeTimers.forEach((timer) => window.clearTimeout(timer));
      activeTimers.clear();
      if (audioContext.current && audioContext.current.state !== "closed") void audioContext.current.close();
    };
  }, [activateSound]);

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
    {(requests.length > 0 || !soundEnabled) && <div dir="rtl" className="fixed left-4 bottom-[calc(5rem_+_env(safe-area-inset-bottom))] z-[125]">
      {tooltipOpen && <section role="dialog" aria-label="جزئیات درخواست‌های میز" className="absolute bottom-full left-0 mb-3 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-sky-200 bg-white text-right shadow-2xl shadow-slate-900/20 animate-pop">
        <header className="flex items-start justify-between gap-3 border-b border-sky-100 bg-gradient-to-l from-sky-50 to-white p-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900">درخواست‌های میز</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">{soundEnabled ? "هشدار صوتی این دستگاه فعال است." : soundBlocked ? "مرورگر صدا را متوقف کرده؛ دوباره فعالش کنید." : "برای شنیدن درخواست‌ها، صدای هشدار را فعال کنید."}</p>
          </div>
          <button type="button" aria-label="بستن جزئیات درخواست‌ها" onClick={() => setTooltipOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="size-4" /></button>
        </header>
        {!soundEnabled && <div className="border-b border-sky-100 p-3">
          <Button type="button" size="sm" variant="secondary" className="min-h-9 w-full gap-2 rounded-xl border-sky-200 bg-sky-50 text-xs font-bold text-sky-900 hover:bg-sky-100" onClick={() => void enableSound()}><Volume2 className="size-4" />فعال‌سازی صدا</Button>
        </div>}
        {requests.length > 0 ? <ul className="max-h-[min(48vh,22rem)] divide-y divide-slate-100 overflow-y-auto">
          {requests.map((item) => <li key={item.id} className="flex items-start gap-3 p-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-800"><BellRing className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><b className="text-xs text-slate-900">میز {item.tableName}</b><Badge color="brand">{item.kind === "call" ? "گارسون" : "پیام"}</Badge></div>
              {item.kind === "message" && <p className="mt-1 break-words text-xs leading-5 text-slate-600">{item.message}</p>}
              <p className="mt-1 text-[10px] text-slate-400">{formatTime(item.createdAt)}</p>
              <Button size="sm" className="mt-2 min-h-8" loading={resolving === item.id} onClick={() => void resolveRequest(item.id)}><Check className="size-3.5" />رسیدگی شد</Button>
            </div>
          </li>)}
        </ul> : <p className="p-4 text-center text-xs text-slate-500">درخواست بازی برای نمایش وجود ندارد.</p>}
      </section>}
      <button type="button" aria-label={requests.length ? `درخواست‌های میز، ${toFa(requests.length)} درخواست باز` : "فعال‌سازی صدای اعلان درخواست میز"} aria-expanded={tooltipOpen} aria-haspopup="dialog" onClick={() => {
        if (requests.length === 0 && !soundEnabled) void enableSound();
        else setTooltipOpen((open) => !open);
      }} className={cn("relative flex size-14 items-center justify-center rounded-full border-2 border-white bg-sky-900 text-white shadow-xl shadow-sky-950/25 transition hover:scale-105 hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300", requests.length > 0 && "animate-pulse")} title={requests.length ? "نمایش درخواست‌های میز" : "فعال‌سازی صدای اعلان"}>
        <BellRing className="size-6" aria-hidden="true" />
        {requests.length > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-1 text-[11px] font-extrabold text-white">{toFa(requests.length)}</span>}
      </button>
    </div>}
    {toasts.length > 0 && <div dir="rtl" aria-live="assertive" aria-relevant="additions" className="pointer-events-none fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[120] mx-auto grid max-w-lg gap-2">
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
