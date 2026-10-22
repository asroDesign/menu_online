"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, BookOpenText, CakeSlice, Check, Clock3, Coffee, CupSoda, EggFried, Fish, Globe2,
  MapPin, Minus, Pizza, Plus, Salad, Sandwich, ShoppingBag, Snowflake,
  Star, UtensilsCrossed, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatPrice, toFa } from "@/lib/format";
import { DEMO_MENUS, type DemoMenu, type DemoMenuProduct, type DemoMenuTheme } from "@/lib/demo-menus";

const productIcons: Record<DemoMenuProduct["mark"], LucideIcon> = {
  coffee: Coffee, food: UtensilsCrossed, dessert: CakeSlice, cold: Snowflake, pizza: Pizza,
  fish: Fish, salad: Salad, breakfast: EggFried, burger: Sandwich, drink: CupSoda,
};

const visual: Record<DemoMenuTheme, { cover: string; tile: string; accent: string; frame: string; active: string; card: string; categories: string }> = {
  narvan: { cover: "bg-gradient-to-br from-emerald-950 via-teal-900 to-stone-800", tile: "bg-gradient-to-br from-amber-300 via-orange-400 to-rose-400", accent: "text-emerald-800", frame: "border-emerald-900/10", active: "bg-emerald-800 text-white", card: "bg-emerald-50/20 ring-emerald-900/10", categories: "bg-emerald-50/70" },
  softmenu: { cover: "bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-800", tile: "bg-gradient-to-br from-violet-300 via-fuchsia-300 to-orange-200", accent: "text-violet-800", frame: "border-violet-900/10", active: "bg-violet-700 text-white", card: "bg-violet-50/30 ring-violet-200", categories: "bg-violet-50/70" },
  softmenuPlus: { cover: "bg-gradient-to-br from-sky-950 via-cyan-900 to-teal-800", tile: "bg-gradient-to-br from-cyan-200 via-sky-300 to-blue-400", accent: "text-cyan-900", frame: "border-cyan-900/10", active: "bg-cyan-800 text-white", card: "bg-cyan-50/35 ring-cyan-200", categories: "bg-cyan-50/75" },
  captain: { cover: "bg-gradient-to-br from-slate-950 via-sky-950 to-cyan-900", tile: "bg-gradient-to-br from-sky-300 via-blue-400 to-indigo-500", accent: "text-sky-900", frame: "border-sky-900/10", active: "bg-sky-900 text-white", card: "bg-sky-50/45 ring-sky-200", categories: "bg-sky-50/75" },
  haftkhan: { cover: "bg-gradient-to-br from-stone-950 via-red-950 to-amber-950", tile: "bg-gradient-to-br from-amber-200 via-yellow-500 to-orange-500", accent: "text-amber-900", frame: "border-amber-900/15", active: "bg-amber-800 text-white", card: "bg-amber-50/55 ring-amber-200", categories: "bg-amber-50/80" },
};

/** Local-only menu samples. All category/cart/profile actions stay inside this preview. */
export function DemoPreview({ initialMenuId }: { initialMenuId?: string }) {
  const [menuId, setMenuId] = useState(() => DEMO_MENUS.find((item) => item.id === initialMenuId)?.id ?? DEMO_MENUS[0].id);
  const [category, setCategory] = useState("همه");
  const [cart, setCart] = useState<Record<string, { productId: number; quantity: number; unitPrice: number; optionLabel?: string }>>({});
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<DemoMenuProduct | null>(null);
  const [selectedOption, setSelectedOption] = useState<{ label: string; price: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const menu = DEMO_MENUS.find((item) => item.id === menuId) ?? DEMO_MENUS[0];
  const style = visual[menu.theme];
  const visible = useMemo(() => menu.products.filter((product) => (category === "همه" || product.category === category)
    && (!query.trim() || `${product.name} ${product.description} ${product.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [category, menu.products, query]);
  const cartLines = Object.values(cart).filter((line) => menu.products.some((product) => product.id === line.productId));
  const count = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const total = cartLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  const chooseMenu = (sample: DemoMenu) => {
    setMenuId(sample.id);
    setCategory("همه");
    setCart({});
    setNotice("");
    setQuery("");
    setSelectedProduct(null);
    setAboutOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("menu", sample.id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const change = (product: DemoMenuProduct, delta: number, option?: { label: string; price: number }) => setCart((current) => {
    const key = `${product.id}:${option?.label ?? "default"}`;
    const line = current[key];
    const quantity = Math.max(0, Math.min(20, (line?.quantity ?? 0) + delta));
    const next = { ...current };
    if (quantity === 0) delete next[key];
    else next[key] = { productId: product.id, quantity, unitPrice: option?.price ?? line?.unitPrice ?? product.price, optionLabel: option?.label ?? line?.optionLabel };
    return next;
  });
  const openProduct = (product: DemoMenuProduct) => {
    setSelectedProduct(product);
    setSelectedOption(product.options?.[0] ?? null);
  };
  useEffect(() => {
    if (!selectedProduct && !aboutOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelectedProduct(null); setAboutOpen(false); } };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [aboutOpen, selectedProduct]);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return <section aria-labelledby="sample-menu-title" className="space-y-4">
    <div className="rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="font-extrabold">فهرست دموهای منو</h2><p className="mt-1 text-xs leading-5 text-base-content/55">یکی از نمونه‌ها را انتخاب کنید؛ لینک همان دمو در نوار آدرس نگه داشته می‌شود.</p></div>
        <span className="badge badge-ghost">{toFa(DEMO_MENUS.length)} دمو · اطلاعات نمایشی</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" role="group" aria-label="انتخاب دموهای منو">
        {DEMO_MENUS.map((sample) => {
          const selected = sample.id === menu.id;
          const cardClass = `min-h-32 overflow-hidden rounded-xl border text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20" : "border-base-300 bg-base-100 hover:border-primary/35 hover:bg-base-200/60"}`;
          const card = <>
            <span className={`block h-2 ${visual[sample.theme].cover}`} />
            <span className="block p-2.5 sm:p-3">
              <span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-extrabold sm:text-sm">{sample.businessName}</span>{selected && <Check size={14} className="shrink-0 text-primary" aria-label="دموی انتخاب‌شده"/>}</span>
              <span className="mt-1 block text-[10px] font-bold text-base-content/55">{sample.label} · {sample.businessType}</span>
              <span className="mt-1.5 line-clamp-2 block min-h-9 text-[10px] leading-5 text-base-content/60">{sample.description}</span>
              <span className="mt-2 flex items-center justify-between border-t border-base-200 pt-2 text-[10px] font-bold text-primary"><span>{toFa(sample.categories.length - 1)} دسته · {toFa(sample.products.length)} قلم</span>{sample.id === "narvan" ? <span>انتخاب</span> : <span className="inline-flex items-center gap-1">دموی مستقل <ArrowUpRight size={12}/></span>}</span>
            </span>
          </>;
          return sample.id === "narvan"
            ? <button key={sample.id} type="button" aria-pressed={selected} onClick={() => chooseMenu(sample)} className={cardClass}>{card}</button>
            : <Link key={sample.id} href={`/preview/${sample.id}`} className={cardClass}>{card}</Link>;
        })}
      </div>
    </div>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5">
      <div id="demo-menu" className={`min-w-0 overflow-hidden rounded-3xl border bg-base-100 shadow-xl ${style.frame}`}>
        <header className={`${style.cover} relative isolate overflow-hidden p-5 text-white sm:p-7`}>
          <div aria-hidden="true" className="absolute -end-12 -top-16 -z-10 size-56 rounded-full border border-white/10 bg-white/5" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur"><UtensilsCrossed size={23}/></span>
              <div className="min-w-0">
                <span className="badge border-white/20 bg-white/10 text-white">{menu.businessType}</span>
                <h2 id="sample-menu-title" className="mt-2 truncate text-2xl font-black sm:text-3xl">{menu.businessName}</h2>
                <p className="mt-2 max-w-2xl text-xs leading-6 text-white/75 sm:text-sm">{menu.description}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 text-[11px] text-white/80">
              <span className="inline-flex items-center gap-1.5"><Star size={13} className="fill-amber-300 text-amber-300"/> ۴٫۸ <span className="text-white/50">· نمونه</span></span>
              <span className="inline-flex items-center gap-1.5"><Clock3 size={13}/>{menu.hours}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin size={13}/>{menu.address}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/15 pt-3">
            <button type="button" onClick={() => setAboutOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold transition hover:bg-white/15"><MapPin size={14}/>دربارهٔ مجموعه</button>
            {menu.hasLoyalty && <button type="button" onClick={() => setNotice("در منوی واقعی می‌توان عضویت و امتیاز مشتریان را از باشگاه مشتریان مدیریت کرد. این پیش‌نمایش هیچ اطلاعاتی ثبت نمی‌کند.")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold transition hover:bg-white/15"><Check size={14}/>باشگاه مشتریان</button>}
            {menu.id === "captainm" && <button type="button" onClick={() => setNotice("درخواست گارسون در این نمونه فقط نمایشی است و برای میز یا نیروی واقعی درخواستی ارسال نمی‌کند.")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold transition hover:bg-white/15"><UtensilsCrossed size={14}/>درخواست گارسون</button>}
            <button type="button" onClick={() => setNotice("نصب منو روی صفحهٔ اصلی دستگاه در منوی واقعی انجام می‌شود؛ این پیش‌نمایش چیزی نصب نمی‌کند.")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold transition hover:bg-white/15"><ShoppingBag size={14}/>نصب منو</button>
            {menu.hasLanguages && <button type="button" onClick={() => setNotice("زبان‌های این نمونه برای نمایش چیدمان هستند؛ ترجمهٔ کامل و تغییر زبان در پیش‌نمایش فعال نیست.")} className="ms-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-black/10 px-2.5 py-2 text-[10px] text-white/80"><Globe2 size={13}/>فارسی <b>·</b> English <b>·</b> العربية</button>}
          </div>
        </header>

        <nav className="sticky top-0 z-10 border-b border-base-300 bg-base-100/95 p-2 backdrop-blur" aria-label="میانبرهای منوی نمونه">
          <div className="grid grid-cols-4 gap-1">
            <button type="button" onClick={() => scrollTo("demo-menu")} className={`btn btn-sm min-h-10 ${style.accent}`}><UtensilsCrossed size={15}/> منو</button>
            <button type="button" onClick={() => scrollTo("demo-cart")} className="btn btn-ghost btn-sm min-h-10"><ShoppingBag size={15}/>سبد <span className="badge badge-primary badge-xs">{toFa(count)}</span></button>
            <button type="button" onClick={() => setNotice("پیگیری سفارش در منوی واقعی با ورود امن مشتری یا پیوند پیگیری انجام می‌شود؛ در نمونه هیچ سفارشی ثبت نشده است.")} className="btn btn-ghost btn-sm min-h-10"><Check size={15}/>سفارش‌ها</button>
            <button type="button" onClick={() => setNotice("پروفایل مشتری در نسخهٔ واقعی با تأیید شمارهٔ موبایل باز می‌شود. این محیط آزمایشی ورود ندارد.")} className="btn btn-ghost btn-sm min-h-10"><Globe2 size={15}/>پروفایل</button>
          </div>
        </nav>

        {notice && <div role="status" className="mx-3 mt-3 flex items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-6 text-base-content sm:mx-4"><p>{notice}</p><button type="button" onClick={() => setNotice("")} className="flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-base-200" aria-label="بستن پیام"><X size={15}/></button></div>}

        {menu.hasSearch && <div className="border-b border-base-200 p-3 sm:px-4"><label className="input input-bordered flex h-10 items-center gap-2"><Globe2 size={15} className="opacity-50"/><span className="sr-only">جست‌وجو در منو</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجو در غذاها و نوشیدنی‌ها" className="grow text-sm"/><button type="button" onClick={() => setQuery("")} className="btn btn-ghost btn-xs" disabled={!query}>پاک‌کردن</button></label></div>}
        <div className={`sticky top-[50px] z-[9] flex gap-2 overflow-x-auto border-b border-base-200 px-3 py-3 backdrop-blur sm:px-4 ${style.categories}`} role="tablist" aria-label="دسته‌بندی منو">
          {menu.categories.map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} onClick={() => setCategory(item)} className={`btn btn-sm h-9 shrink-0 ${category === item ? style.active : "btn-ghost"}`}>{item}</button>)}
        </div>

        <div className={`grid gap-3 p-3 sm:p-4 ${menu.theme === "haftkhan" ? "sm:grid-cols-1" : "sm:grid-cols-2"}`} aria-live="polite">
          {visible.map((product) => {
            const Mark = productIcons[product.mark];
            const lines = cartLines.filter((line) => line.productId === product.id);
            const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
            return <article key={product.id} className={`card card-side min-h-[132px] min-w-0 overflow-hidden ring-1 transition hover:shadow-md ${style.card}`}>
              <button type="button" onClick={() => openProduct(product)} aria-label={`مشاهده جزئیات ${product.name}`} className={`grid w-[76px] shrink-0 place-items-center text-white sm:w-[92px] ${style.tile}`}><Mark size={30} strokeWidth={1.5}/></button>
              <div className="card-body min-w-0 gap-1 p-3 sm:p-3.5">
                <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 truncate text-sm font-extrabold"><button type="button" onClick={() => openProduct(product)} className="text-start hover:text-primary">{product.name}</button></h3><span className="badge badge-ghost badge-xs shrink-0">{product.category}</span></div>
                <p className="line-clamp-2 min-h-9 text-[11px] leading-5 text-base-content/60">{product.description}</p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1"><div><b className="text-xs sm:text-sm">{formatPrice(product.price)}</b>{product.originalPrice && <del className="ms-1 text-[10px] text-base-content/45">{formatPrice(product.originalPrice)}</del>}</div>
                  {product.options?.length ? <button type="button" className="btn btn-primary btn-xs min-h-8" aria-label={`انتخاب تنوع ${product.name}`} onClick={() => openProduct(product)}><Plus size={14}/>انتخاب {quantity > 0 && <span className="badge badge-xs">{toFa(quantity)}</span>}</button> : quantity === 0 ? <button type="button" className="btn btn-primary btn-xs min-h-8" aria-label={`افزودن ${product.name} به سبد نمایشی`} onClick={() => change(product, 1)}><Plus size={14}/>افزودن</button> : <div className="join" aria-label={`تعداد ${product.name}`}><button type="button" className="btn btn-xs join-item min-h-8" aria-label={`کم‌کردن ${product.name}`} onClick={() => change(product, -1)}><Minus size={14}/></button><span className="join-item grid min-w-8 place-items-center bg-base-200 text-xs font-bold">{toFa(quantity)}</span><button type="button" className="btn btn-xs join-item min-h-8" aria-label={`افزودن ${product.name}`} onClick={() => change(product, 1)}><Plus size={14}/></button></div>}
                </div>
              </div>
            </article>;
          })}
          {visible.length === 0 && <p className="col-span-full rounded-xl bg-base-200 p-5 text-center text-sm text-base-content/60">موردی با این جست‌وجو پیدا نشد.</p>}
        </div>

        {menu.hasArticles && <section className="border-t border-base-200 p-4" aria-labelledby="demo-articles-title">
          <div className="mb-3 flex items-center justify-between gap-3"><h3 id="demo-articles-title" className="font-extrabold">مطالب و پیشنهادها</h3><Link href="/blog" className="link link-primary inline-flex items-center gap-1 text-xs">همهٔ مطالب <BookOpenText size={14}/></Link></div>
          <div className="grid gap-2 sm:grid-cols-2"><article className="rounded-xl bg-base-200 p-3"><p className="text-xs font-bold">چطور منوی آنلاین به انتخاب بهتر کمک می‌کند؟</p><p className="mt-1 text-[11px] leading-5 text-base-content/60">تصویر و دسته‌بندی روشن، مرور منو را برای مهمان آسان‌تر می‌کند.</p></article><article className="rounded-xl bg-base-200 p-3"><p className="text-xs font-bold">منوی فصلی را به‌روز نگه دارید</p><p className="mt-1 text-[11px] leading-5 text-base-content/60">دسته‌های صبحانه، ناهار و شام را متناسب با ساعت کار نمایش دهید.</p></article></div>
        </section>}
      </div>

      <aside id="demo-cart" className="card h-fit scroll-mt-4 bg-base-100 p-4 shadow-lg ring-1 ring-base-300 lg:sticky lg:top-5" aria-live="polite">
        <h3 className="flex items-center gap-2 font-extrabold"><ShoppingBag size={18}/>سبد نمایشی <span className="badge badge-primary badge-sm">{toFa(count)}</span></h3>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {count === 0 ? <p className="rounded-xl bg-base-200 p-3 text-xs leading-6 text-base-content/60">برای دیدن جمع نمونه، یک محصول اضافه کنید.</p> : cartLines.map((line, index) => { const product = menu.products.find((item) => item.id === line.productId)!; return <div key={`${line.productId}-${line.optionLabel ?? "default"}-${index}`} className="flex items-start justify-between gap-3 text-xs"><span>{product.name}{line.optionLabel && <small className="ms-1 text-base-content/55">({line.optionLabel})</small>} × {toFa(line.quantity)}<span className="ms-2 inline-flex gap-1"><button type="button" className="btn btn-ghost btn-xs min-h-5 h-5 px-1" aria-label={`کم‌کردن ${product.name}`} onClick={() => change(product, -1, line.optionLabel ? { label: line.optionLabel, price: line.unitPrice } : undefined)}><Minus size={11}/></button><button type="button" className="btn btn-ghost btn-xs min-h-5 h-5 px-1" aria-label={`زیادکردن ${product.name}`} onClick={() => change(product, 1, line.optionLabel ? { label: line.optionLabel, price: line.unitPrice } : undefined)}><Plus size={11}/></button></span></span><b className="shrink-0">{formatPrice(line.unitPrice * line.quantity)}</b></div>; })}
        </div>
        <div className="mt-3 flex justify-between border-t border-base-300 pt-3 text-sm font-extrabold"><span>جمع نمونه</span><span>{formatPrice(total)}</span></div>
        <button type="button" disabled className="btn btn-disabled mt-3 min-h-10 w-full" aria-describedby="preview-readonly"><Check size={15}/>ثبت سفارش خاموش است</button>
        <p id="preview-readonly" className="mt-2 text-[11px] leading-5 text-base-content/55">سبد فقط در همین صفحه می‌ماند؛ هیچ سفارش، پرداخت، پیامک یا تغییری در داده‌ها انجام نمی‌شود.</p>
      </aside>
    </div>
    {(selectedProduct || aboutOpen) && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedProduct(null); setAboutOpen(false); } }}>
      <section role="dialog" aria-modal="true" aria-labelledby="demo-dialog-title" className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-base-100 p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-primary">{aboutOpen ? menu.businessType : selectedProduct?.category}</p><h3 id="demo-dialog-title" className="mt-1 text-lg font-black">{aboutOpen ? menu.businessName : selectedProduct?.name}</h3></div><button type="button" autoFocus onClick={() => { setSelectedProduct(null); setAboutOpen(false); }} className="btn btn-circle btn-ghost btn-sm" aria-label="بستن جزئیات"><X size={18}/></button></div>
        {aboutOpen ? <div className="mt-4 space-y-3 text-sm leading-7"><p>{menu.description}</p><p className="flex items-center gap-2 text-base-content/70"><MapPin size={15}/>{menu.address}</p><p className="flex items-center gap-2 text-base-content/70"><Clock3 size={15}/>{menu.hours}</p><p className="rounded-xl bg-base-200 p-3 text-xs text-base-content/60">نشانی، نقشه، تلفن و شبکه‌های اجتماعیِ صفحات مرجع در این پیش‌نمایش به لینک بیرونی تبدیل نشده‌اند.</p></div> : selectedProduct && <>
          <p className="mt-3 text-sm leading-7 text-base-content/70">{selectedProduct.description}</p>
          {selectedProduct.options?.length ? <fieldset className="mt-4"><legend className="mb-2 text-xs font-bold">انتخاب اندازه یا تنوع</legend><div className="grid gap-2 sm:grid-cols-2">{selectedProduct.options.map((option) => <label key={option.label} className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm ${selectedOption?.label === option.label ? "border-primary bg-primary/5" : "border-base-300"}`}><span className="flex items-center gap-2"><input type="radio" name="demo-product-option" className="radio radio-primary radio-sm" checked={selectedOption?.label === option.label} onChange={() => setSelectedOption(option)}/>{option.label}</span><b>{formatPrice(option.price)}</b></label>)}</div></fieldset> : null}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-base-200 pt-4"><b>{formatPrice(selectedOption?.price ?? selectedProduct.price)}</b><button type="button" className="btn btn-primary" onClick={() => { change(selectedProduct, 1, selectedOption ?? undefined); setSelectedProduct(null); }}><Plus size={16}/>افزودن به سبد نمایشی</button></div>
        </>}
      </section>
    </div>}
  </section>;
}
