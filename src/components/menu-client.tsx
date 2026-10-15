"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import { LANGS } from "@/lib/plans";
import type { PublicMenu } from "@/lib/public-menu";
import { ModelViewer } from "@/components/model-viewer";
import { MapPicker } from "@/components/map-picker";
import { haversineKm } from "@/lib/geo";
import { Button, cn, Icon, Input, Modal, ProductThumb, Select, Textarea, ToastProvider, useToast } from "@/components/ui";

type Prod = PublicMenu["products"][number];
type OType = "dine_in" | "takeaway" | "delivery";

const DICT: Record<string, Record<string, string>> = {
  fa: { search: "جستجو در منو…", featured: "⭐ پیشنهاد ویژه", cart: "مشاهده و ثبت سفارش", sold: "ناموجود", submit: "ثبت سفارش", total: "مبلغ نهایی", sub: "جمع اقلام", suggest: "همراه با سفارش شما پیشنهاد می‌کنیم", ar: "نمایش سه‌بعدی (AR)", menu: "منوی دیجیتال", empty: "موردی پیدا نشد" },
  en: { search: "Search the menu…", featured: "⭐ Featured", cart: "View order", sold: "Sold out", submit: "Place order", total: "Total", sub: "Subtotal", suggest: "Goes well with your order", ar: "View in 3D / AR", menu: "Digital menu", empty: "Nothing found" },
  ar: { search: "ابحث في القائمة…", featured: "⭐ مميز", cart: "عرض الطلب", sold: "نفدت الكمية", submit: "إرسال الطلب", total: "المجموع", sub: "المجموع الفرعي", suggest: "يناسب طلبك", ar: "عرض ثلاثي الأبعاد", menu: "القائمة الرقمية", empty: "لا نتائج" },
  tr: { search: "Menüde ara…", featured: "⭐ Öne çıkanlar", cart: "Siparişi gör", sold: "Tükendi", submit: "Siparişi ver", total: "Toplam", sub: "Ara toplam", suggest: "Siparişinize yakışır", ar: "3D / AR görüntüle", menu: "Dijital menü", empty: "Sonuç yok" },
};

export function MenuClient(props: { data: PublicMenu; initialTableId: number | null }) {
  return (
    <ToastProvider>
      <Menu {...props} />
    </ToastProvider>
  );
}

function Menu({ data, initialTableId }: { data: PublicMenu; initialTableId: number | null }) {
  const { business: biz, categories, products, tables, zones, caps, languages } = data;
  const toast = useToast();
  const [lang, setLang] = useState("fa");
  const t = (k: string) => (DICT[lang] ?? DICT.en)[k] ?? DICT.en[k];
  const dir = LANGS[lang]?.dir ?? "rtl";
  const trMap = useMemo(() => new Map(data.translations.map((x) => [`${x.type}:${x.id}:${x.lang}`, x])), [data.translations]);
  const nameOf = (type: "product" | "category", id: number, fb: string) => (lang === "fa" ? fb : trMap.get(`${type}:${id}:${lang}`)?.name || fb);
  const descOf = (p: Prod) => (lang === "fa" ? p.description : trMap.get(`product:${p.id}:${lang}`)?.description || p.description);

  const [cart, setCart] = useState<Record<number, number>>({});
  const [q, setQ] = useState("");
  const [active, setActive] = useState<number | null>(categories[0]?.id ?? null);
  const [sheet, setSheet] = useState(false);
  const [type, setType] = useState<OType>(initialTableId || caps.selfOrder ? "dine_in" : "delivery");
  const [tableId, setTableId] = useState<string>(initialTableId ? String(initialTableId) : "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pre, setPre] = useState(false);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ code: string; amount: number } | null>(null);
  const [useCashback, setUseCashback] = useState(false);
  const [member, setMember] = useState<{ exists: boolean; balance: number } | null>(null);
  const [payment, setPayment] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ number: number; total: number } | null>(null);
  const [recs, setRecs] = useState<{ id: number; name: string; emoji: string; price: number }[]>([]);
  const [ar, setAr] = useState<Prod | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const lockRef = useRef(false);

  const canOrder = biz.acceptOrders && (caps.selfOrder || caps.delivery);
  const term = q.trim();
  const types: { k: OType; l: string }[] = [
    ...(caps.selfOrder ? [{ k: "dine_in" as const, l: "🪑 سالن" }, { k: "takeaway" as const, l: "🛍️ بیرون‌بر" }] : []),
    ...(caps.delivery ? [{ k: "delivery" as const, l: "🛵 ارسال" }] : []),
  ];

  const grouped = useMemo(() => {
    const list = products.filter((p) => !term || p.name.includes(term) || p.description.includes(term) || nameOf("product", p.id, p.name).toLowerCase().includes(term.toLowerCase()));
    const sections = categories.map((c) => ({ key: String(c.id), id: c.id, title: `${c.emoji} ${nameOf("category", c.id, c.name)}`, items: list.filter((p) => p.categoryId === c.id) })).filter((s) => s.items.length);
    const rest = list.filter((p) => p.categoryId === null);
    if (rest.length) sections.push({ key: "other", id: -1, title: "…", items: rest });
    return sections;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, categories, term, lang]);

  const featured = products.filter((p) => p.isFeatured && p.isAvailable);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        if (lockRef.current) return;
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(Number((vis.target as HTMLElement).dataset.cat));
      },
      { rootMargin: "-120px 0px -65% 0px" },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [grouped]);

  function jump(id: number) {
    setActive(id);
    lockRef.current = true;
    sectionRefs.current[String(id)]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => (lockRef.current = false), 800);
  }

  const add = (id: number, d = 1) =>
    setCart((c) => {
      const n = { ...c };
      const v = (n[id] ?? 0) + d;
      if (v <= 0) delete n[id];
      else n[id] = Math.min(50, v);
      return n;
    });

  const lines = Object.entries(cart).map(([id, qty]) => ({ p: products.find((x) => x.id === Number(id))!, qty })).filter((l) => l.p);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const disc = applied ? Math.min(applied.amount, subtotal) : 0;
  const radiusMode = zones.some((z) => z.radiusKm > 0);
  const dist = biz.lat != null && biz.lng != null && pin ? haversineKm({ lat: biz.lat, lng: biz.lng }, pin) : null;
  const autoZone = radiusMode && dist !== null ? zones.filter((z) => z.radiusKm > 0 && z.radiusKm >= dist).sort((a, b) => a.radiusKm - b.radiusKm)[0] : undefined;
  const zone = radiusMode ? autoZone : zones.find((z) => String(z.id) === zoneId);
  const outOfRange = type === "delivery" && radiusMode && dist !== null && !autoZone;
  const fee = type === "delivery" ? (zone?.fee ?? 0) : 0;
  const tax = Math.round(((subtotal - disc) * biz.taxPercent) / 100);
  const svc = type === "delivery" ? 0 : Math.round(((subtotal - disc) * biz.servicePercent) / 100);
  const total = subtotal - disc + tax + svc + fee;

  // cross-sell recommendations
  const idsKey = Object.keys(cart).sort().join(",");
  useEffect(() => {
    if (!caps.crossSell || !idsKey) { setRecs([]); return; }
    let live = true;
    const h = setTimeout(() => {
      api<{ items: typeof recs }>(`/api/public/${biz.slug}/recommendations?ids=${idsKey}`).then((r) => live && setRecs(r.items)).catch(() => {});
    }, 300);
    return () => { live = false; clearTimeout(h); };
  }, [idsKey, caps.crossSell, biz.slug]);

  useEffect(() => {
    const p = phone.trim();
    if (!caps.cashback || p.length < 10) { setMember(null); setUseCashback(false); return; }
    let live = true;
    setMember(null);
    const h = setTimeout(() => { api<{ exists: boolean; balance: number }>(`/api/public/${biz.slug}/customer?phone=${encodeURIComponent(p)}`).then((r) => { if (live) { setMember(r); if (!(r.exists && r.balance > 0)) setUseCashback(false); } }).catch(() => live && setMember({ exists: false, balance: 0 })); }, 400);
    return () => { live = false; clearTimeout(h); };
  }, [phone, caps.cashback, biz.slug]);

  async function applyCode() {
    try {
      const r = await api<{ code: string; amount: number }>(`/api/public/${biz.slug}/discount?code=${encodeURIComponent(code)}&subtotal=${subtotal}`);
      setApplied(r);
      toast(`کد تخفیف اعمال شد`);
    } catch (e) { setApplied(null); toast((e as Error).message, "error"); }
  }

  async function submit() {
    if (!lines.length) return;
    if (type === "delivery" && (!address.trim() || !phone.trim())) return toast("آدرس و شماره تماس را وارد کنید", "error");
    if (type === "delivery" && radiusMode && !pin) return toast("محل تحویل را روی نقشه مشخص کنید", "error");
    if (outOfRange) return toast("آدرس انتخاب‌شده خارج از محدوده ارسال است", "error");
    if (pre && !when) return toast("زمان پیش‌سفارش را مشخص کنید", "error");
    setBusy(true);
    try {
      const { item } = await api<{ item: { number: number; total: number; payUrl: string | null } }>(`/api/public/${biz.slug}/orders`, {
        method: "POST",
        body: {
          items: lines.map((l) => ({ productId: l.p.id, quantity: l.qty })),
          type, tableId: type === "dine_in" && tableId ? Number(tableId) : null,
          customerName: name, customerPhone: phone, address, zoneId: zone?.id ?? null, lat: pin?.lat ?? null, lng: pin?.lng ?? null,
          scheduledFor: pre && when ? new Date(when).toISOString() : null,
          discountCode: applied?.code ?? "", useCashback, payment, note,
        },
      });
      setCart({});
      setSheet(false);
      if (item.payUrl) { location.href = item.payUrl; return; }
      setDone(item);
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }

  const accent = { "--accent": biz.accentColor } as React.CSSProperties;

  const renderCard = (p: Prod) => {
    const qty = cart[p.id] ?? 0;
    const off = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    return (
      <div className={cn("flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200/70", !p.isAvailable && "opacity-60")}>
        <div className="relative shrink-0">
          <ProductThumb imageUrl={p.imageUrl} emoji={p.emoji} className="size-24 rounded-xl sm:size-28" />
          {off > 0 && <span className="absolute start-1 top-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{toFa(off)}٪</span>}
          {caps.ar && p.arModelUrl && <button onClick={() => setAr(p)} className="absolute inset-x-1 bottom-1 rounded-lg bg-stone-900/80 py-0.5 text-[10px] font-bold text-white backdrop-blur" aria-label={t("ar")}>🕶️ AR</button>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="font-bold leading-6">{nameOf("product", p.id, p.name)}</h3>
          <p className="line-clamp-2 flex-1 text-xs leading-5 text-stone-500">{descOf(p)}</p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              {p.oldPrice && p.oldPrice > p.price && <p className="text-[11px] text-stone-400 line-through">{formatPrice(p.oldPrice)}</p>}
              <p className="text-sm font-extrabold">{formatPrice(p.price)}</p>
            </div>
            {!p.isAvailable ? (
              <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-500">{t("sold")}</span>
            ) : canOrder ? (
              qty === 0 ? (
                <button onClick={() => add(p.id)} aria-label="+" className="flex size-9 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-md transition active:scale-90"><Icon name="plus" /></button>
              ) : (
                <div className="flex items-center gap-1 rounded-xl bg-[var(--accent)] p-0.5 text-white shadow-md animate-pop">
                  <button onClick={() => add(p.id, -1)} aria-label="-" className="flex size-8 items-center justify-center rounded-lg active:bg-white/20"><Icon name="minus" className="size-4" /></button>
                  <span className="w-5 text-center text-sm font-bold">{toFa(qty)}</span>
                  <button onClick={() => add(p.id)} aria-label="+" className="flex size-8 items-center justify-center rounded-lg active:bg-white/20"><Icon name="plus" className="size-4" /></button>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const payOptions = [
    { k: "cash", l: type === "delivery" ? "💵 پرداخت درب منزل" : "💵 پرداخت در محل" },
    ...(caps.ipg ? [{ k: "ipg", l: "🏦 پرداخت آنلاین (درگاه بانکی)" }] : []),
    ...(caps.snappay ? [{ k: "snappay", l: "🟦 اسنپ‌پی (اقساطی)" }] : []),
    ...(caps.digipay ? [{ k: "digipay", l: "🟧 دیجی‌پی (اقساطی)" }] : []),
  ];

  return (
    <div dir={dir} style={accent} className="mx-auto min-h-dvh max-w-2xl bg-[#f6f5f3] pb-28 shadow-xl">
      <header className="relative overflow-hidden px-5 pb-8 pt-10 text-white" style={{ background: `linear-gradient(135deg, ${biz.accentColor}, ${biz.accentColor}cc 60%, #1c1917)` }}>
        <div className="pointer-events-none absolute -end-10 -top-10 size-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 start-10 size-40 rounded-full bg-white/10" />
        {languages.length > 1 && (
          <div className="relative mb-4 flex flex-wrap gap-1.5" dir="ltr">
            {languages.map((l) => <button key={l} onClick={() => setLang(l)} className={cn("rounded-full px-3 py-1 text-xs font-bold backdrop-blur transition", lang === l ? "bg-white text-stone-900" : "bg-white/15 text-white")}>{LANGS[l]?.name ?? l}</button>)}
          </div>
        )}
        <div className="relative flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-white text-3xl shadow-lg">{biz.logoEmoji}</span>
          <div><h1 className="text-xl font-extrabold">{biz.name}</h1><p className="mt-1 text-xs text-white/80">{t("menu")}</p></div>
        </div>
        {biz.description && lang === "fa" && <p className="relative mt-4 text-sm leading-7 text-white/90">{biz.description}</p>}
        <div className="relative mt-4 flex flex-wrap gap-2 text-xs">
          {biz.phone && <a href={`tel:${biz.phone}`} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"><Icon name="phone" className="size-3.5" />{biz.phone}</a>}
          {biz.address && lang === "fa" && <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"><Icon name="pin" className="size-3.5" />{biz.address}</span>}
          {biz.instagram && <a href={`https://instagram.com/${biz.instagram}`} target="_blank" className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur" dir="ltr">@{biz.instagram}</a>}
          {caps.miniSite && <a href={`/s/${biz.slug}`} className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">🌍 وب‌سایت ما</a>}
        </div>
        {initialTableId && caps.selfOrder && tables.find((x) => x.id === initialTableId) && canOrder && (
          <div className="relative mt-5 flex items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 text-sm font-semibold text-stone-800">🪑 {tables.find((x) => x.id === initialTableId)!.name}</div>
        )}
      </header>

      <div className="sticky top-0 z-20 -mt-4 rounded-t-3xl bg-[#f6f5f3]/95 pb-2 pt-4 backdrop-blur">
        <div className="px-4"><div className="relative"><Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><Input className="ps-9" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
        {!term && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
            {grouped.map((s) => <button key={s.key} onClick={() => jump(s.id)} style={active === s.id ? { background: biz.accentColor } : undefined} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition", active === s.id ? "text-white shadow-md" : "bg-white text-stone-600 ring-1 ring-stone-200")}>{s.title}</button>)}
          </div>
        )}
      </div>

      <main className="space-y-8 px-4 pt-4">
        {!term && featured.length > 0 && (
          <section>
            <h2 className="mb-3 text-base font-extrabold">{t("featured")}</h2>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
              {featured.map((p) => (
                <div key={p.id} className="w-44 shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70">
                  <ProductThumb imageUrl={p.imageUrl} emoji={p.emoji} className="h-28 w-full" />
                  <div className="p-3"><p className="truncate text-sm font-bold">{nameOf("product", p.id, p.name)}</p>
                    <div className="mt-2 flex items-center justify-between"><span className="text-xs font-extrabold">{formatPrice(p.price)}</span>{canOrder && <button onClick={() => add(p.id)} aria-label="+" className="flex size-7 items-center justify-center rounded-lg bg-[var(--accent)] text-white active:scale-90"><Icon name="plus" className="size-4" /></button>}</div></div>
                </div>
              ))}
            </div>
          </section>
        )}
        {grouped.length === 0 ? (
          <div className="py-16 text-center text-stone-500"><div className="text-5xl">{products.length ? "🔍" : "🍽️"}</div><p className="mt-3 font-semibold">{t("empty")}</p></div>
        ) : grouped.map((s) => (
          <section key={s.key} data-cat={s.id} ref={(el) => { sectionRefs.current[s.key] = el; }} className="scroll-mt-32">
            <h2 className="mb-3 text-base font-extrabold">{s.title}</h2>
            <div className="space-y-3">{s.items.map((p) => <div key={p.id}>{renderCard(p)}</div>)}</div>
          </section>
        ))}
        <footer className="pb-4 pt-6 text-center text-[11px] text-stone-400">Powered by <b>منوی دیجیتال</b></footer>
      </main>

      {canOrder && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl p-3 animate-slide-up">
          <button onClick={() => setSheet(true)} style={{ background: biz.accentColor }} className="flex w-full items-center justify-between rounded-2xl px-5 py-4 text-white shadow-2xl active:scale-[0.99]">
            <span className="flex items-center gap-3 font-bold"><span className="flex size-7 items-center justify-center rounded-full bg-white/25 text-sm">{toFa(count)}</span>{t("cart")}</span>
            <span className="font-extrabold">{formatPrice(subtotal)}</span>
          </button>
        </div>
      )}

      <Modal open={sheet} onClose={() => setSheet(false)} title="🛒" footer={<Button size="lg" className="w-full !bg-[var(--accent)]" loading={busy} onClick={submit} disabled={!lines.length}>{t("submit")} · {formatPrice(total)}</Button>}>
        <div className="space-y-4" dir={dir}>
          <ul className="space-y-3">
            {lines.map(({ p, qty }) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="text-2xl">{p.emoji}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{nameOf("product", p.id, p.name)}</p><p className="text-xs text-stone-500">{formatPrice(p.price * qty)}</p></div>
                <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-0.5">
                  <button className="flex size-8 items-center justify-center rounded-md hover:bg-white" onClick={() => add(p.id, -1)} aria-label="-"><Icon name={qty === 1 ? "trash" : "minus"} className="size-4" /></button>
                  <span className="w-6 text-center text-sm font-bold">{toFa(qty)}</span>
                  <button className="flex size-8 items-center justify-center rounded-md hover:bg-white" onClick={() => add(p.id)} aria-label="+"><Icon name="plus" className="size-4" /></button>
                </div>
              </li>
            ))}
          </ul>

          {recs.length > 0 && (
            <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <p className="mb-2 text-xs font-bold text-amber-800">✨ {t("suggest")}</p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">{recs.map((r) => (
                <button key={r.id} onClick={() => add(r.id)} className="flex shrink-0 items-center gap-2 rounded-xl bg-white px-3 py-2 text-start text-xs shadow-sm ring-1 ring-amber-100 active:scale-95"><span className="text-xl">{r.emoji}</span><span><b className="block max-w-28 truncate">{nameOf("product", r.id, r.name)}</b><span className="text-stone-500">{formatPrice(r.price)}</span></span><span className="flex size-6 items-center justify-center rounded-full bg-[var(--accent)] text-white">+</span></button>
              ))}</div>
            </div>
          )}

          {types.length > 1 && <div className="grid gap-1.5 rounded-xl bg-stone-100 p-1" style={{ gridTemplateColumns: `repeat(${types.length}, 1fr)` }}>{types.map((x) => <button key={x.k} onClick={() => setType(x.k)} className={cn("rounded-lg py-2 text-sm font-semibold transition", type === x.k ? "bg-white shadow" : "text-stone-500")}>{x.l}</button>)}</div>}
          {type === "dine_in" && tables.length > 0 && (
            <Select value={tableId} onChange={(e) => setTableId(e.target.value)} aria-label="table"><option value="">🪑 میز…</option>{tables.map((x) => <option key={x.id} value={x.id}>🪑 {x.name} — {x.zone}</option>)}</Select>
          )}
          {type === "delivery" && (
            <div className="space-y-2">
              <MapPicker value={pin} height={230} onChange={(lat, lng) => setPin({ lat, lng })} onAddress={(a) => setAddress((cur) => cur.trim() ? cur : a)} origin={biz.lat != null && biz.lng != null ? { lat: biz.lat, lng: biz.lng } : null} radii={zones.map((z) => z.radiusKm).filter((r) => r > 0)} />
              <Textarea rows={2} placeholder="آدرس کامل تحویل (پلاک، واحد، …) *" value={address} onChange={(e) => setAddress(e.target.value)} />
              {radiusMode ? (
                dist !== null && <p className={cn("rounded-xl px-3 py-2 text-xs font-semibold", autoZone ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>{autoZone ? `📏 ${toFa(dist.toFixed(1))} کیلومتر تا ما · ${autoZone.name} · هزینه ارسال ${autoZone.fee ? formatPrice(autoZone.fee) : "رایگان"} · حدود ${toFa(autoZone.etaMinutes)} دقیقه` : "⛔ این نقطه خارج از محدوده ارسال است"}</p>
              ) : zones.length > 0 ? <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}><option value="">محدوده ارسال…</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {z.fee ? formatPrice(z.fee) : "رایگان"} · {toFa(z.etaMinutes)} دقیقه</option>)}</Select> : null}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="نام (اختیاری)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input inputMode="tel" dir="ltr" className="text-left" placeholder={type === "delivery" ? "موبایل *" : "موبایل (باشگاه مشتریان)"} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {caps.preorder && (
            <div className="rounded-xl bg-stone-50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="accent-[var(--accent)]" checked={pre} onChange={(e) => setPre(e.target.checked)} /> ⏰ پیش‌سفارش (تحویل در زمان مشخص)</label>
              {pre && <Input type="datetime-local" className="mt-2" value={when} onChange={(e) => setWhen(e.target.value)} />}
            </div>
          )}
          {caps.discount && (
            <div className="flex gap-2"><Input dir="ltr" className="text-left uppercase" placeholder="کد تخفیف" value={code} onChange={(e) => { setCode(e.target.value); setApplied(null); }} /><Button variant="secondary" onClick={applyCode} disabled={!code.trim()}>اعمال</Button></div>
          )}
          {caps.cashback && phone.trim().length >= 10 && (
            member === null ? <p className="text-xs text-stone-400">در حال بررسی عضویت…</p>
            : member.exists && member.balance > 0 ? (
              <label className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"><input type="checkbox" className="accent-emerald-600" checked={useCashback} onChange={(e) => setUseCashback(e.target.checked)} /> 🪙 استفاده از اعتبار کش‌بک ({formatPrice(member.balance)} موجود است)</label>
            ) : (
              <p className="rounded-xl bg-stone-100 px-3 py-2.5 text-xs leading-6 text-stone-600">{member.exists ? "اعتبار کش‌بک شما صفر است؛ با خرید این سفارش اعتبار می‌گیرید." : "این شماره هنوز عضو باشگاه مشتریان نیست؛ با ثبت این سفارش عضو می‌شوید و از خرید بعدی می‌توانید از کش‌بک استفاده کنید."}</p>
            )
          )}
          <Textarea rows={2} placeholder="توضیحات سفارش…" value={note} onChange={(e) => setNote(e.target.value)} />
          {payOptions.length > 1 && (
            <div className="space-y-1.5">{payOptions.map((o) => <label key={o.k} className={cn("flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm ring-1 transition", payment === o.k ? "bg-[var(--accent)]/10 ring-[var(--accent)]" : "ring-stone-200")}><input type="radio" name="pay" className="accent-[var(--accent)]" checked={payment === o.k} onChange={() => setPayment(o.k)} />{o.l}</label>)}</div>
          )}
          <div className="space-y-1.5 rounded-xl bg-stone-50 p-3.5 text-sm text-stone-600">
            <div className="flex justify-between"><span>{t("sub")}</span><span>{formatPrice(subtotal)}</span></div>
            {disc > 0 && <div className="flex justify-between text-emerald-600"><span>تخفیف ({applied?.code})</span><span>-{formatPrice(disc)}</span></div>}
            {fee > 0 && <div className="flex justify-between"><span>هزینه ارسال</span><span>{formatPrice(fee)}</span></div>}
            {tax > 0 && <div className="flex justify-between"><span>مالیات ({toFa(biz.taxPercent)}٪)</span><span>{formatPrice(tax)}</span></div>}
            {svc > 0 && <div className="flex justify-between"><span>خدمات ({toFa(biz.servicePercent)}٪)</span><span>{formatPrice(svc)}</span></div>}
            <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-extrabold text-stone-900"><span>{t("total")}</span><span>{formatPrice(total)}</span></div>
            {useCashback && <p className="text-[11px] text-emerald-700">اعتبار کش‌بک هنگام ثبت از مبلغ نهایی کسر می‌شود.</p>}
          </div>
        </div>
      </Modal>

      <Modal open={!!done} onClose={() => setDone(null)} title="✅" size="sm" footer={<Button className="w-full" onClick={() => setDone(null)}>OK</Button>}>
        {done && (
          <div className="py-4 text-center">
            <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-50 text-4xl animate-pop">✅</div>
            <p className="mt-4 text-lg font-extrabold">سفارش شما دریافت شد</p>
            <p className="mt-2 text-sm text-stone-500">شماره سفارش</p>
            <p className="text-3xl font-extrabold" style={{ color: biz.accentColor }}>#{toFa(done.number)}</p>
            <p className="mt-3 text-sm text-stone-600">{formatPrice(done.total)}</p>
          </div>
        )}
      </Modal>

      <Modal open={!!ar} onClose={() => setAr(null)} title={ar ? nameOf("product", ar.id, ar.name) : ""}>{ar && <ModelViewer src={ar.arModelUrl} />}</Modal>
    </div>
  );
}
