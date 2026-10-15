"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { DELIVERY_STATUS } from "@/lib/admin-meta";
import { formatPrice, formatTime, timeAgo, toFa } from "@/lib/format";
import { Badge, Button, cn, Modal, Textarea, ToastProvider, useToast } from "@/components/ui";

type Item = { id: number; name: string; emoji: string; quantity: number; note: string };
type Job = {
  id: number; number: number; status: string; deliveryStatus: string; customerName: string; customerPhone: string; address: string; lat: number | null; lng: number | null;
  note: string; total: number; paymentStatus: string; paymentMethod: string | null; courierNote: string; assignedAt: string | null; pickedUpAt: string | null; deliveryFinishedAt: string | null; items: Item[];
};
type Data = { courier: { id: number; name: string; status: string; phone: string }; business: { name: string; emoji: string; phone: string }; items: Job[]; deliveredToday: number };
const METHODS: [string, string][] = [["cash", "💵 نقد"], ["pos", "💳 کارتخوان همراه"], ["card", "🏦 کارت‌به‌کارت"]];

export function CourierApp({ name }: { name: string }) {
  return <ToastProvider><App name={name} /></ToastProvider>;
}

function beep() {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new C(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 350);
    navigator.vibrate?.([200, 100, 200]);
  } catch { /* sound is optional */ }
}

function App({ name }: { name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"active" | "done">("active");
  const [dlg, setDlg] = useState<{ job: Job; kind: "delivered" | "not_home" | "failed" } | null>(null);
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<number | "dlg" | null>(null);
  const seen = useRef<Set<number> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<Data>("/api/courier/orders");
      setD(r); setErr("");
      const ids = new Set(r.items.filter((j) => j.deliveryStatus === "assigned").map((j) => j.id));
      if (seen.current) { for (const id of ids) if (!seen.current.has(id)) { beep(); toast("🛵 سفارش جدید به شما سپرده شد"); break; } }
      seen.current = ids;
    } catch (e) { setErr((e as Error).message); }
  }, [toast]);
  useEffect(() => { load(); const t = setInterval(() => !document.hidden && load(), 6000); return () => clearInterval(t); }, [load]);

  async function act(job: Job, action: string, extra: Record<string, unknown> = {}) {
    setBusy(job.id);
    try { await api(`/api/courier/orders/${job.id}`, { method: "POST", body: { action, ...extra } }); await load(); toast("ثبت شد ✔"); return true; }
    catch (e) { toast((e as Error).message, "error"); load(); return false; } finally { setBusy(null); }
  }
  async function submitDlg() {
    if (!dlg) return;
    setBusy("dlg");
    const ok = await act(dlg.job, dlg.kind, { note, paymentMethod: method });
    setBusy(null);
    if (ok) { setDlg(null); setNote(""); }
  }
  async function setStatus(status: string) {
    if (!d) return;
    setD({ ...d, courier: { ...d.courier, status } });
    try { await api("/api/courier/me", { method: "PATCH", body: { status } }); } catch (e) { toast((e as Error).message, "error"); load(); }
  }
  async function logout() { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); router.push("/login"); router.refresh(); }

  const active = (d?.items ?? []).filter((j) => ["assigned", "picked_up"].includes(j.deliveryStatus));
  const done = (d?.items ?? []).filter((j) => !["assigned", "picked_up"].includes(j.deliveryStatus));
  const list = tab === "active" ? active : done;
  const onShift = d?.courier.status !== "off";

  return (
    <div className="mx-auto min-h-dvh max-w-xl bg-[#f6f5f3] pb-10">
      <header className="sticky top-0 z-20 bg-stone-900 px-4 pb-4 pt-5 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs text-stone-400">{d?.business.emoji} {d?.business.name}</p><h1 className="truncate text-lg font-extrabold">🛵 {d?.courier.name ?? name}</h1></div>
          <button onClick={logout} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">خروج</button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setStatus(onShift ? "off" : "available")} className={cn("flex-1 rounded-xl py-2.5 text-sm font-bold transition", onShift ? "bg-emerald-500" : "bg-stone-600")}>{onShift ? "● در شیفت (آماده دریافت سفارش)" : "○ خارج از شیفت"}</button>
          <div className="rounded-xl bg-white/10 px-4 py-2 text-center"><p className="text-[10px] text-stone-400">تحویل امروز</p><p className="text-lg font-black leading-5">{toFa(d?.deliveredToday ?? 0)}</p></div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">
          {([["active", `سفارش‌های من (${toFa(active.length)})`], ["done", `انجام‌شده امروز (${toFa(done.length)})`]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("rounded-xl py-2.5", tab === k ? "bg-white text-stone-900" : "bg-white/10")}>{l}</button>)}
        </div>
      </header>

      <main className="space-y-3 p-4">
        {err && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{err}</p>}
        {!d && !err && [0, 1].map((i) => <div key={i} className="skeleton h-56 rounded-3xl" />)}
        {d && list.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-stone-300 bg-white/60 p-12 text-center"><div className="text-5xl">{tab === "active" ? "😌" : "📭"}</div><p className="mt-3 font-bold">{tab === "active" ? "فعلاً سفارشی به شما سپرده نشده" : "هنوز سفارشی انجام نشده"}</p>{tab === "active" && <p className="mt-1 text-xs text-stone-500">با سپرده‌شدن سفارش، صدا و اعلان دریافت می‌کنید.</p>}</div>
        )}
        {list.map((j) => {
          const st = DELIVERY_STATUS[j.deliveryStatus] ?? DELIVERY_STATUS.none;
          const unpaid = j.paymentStatus !== "paid";
          const ready = ["ready", "served"].includes(j.status);
          return (
            <article key={j.id} className={cn("overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200 animate-pop", j.deliveryStatus === "picked_up" && "ring-2 ring-amber-400")}>
              <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
                <div><p className="text-xl font-black">#{toFa(j.number)}</p><p className="text-[11px] text-stone-500">{j.assignedAt ? `سپرده‌شده ${timeAgo(j.assignedAt)}` : ""}</p></div>
                <Badge color={st[1]}>{st[0]}</Badge>
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <p className="text-xs font-bold text-stone-500">مشتری</p>
                  <p className="font-bold">{j.customerName || "—"}</p>
                  {j.customerPhone && <a href={`tel:${j.customerPhone}`} className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700" dir="ltr">📞 {j.customerPhone}</a>}
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-500">آدرس</p>
                  <p className="text-sm leading-7">{j.address || "—"}</p>
                  {j.lat != null && j.lng != null && (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${j.lat},${j.lng}`} target="_blank" className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700">🧭 مسیریابی (Google)</a>
                      <a href={`geo:${j.lat},${j.lng}?q=${j.lat},${j.lng}`} className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-bold text-stone-700">📍 باز کردن در نقشه</a>
                    </div>
                  )}
                </div>
                <ul className="rounded-2xl bg-stone-50 p-3 text-sm">{j.items.map((i) => <li key={i.id} className="flex justify-between gap-2 py-0.5"><span>{i.emoji} {i.name}</span><b>×{toFa(i.quantity)}</b></li>)}</ul>
                {j.note && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">📝 {j.note}</p>}
                <div className={cn("flex items-center justify-between rounded-2xl px-4 py-3", unpaid ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800")}>
                  <span className="text-sm font-bold">{unpaid ? "💵 دریافت وجه از مشتری" : "✅ پرداخت‌شده — دریافت وجه ندارد"}</span>
                  <b className="text-lg">{unpaid ? formatPrice(j.total) : ""}</b>
                </div>
                {j.courierNote && <p className="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-700">یادداشت شما: {j.courierNote}</p>}
                {j.deliveryFinishedAt && <p className="text-xs text-stone-500">ثبت نتیجه در ساعت {formatTime(j.deliveryFinishedAt)}</p>}

                {j.deliveryStatus === "assigned" && (
                  <Button size="lg" className="w-full !h-14 !text-base" disabled={!ready || busy === j.id} loading={busy === j.id} onClick={() => act(j, "pickup")}>{ready ? "📦 سفارش را تحویل گرفتم (در مسیر)" : "⏳ در حال آماده‌سازی — منتظر آماده‌شدن"}</Button>
                )}
                {j.deliveryStatus === "picked_up" && (
                  <div className="space-y-2">
                    <Button size="lg" className="w-full !h-14 !bg-emerald-600 !text-base hover:!bg-emerald-700" onClick={() => { setMethod("cash"); setNote(""); setDlg({ job: j, kind: "delivered" }); }}>✅ تحویل داده شد</Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="lg" variant="secondary" className="!h-12" onClick={() => { setNote(""); setDlg({ job: j, kind: "not_home" }); }}>🚪 عدم حضور مشتری</Button>
                      <Button size="lg" variant="secondary" className="!h-12" onClick={() => { setNote(""); setDlg({ job: j, kind: "failed" }); }}>⚠️ عدم تحویل</Button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </main>

      <Modal open={!!dlg} onClose={() => setDlg(null)} size="sm"
        title={dlg ? (dlg.kind === "delivered" ? `تحویل سفارش #${toFa(dlg.job.number)}` : dlg.kind === "not_home" ? "عدم حضور مشتری" : "عدم تحویل سفارش") : ""}
        footer={<><Button variant="ghost" onClick={() => setDlg(null)}>انصراف</Button><Button loading={busy === "dlg"} onClick={submitDlg} disabled={dlg?.kind === "failed" && !note.trim()} variant={dlg?.kind === "delivered" ? "primary" : "danger"}>{dlg?.kind === "delivered" ? "تأیید تحویل" : "ثبت"}</Button></>}>
        {dlg && (
          <div className="space-y-4">
            {dlg.kind === "delivered" && dlg.job.paymentStatus !== "paid" && (
              <div>
                <p className="mb-2 text-sm font-bold">مبلغ <b className="text-rose-600">{formatPrice(dlg.job.total)}</b> چگونه دریافت شد؟</p>
                <div className="grid gap-2">{METHODS.map(([k, l]) => <button key={k} onClick={() => setMethod(k)} className={cn("h-12 rounded-xl text-start text-sm font-bold ring-1 transition px-4", method === k ? "bg-stone-900 text-white ring-stone-900" : "bg-white ring-stone-200")}>{l}</button>)}</div>
              </div>
            )}
            {dlg.kind === "delivered" && dlg.job.paymentStatus === "paid" && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">این سفارش قبلاً پرداخت شده است؛ فقط تحویل را تأیید کنید.</p>}
            {dlg.kind !== "delivered" && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">{dlg.kind === "not_home" ? "پس از چند تماس، مشتری در محل حاضر نبود." : "سفارش به هر دلیلی تحویل داده نشد."} مدیر رستوران مطلع می‌شود و درباره‌ی سفارش تصمیم می‌گیرد.</p>}
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={dlg.kind === "failed" ? "دلیل عدم تحویل (الزامی)…" : "توضیح (اختیاری)…"} />
          </div>
        )}
      </Modal>
    </div>
  );
}
