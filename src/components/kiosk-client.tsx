"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import type { PublicMenu } from "@/lib/public-menu";
import { cn, ProductThumb } from "@/components/ui";

type Prod = PublicMenu["products"][number];
type Step = "welcome" | "type" | "menu" | "review" | "pospay" | "done";
type PosView = { id: number; status: string; picked: boolean; detail: string; remainingSec: number; paid: boolean; number: number; total: number; refNo: string };
export type KioskCfg = { template: string; welcomeTitle: string; welcomeSubtitle: string; idleSeconds: number; allowCounter: boolean; allowOnline: boolean; askPhone: boolean; allowPos: boolean; posOnline: boolean };

export function KioskClient({ data, cfg }: { data: PublicMenu; cfg: KioskCfg }) {
  const { business: biz, categories, products, tables } = data;
  const tpl = cfg.template;
  const dark = tpl === "dark";
  const cats = useMemo(() => categories.filter((c) => products.some((p) => p.categoryId === c.id)), [categories, products]);
  const [step, setStep] = useState<Step>("welcome");
  const [type, setType] = useState<"dine_in" | "takeaway">("dine_in");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cat, setCat] = useState<number>(cats[0]?.id ?? 0);
  const [tableId, setTableId] = useState("");
  const [phone, setPhone] = useState("");
  const [keypad, setKeypad] = useState(false);
  const [pay, setPay] = useState<"cash" | "ipg" | "pos">(cfg.allowCounter ? "cash" : cfg.allowPos ? "pos" : "ipg");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ number: number; total: number; paid: boolean } | null>(null);
  const [posJob, setPosJob] = useState<{ id: number; token: string; number: number; total: number } | null>(null);
  const [posV, setPosV] = useState<PosView | null>(null);
  const [posAvail, setPosAvail] = useState(cfg.posOnline);
  const [posBusy, setPosBusy] = useState(false);
  const [sentFor, setSentFor] = useState(0);
  const [idleLeft, setIdleLeft] = useState<number | null>(null);
  const [back, setBack] = useState(12);
  const last = useRef(Date.now());
  const stepRef = useRef<Step>("welcome");
  stepRef.current = step;

  const reset = useCallback(() => { setCart({}); setPhone(""); setTableId(""); setKeypad(false); setErr(""); setDone(null); setIdleLeft(null); setPay(cfg.allowCounter ? "cash" : cfg.allowPos ? "pos" : "ipg"); setPosJob(null); setPosV(null); setCat(cats[0]?.id ?? 0); setStep("welcome"); }, [cats, cfg.allowCounter, cfg.allowPos]);

  useEffect(() => {
    const bump = () => { last.current = Date.now(); setIdleLeft(null); };
    const evs = ["pointerdown", "keydown", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, bump));
    const t = setInterval(() => {
      if (stepRef.current === "welcome" || stepRef.current === "done" || stepRef.current === "pospay") return;
      const idle = (Date.now() - last.current) / 1000;
      if (idle >= cfg.idleSeconds) reset();
      else if (idle >= cfg.idleSeconds - 10) setIdleLeft(Math.ceil(cfg.idleSeconds - idle));
    }, 1000);
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [cfg.idleSeconds, reset]);

  useEffect(() => {
    if (step !== "done") return;
    setBack(15);
    const t = setInterval(() => setBack((b) => { if (b <= 1) { reset(); return 0; } return b - 1; }), 1000);
    return () => clearInterval(t);
  }, [step, reset]);

  const add = (id: number, d = 1) => setCart((c) => { const n = { ...c }; const v = (n[id] ?? 0) + d; if (v <= 0) delete n[id]; else n[id] = Math.min(30, v); return n; });
  const lines = Object.entries(cart).map(([id, qty]) => ({ p: products.find((x) => x.id === Number(id))!, qty })).filter((l) => l.p);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const tax = Math.round((subtotal * biz.taxPercent) / 100);
  const svc = Math.round((subtotal * biz.servicePercent) / 100);
  const total = subtotal + tax + svc;
  const items = products.filter((p) => p.categoryId === cat);
  const catIdx = cats.findIndex((c) => c.id === cat);

  const posShown = cfg.allowPos;
  const payOpts = ([cfg.allowCounter && "cash", posShown && "pos", cfg.allowOnline && "ipg"].filter(Boolean) as ("cash" | "pos" | "ipg")[]);
  useEffect(() => { if (payOpts.length && !payOpts.includes(pay)) setPay(payOpts[0]); }, [payOpts.join(","), pay]); // eslint-disable-line react-hooks/exhaustive-deps

  // is the card terminal reachable? re-check while the review screen is open
  useEffect(() => {
    if (!cfg.allowPos || step !== "review") return;
    let live = true;
    const check = () => api<{ online: boolean }>(`/api/public/${biz.slug}/pos`).then((r) => live && setPosAvail(r.online)).catch(() => live && setPosAvail(false));
    check();
    const t = setInterval(check, 15000);
    return () => { live = false; clearInterval(t); };
  }, [step, cfg.allowPos, biz.slug]);
  useEffect(() => { if (!posAvail && pay === "pos") setPay(payOpts.find((o) => o !== "pos") ?? "cash"); }, [posAvail]); // eslint-disable-line react-hooks/exhaustive-deps

  // live status of the card payment
  useEffect(() => {
    if (step !== "pospay" || !posJob) return;
    let live = true;
    const tick = () => api<PosView>(`/api/public/${biz.slug}/pos/${posJob.id}?t=${posJob.token}`).then((v) => {
      if (!live) return;
      setPosV(v);
      if (v.paid || v.status === "approved") { setDone({ number: v.number, total: v.total, paid: true }); setStep("done"); }
    }).catch(() => {});
    tick();
    const t = setInterval(tick, 1500);
    return () => { live = false; clearInterval(t); };
  }, [step, posJob, biz.slug]);
  useEffect(() => { if (step === "pospay") { const t = setInterval(() => setSentFor((x) => x + 1), 1000); return () => { clearInterval(t); setSentFor(0); }; } }, [step]);

  async function posAction(action: "retry" | "cash" | "cancel") {
    if (!posJob) return;
    setPosBusy(true); setErr("");
    try {
      const r = await api<{ token?: string; id?: number; ok?: boolean; number?: number; total?: number }>(`/api/public/${biz.slug}/pos/${posJob.id}`, { method: "POST", body: { t: posJob.token, action } });
      if (action === "retry" && r.token && r.id) { setPosJob({ ...posJob, id: r.id, token: r.token }); setPosV(null); setSentFor(0); }
      else if (action === "cash") { setDone({ number: posJob.number, total: posJob.total, paid: false }); setStep("done"); }
      else if (action === "cancel") reset();
    } catch (e) { setErr((e as Error).message); } finally { setPosBusy(false); }
  }

  async function submit() {
    setBusy(true); setErr("");
    try {
      const { item } = await api<{ item: { id: number; number: number; total: number; payUrl: string | null; pos: { id: number; token: string } | null } }>(`/api/public/${biz.slug}/orders`, {
        method: "POST",
        body: { kiosk: true, items: lines.map((l) => ({ productId: l.p.id, quantity: l.qty })), type, tableId: type === "dine_in" && tableId ? Number(tableId) : null, customerPhone: phone, payment: pay },
      });
      if (item.payUrl) { location.href = item.payUrl; return; }
      if (item.pos) { setPosJob({ ...item.pos, number: item.number, total: item.total }); setPosV(null); setStep("pospay"); return; }
      setDone({ number: item.number, total: item.total, paid: false });
      setStep("done");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const accent = biz.accentColor;
  const bg = dark ? "bg-[#0c0c12] text-white" : tpl === "simple" ? "bg-white text-stone-900" : "bg-stone-100 text-stone-900";
  const card = dark ? "bg-[#17171f] ring-1 ring-white/10" : "bg-white ring-1 ring-stone-200";

  const stepper = (p: Prod, big?: boolean) => {
    const q = cart[p.id] ?? 0;
    const sz = big ? "size-16 text-3xl" : "size-12 text-2xl";
    return q === 0 ? (
      <button onClick={(e) => { e.stopPropagation(); add(p.id); }} aria-label="افزودن" style={{ background: accent }} className={cn("flex items-center justify-center rounded-2xl font-black text-white shadow-lg active:scale-90", sz)}>＋</button>
    ) : (
      <div onClick={(e) => e.stopPropagation()} className={cn("flex items-center gap-1 rounded-2xl p-1 shadow-lg", dark ? "bg-white/10" : "bg-white ring-1 ring-stone-200")} style={{ borderColor: accent }}>
        <button onClick={() => add(p.id, -1)} aria-label="کم" className={cn("flex items-center justify-center rounded-xl bg-stone-200 font-black text-stone-800 active:scale-90", sz)}>−</button>
        <span className={cn("min-w-9 text-center font-black", big ? "text-3xl" : "text-2xl")}>{toFa(q)}</span>
        <button onClick={() => add(p.id)} aria-label="زیاد" style={{ background: accent }} className={cn("flex items-center justify-center rounded-xl font-black text-white active:scale-90", sz)}>＋</button>
      </div>
    );
  };
  const unavail = (p: Prod) => (!p.isAvailable ? <span className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-black/55 text-xl font-black text-white">ناموجود</span> : null);

  /* -------- product tiles per template -------- */
  const gridTile = (p: Prod) => (
    <div key={p.id} onClick={() => p.isAvailable && add(p.id)} className={cn("relative flex cursor-pointer flex-col overflow-hidden rounded-3xl shadow-sm active:scale-[0.98]", card, (cart[p.id] ?? 0) > 0 && "ring-4")} style={(cart[p.id] ?? 0) > 0 ? { ["--tw-ring-color" as string]: accent } : undefined}>
      {unavail(p)}
      <ProductThumb imageUrl={p.imageUrl} emoji={p.emoji} className="h-40 w-full text-6xl" />
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-xl font-extrabold leading-8">{p.name}</h3>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3"><b className="text-xl" style={{ color: dark ? "#fff" : accent }}>{formatPrice(p.price)}</b>{stepper(p)}</div>
      </div>
    </div>
  );
  const photoTile = (p: Prod) => (
    <div key={p.id} onClick={() => p.isAvailable && add(p.id)} className="relative h-72 cursor-pointer overflow-hidden rounded-3xl shadow-md active:scale-[0.98]">
      {unavail(p)}
      <ProductThumb imageUrl={p.imageUrl} emoji={p.emoji} className="absolute inset-0 size-full text-8xl" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      {(cart[p.id] ?? 0) > 0 && <span style={{ background: accent }} className="absolute start-3 top-3 flex size-12 items-center justify-center rounded-full text-2xl font-black text-white shadow-lg">{toFa(cart[p.id])}</span>}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 text-white"><div><h3 className="text-2xl font-black leading-9">{p.name}</h3><b className="text-xl">{formatPrice(p.price)}</b></div>{stepper(p, true)}</div>
    </div>
  );
  const rowTile = (p: Prod) => (
    <div key={p.id} className="relative flex items-center gap-5 rounded-3xl border-2 border-stone-200 bg-white p-4">
      {unavail(p)}
      <ProductThumb imageUrl={p.imageUrl} emoji={p.emoji} className="size-24 shrink-0 rounded-2xl text-5xl" />
      <div className="min-w-0 flex-1"><h3 className="text-2xl font-black leading-9">{p.name}</h3>{p.description && <p className="line-clamp-1 text-base text-stone-500">{p.description}</p>}<b className="mt-1 block text-2xl" style={{ color: accent }}>{formatPrice(p.price)}</b></div>
      {stepper(p, true)}
    </div>
  );

  const catBtn = (c: (typeof cats)[number], vertical?: boolean) => (
    <button key={c.id} onClick={() => setCat(c.id)} style={cat === c.id ? { background: accent, color: "#fff" } : undefined} className={cn("shrink-0 rounded-2xl font-extrabold transition active:scale-95", vertical ? "flex h-24 w-full flex-col items-center justify-center gap-1 text-xl" : "h-16 px-7 text-xl", cat !== c.id && (dark ? "bg-white/10 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200"))}>
      <span className={vertical ? "text-3xl" : ""}>{c.emoji}</span>{c.name}
    </button>
  );

  const menuBody = () => {
    if (tpl === "classic")
      return (
        <div className="flex min-h-0 flex-1">
          <aside className="w-40 shrink-0 space-y-2 overflow-y-auto bg-white p-3 shadow-inner">{cats.map((c) => catBtn(c, true))}</aside>
          <main className="grid flex-1 content-start gap-4 overflow-y-auto p-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">{items.map(gridTile)}</main>
        </div>
      );
    if (tpl === "photo")
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="no-scrollbar flex shrink-0 gap-3 overflow-x-auto p-4">{cats.map((c) => catBtn(c))}</div>
          <main className="grid flex-1 content-start gap-4 overflow-y-auto p-4 pt-0 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">{items.map(photoTile)}</main>
        </div>
      );
    if (tpl === "simple")
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="no-scrollbar flex shrink-0 gap-3 overflow-x-auto border-b-2 border-stone-200 p-4">{cats.map((c) => catBtn(c))}</div>
          <main className="flex-1 space-y-3 overflow-y-auto p-4">{items.map(rowTile)}</main>
        </div>
      );
    if (tpl === "dark")
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="no-scrollbar flex shrink-0 gap-3 overflow-x-auto p-4">{cats.map((c) => catBtn(c))}</div>
          <main className="grid flex-1 content-start gap-4 overflow-y-auto p-4 pt-0 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">{items.map(gridTile)}</main>
        </div>
      );
    // wizard: one category per screen
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-3xl font-black">{cats[catIdx]?.emoji} {cats[catIdx]?.name}</h2><span className="text-lg font-bold text-stone-500">مرحله {toFa(catIdx + 1)} از {toFa(cats.length)}</span></div>
          <div className="flex gap-1.5">{cats.map((c, i) => <button key={c.id} aria-label={c.name} onClick={() => setCat(c.id)} className="h-3 flex-1 rounded-full" style={{ background: i <= catIdx ? accent : "#d6d3d1" }} />)}</div>
        </div>
        <main className="grid flex-1 content-start gap-4 overflow-y-auto p-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">{items.map(photoTile)}</main>
        <div className="flex shrink-0 gap-3 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,.06)]">
          <button disabled={catIdx <= 0} onClick={() => setCat(cats[catIdx - 1].id)} className="h-20 flex-1 rounded-2xl bg-stone-200 text-2xl font-black text-stone-700 disabled:opacity-30 active:scale-95">▶ دسته قبلی</button>
          {catIdx < cats.length - 1 ? <button onClick={() => setCat(cats[catIdx + 1].id)} style={{ background: accent }} className="h-20 flex-[2] rounded-2xl text-2xl font-black text-white active:scale-95">دسته بعدی ◀</button> : <button disabled={!count} onClick={() => setStep("review")} style={{ background: accent }} className="h-20 flex-[2] rounded-2xl text-2xl font-black text-white disabled:opacity-40 active:scale-95">مرور و ثبت سفارش ✔</button>}
        </div>
      </div>
    );
  };

  /* -------- screens -------- */
  const hero = products.find((p) => p.isFeatured && p.imageUrl)?.imageUrl ?? products.find((p) => p.imageUrl)?.imageUrl;
  if (step === "welcome")
    return (
      <div onClick={() => { last.current = Date.now(); setStep("type"); }} className="relative flex h-dvh cursor-pointer select-none flex-col items-center justify-center overflow-hidden text-center text-white" style={{ background: `linear-gradient(160deg, ${accent}, #111)` }}>
        {hero && (tpl === "photo" || tpl === "dark") && <div className="absolute inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: `url(${hero})` }} />}
        <div className="relative px-8">
          <div className="mx-auto flex size-40 items-center justify-center rounded-[2.5rem] bg-white text-8xl shadow-2xl">{biz.logoEmoji}</div>
          <h1 className="mt-8 text-6xl font-black leading-tight">{cfg.welcomeTitle}</h1>
          <p className="mt-4 text-3xl text-white/85">{cfg.welcomeSubtitle}</p>
          <div className="mx-auto mt-14 w-fit animate-pulse rounded-full bg-white px-14 py-6 text-4xl font-black shadow-2xl" style={{ color: accent }}>👆 شروع سفارش</div>
        </div>
      </div>
    );

  if (step === "type")
    return (
      <div className={cn("flex h-dvh flex-col items-center justify-center gap-8 p-8", bg)}>
        <h2 className="text-5xl font-black">سفارش را کجا میل می‌کنید؟</h2>
        <div className="grid w-full max-w-4xl gap-6 sm:grid-cols-2">
          {([["dine_in", "🍽️", "صرف در محل", "سالن / میز"], ["takeaway", "🛍️", "همراه می‌برم", "بیرون‌بر"]] as const).map(([k, e, t, s]) => (
            <button key={k} onClick={() => { setType(k); setStep("menu"); }} className={cn("flex h-72 flex-col items-center justify-center gap-3 rounded-[2rem] shadow-xl active:scale-95", card)}><span className="text-8xl">{e}</span><b className="text-4xl">{t}</b><span className="text-xl opacity-60">{s}</span></button>
          ))}
        </div>
        <button onClick={reset} className="rounded-2xl px-8 py-4 text-2xl font-bold opacity-60">← بازگشت</button>
      </div>
    );

  if (step === "done" && done)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 p-8 text-center text-white" style={{ background: `linear-gradient(160deg, ${accent}, #111)` }}>
        <div className="text-9xl">✅</div>
        <h2 className="text-5xl font-black">سفارش شما ثبت شد</h2>
        <p className="text-3xl">شماره سفارش شما</p>
        <div className="rounded-[2rem] bg-white px-20 py-8 text-9xl font-black shadow-2xl" style={{ color: accent }}>{toFa(done.number)}</div>
        <p className="max-w-2xl text-3xl leading-relaxed">{done.paid ? "پرداخت با کارت انجام شد. لطفاً شماره‌ی سفارش را تا زمان تحویل نگه دارید." : `لطفاً مبلغ ${formatPrice(done.total)} را با ارائه این شماره در صندوق پرداخت کنید.`}</p>
        <button onClick={reset} className="mt-4 rounded-full bg-white px-14 py-6 text-3xl font-black shadow-xl" style={{ color: accent }}>سفارش جدید ({toFa(back)})</button>
      </div>
    );

  const overlay = idleLeft !== null && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8">
      <div className="w-full max-w-xl rounded-[2rem] bg-white p-10 text-center text-stone-900 shadow-2xl">
        <p className="text-4xl font-black">ادامه می‌دهید؟</p>
        <p className="mt-3 text-2xl text-stone-500">سفارش تا {toFa(idleLeft)} ثانیه‌ی دیگر لغو می‌شود</p>
        <button onClick={() => { last.current = Date.now(); setIdleLeft(null); }} style={{ background: accent }} className="mt-8 h-24 w-full rounded-3xl text-3xl font-black text-white active:scale-95">بله، ادامه می‌دهم</button>
      </div>
    </div>
  );

  const header = (title: string, onBack: () => void) => (
    <header className={cn("flex shrink-0 items-center gap-4 p-3 shadow-sm", dark ? "bg-[#17171f]" : "bg-white")}>
      <button onClick={onBack} className={cn("h-16 rounded-2xl px-6 text-xl font-bold active:scale-95", dark ? "bg-white/10" : "bg-stone-100")}>▶ بازگشت</button>
      <h1 className="flex-1 text-center text-3xl font-black">{title}</h1>
      <button onClick={reset} className="h-16 rounded-2xl bg-rose-50 px-6 text-xl font-bold text-rose-600 active:scale-95">✕ لغو</button>
    </header>
  );

  if (step === "pospay" && posJob) {
    const st = posV?.status ?? "pending";
    const failed = st === "failed" || st === "canceled";
    const picked = !!posV?.picked;
    const waitingLong = !picked && sentFor > 20;
    const mm = posV ? `${toFa(Math.floor(posV.remainingSec / 60))}:${toFa(String(posV.remainingSec % 60).padStart(2, "0"))}` : "";
    return (
      <div className={cn("flex h-dvh flex-col items-center justify-center gap-6 p-8 text-center", bg)}>
        {failed ? (
          <>
            <div className="text-9xl">⚠️</div>
            <h2 className="text-5xl font-black">پرداخت انجام نشد</h2>
            <p className="max-w-3xl text-3xl leading-relaxed opacity-80">{posV?.detail || "تراکنش کامل نشد."}</p>
            {err && <p className="rounded-2xl bg-rose-100 p-4 text-xl font-bold text-rose-700">{err}</p>}
            <div className="mt-4 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
              <button disabled={posBusy} onClick={() => posAction("retry")} style={{ background: accent }} className="h-28 rounded-3xl text-3xl font-black text-white active:scale-95 disabled:opacity-50">🔁 تلاش دوباره</button>
              {cfg.allowCounter && <button disabled={posBusy} onClick={() => posAction("cash")} className={cn("h-28 rounded-3xl text-3xl font-black active:scale-95", card)}>💵 پرداخت در صندوق</button>}
              <button disabled={posBusy} onClick={() => posAction("cancel")} className="h-28 rounded-3xl bg-rose-100 text-3xl font-black text-rose-700 active:scale-95">✕ لغو سفارش</button>
            </div>
          </>
        ) : (
          <>
            <div className="relative flex size-44 items-center justify-center rounded-full text-8xl" style={{ background: `${accent}22` }}>
              <span className="absolute inset-0 animate-ping rounded-full" style={{ background: `${accent}18` }} />💳
            </div>
            <h2 className="text-5xl font-black">{picked ? "کارت را روی دستگاه وارد کنید" : "در حال ارسال مبلغ به دستگاه…"}</h2>
            <div className="rounded-[2rem] px-14 py-6 text-6xl font-black shadow-xl" style={{ background: accent, color: "#fff" }}>{formatPrice(posJob.total)}</div>
            <p className="max-w-3xl text-3xl leading-relaxed opacity-80">{picked ? "مبلغ روی دستگاه کارتخوان نمایش داده شد. کارت را بکشید یا بزنید و رمز خود را وارد کنید." : waitingLong ? "دستگاه کارتخوان پاسخ نمی‌دهد. می‌توانید در صندوق پرداخت کنید یا سفارش را لغو کنید." : "چند لحظه صبر کنید."}</p>
            {picked && posV && <p className="text-2xl opacity-60">زمان باقی‌مانده: {mm}</p>}
            {picked && <p className="text-xl opacity-50">برای انصراف، تراکنش را روی خود کارتخوان لغو کنید.</p>}
            {err && <p className="rounded-2xl bg-rose-100 p-4 text-xl font-bold text-rose-700">{err}</p>}
            {!picked && (
              <div className="mt-2 flex w-full max-w-3xl gap-4">
                {cfg.allowCounter && <button disabled={posBusy || !waitingLong} onClick={() => posAction("cash")} className={cn("h-24 flex-1 rounded-3xl text-2xl font-black active:scale-95 disabled:opacity-30", card)}>💵 پرداخت در صندوق</button>}
                <button disabled={posBusy} onClick={() => posAction("cancel")} className="h-24 flex-1 rounded-3xl bg-rose-100 text-2xl font-black text-rose-700 active:scale-95 disabled:opacity-50">✕ لغو سفارش</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (step === "review") {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "C"];
    return (
      <div className={cn("flex h-dvh flex-col", bg)}>
        {header("مرور و تأیید سفارش", () => setStep("menu"))}
        <main className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="space-y-3">{lines.map(({ p, qty }) => (
            <div key={p.id} className={cn("flex items-center gap-4 rounded-3xl p-4", card)}>
              <ProductThumb imageUrl={p.imageUrl} emoji={p.emoji} className="size-20 shrink-0 rounded-2xl text-4xl" />
              <div className="min-w-0 flex-1"><h3 className="text-2xl font-black">{p.name}</h3><p className="text-xl opacity-70">{formatPrice(p.price * qty)}</p></div>
              {stepper(p, true)}
            </div>
          ))}</div>
          {lines.length === 0 && <p className="py-16 text-center text-3xl opacity-60">سبد سفارش خالی است</p>}
          {type === "dine_in" && tables.length > 0 && (
            <section className={cn("rounded-3xl p-5", card)}>
              <h3 className="mb-3 text-2xl font-black">شماره میز (اختیاری)</h3>
              <div className="flex flex-wrap gap-3">{[{ id: 0, name: "پیشخوان" }, ...tables].map((t) => <button key={t.id} onClick={() => setTableId(t.id ? String(t.id) : "")} style={String(t.id || "") === tableId ? { background: accent, color: "#fff" } : undefined} className={cn("h-16 min-w-24 rounded-2xl px-5 text-xl font-bold active:scale-95", String(t.id || "") !== tableId && (dark ? "bg-white/10" : "bg-stone-100"))}>{t.name}</button>)}</div>
            </section>
          )}
          {cfg.askPhone && (
            <section className={cn("rounded-3xl p-5", card)}>
              <div className="flex items-center justify-between gap-3"><div><h3 className="text-2xl font-black">شماره موبایل (باشگاه مشتریان)</h3><p className="text-lg opacity-60">اختیاری؛ برای امتیاز و کش‌بک</p></div><button onClick={() => setKeypad((k) => !k)} className={cn("h-16 rounded-2xl px-6 text-xl font-bold", dark ? "bg-white/10" : "bg-stone-100")}>{phone ? toFa(phone) : "ثبت شماره"}</button></div>
              {keypad && (
                <div className="mx-auto mt-4 max-w-sm">
                  <div className="mb-3 h-16 rounded-2xl bg-stone-900 text-center text-4xl font-black leading-[4rem] tracking-widest text-white" dir="ltr">{phone || "09——"}</div>
                  <div className="grid grid-cols-3 gap-3">{keys.map((k) => <button key={k} onClick={() => setPhone((p) => (k === "⌫" ? p.slice(0, -1) : k === "C" ? "" : p.length < 11 ? p + k : p))} className={cn("h-16 rounded-2xl text-3xl font-black active:scale-95", dark ? "bg-white/10" : "bg-stone-100")}>{k}</button>)}</div>
                </div>
              )}
            </section>
          )}
          {payOpts.length > 1 || (cfg.allowPos && !posAvail) ? (
            <section className="space-y-3">
              <h3 className="text-2xl font-black">روش پرداخت</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {([["pos", "💳", "کارتخوان (همین‌جا)"], ["cash", "💵", "پرداخت در صندوق"], ["ipg", "📱", "پرداخت آنلاین"]] as const).filter(([k]) => (k === "pos" ? cfg.allowPos : k === "cash" ? cfg.allowCounter : cfg.allowOnline)).map(([k, e, t]) => {
                  const off = k === "pos" && !posAvail;
                  return <button key={k} disabled={off} onClick={() => setPay(k)} style={pay === k && !off ? { background: accent, color: "#fff" } : undefined} className={cn("flex h-28 flex-col items-center justify-center gap-1 rounded-3xl text-2xl font-black active:scale-95", (pay !== k || off) && card, off && "opacity-40")}><span className="text-4xl">{e}</span>{t}{off && <span className="text-sm font-bold">در دسترس نیست</span>}</button>;
                })}
              </div>
            </section>
          ) : null}
          {err && <p className="rounded-2xl bg-rose-100 p-5 text-xl font-bold text-rose-700">{err}</p>}
        </main>
        <footer className={cn("shrink-0 space-y-2 p-4 shadow-[0_-4px_16px_rgba(0,0,0,.08)]", dark ? "bg-[#17171f]" : "bg-white")}>
          <div className="flex justify-between text-xl opacity-70"><span>جمع اقلام</span><span>{formatPrice(subtotal)}</span></div>
          {tax > 0 && <div className="flex justify-between text-xl opacity-70"><span>مالیات</span><span>{formatPrice(tax)}</span></div>}
          {svc > 0 && <div className="flex justify-between text-xl opacity-70"><span>خدمات</span><span>{formatPrice(svc)}</span></div>}
          <button disabled={!count || busy} onClick={() => void submit()} style={{ background: accent }} className="flex h-24 w-full items-center justify-between rounded-3xl px-8 text-3xl font-black text-white disabled:opacity-40 active:scale-[0.98]">
            <span>{busy ? "در حال ثبت…" : "✔ تأیید و ثبت سفارش"}</span><span>{formatPrice(total)}</span>
          </button>
        </footer>
        {overlay}
      </div>
    );
  }

  // menu
  return (
    <div className={cn("flex h-dvh flex-col", bg)}>
      {header(`${biz.logoEmoji} ${biz.name}`, () => setStep("type"))}
      {cats.length === 0 ? <p className="m-auto text-3xl opacity-60">منو هنوز تکمیل نشده است</p> : menuBody()}
      {tpl !== "wizard" || count > 0 ? (
        <footer className={cn("shrink-0 p-3 shadow-[0_-4px_16px_rgba(0,0,0,.1)]", dark ? "bg-[#17171f]" : "bg-white")}>
          <button disabled={!count} onClick={() => setStep("review")} style={{ background: count ? accent : "#a8a29e" }} className="flex h-24 w-full items-center justify-between rounded-3xl px-8 text-3xl font-black text-white active:scale-[0.98]">
            <span className="flex items-center gap-4"><span className="flex size-14 items-center justify-center rounded-full bg-white/25 text-3xl">{toFa(count)}</span>{count ? "مشاهده سفارش" : "محصولی انتخاب نشده"}</span>
            <span>{formatPrice(subtotal)}</span>
          </button>
        </footer>
      ) : null}
      {overlay}
    </div>
  );
}
