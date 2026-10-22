"use client";

import Link from "next/link";
import { useState } from "react";
import { Anchor, ArrowUpLeft, Bell, CheckCircle2, ChevronLeft, Compass, MapPin, Search, ShoppingCart, Star } from "lucide-react";
import { formatPrice, toFa } from "@/lib/format";
import { useDemoMenuState } from "./demo-menu-state";
import { DemoBrandMark, DemoCart, DemoHoursAddress, DemoItemActions, DemoNotice, DemoPrice, DemoProductDialog, FoodArt } from "./demo-template-parts";

type CaptainView = "home" | "products";
type CaptainState = ReturnType<typeof useDemoMenuState>;

const ENGLISH_CATEGORIES: Record<string, string> = {
  "پیش غذا": "Appetizers", "برگر": "Burgers", "پیتزا": "Pizza", "برگر مرغ": "Chicken Burger",
  "پاستا": "Pasta", "بیبی برگر": "Baby Burger", "استیک": "Steak", "پنینی": "Panini",
  "پک اقتصادی": "Value Packs", "نوشیدنی های گرم": "Hot Drinks", "نوشیدنی های سرد": "Cold Drinks",
  "اسموتی": "Smoothies", "ماکتیل": "Mocktails", "چای و دمنوش": "Tea & Herbal Tea",
  "شیک": "Shakes", "کیک و دسر": "Desserts", "صبحانه": "Breakfast", "بیشتر": "More",
  "قلیان": "Hookah", "تاپینگ غذا": "Toppings", "سس": "Sauces",
};

export function CaptainMDemo({ view = "home", initialCategory }: { view?: CaptainView; initialCategory?: string }) {
  const state = useDemoMenuState("captainm", initialCategory);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(view === "products");
  const isHome = view === "home";
  const filteredProducts = state.visible.filter((product) => !search || `${product.name} ${product.description} ${product.category}`.includes(search));

  return <div dir="rtl" className="min-h-screen bg-[#edf5f6] text-slate-900">
    <header className="relative overflow-hidden bg-[#062234] text-white" style={{ backgroundImage: "linear-gradient(180deg,rgba(4,25,39,.65),rgba(4,25,39,.96)),url('/images/cashier/meal.webp')", backgroundPosition: "center", backgroundSize: "cover" }}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,.22),transparent_55%)]" aria-hidden="true"/>
      <div className="relative mx-auto max-w-7xl px-3 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-3">
          <button type="button" className="btn btn-ghost btn-sm gap-2 text-white hover:bg-white/10" onClick={() => state.setNotice("درخواست گارسون در این پیش‌نمایش به سامانه ارسال نمی‌شود.")}><Bell size={15}/> <span className="hidden sm:inline">صدا کردن گارسون</span></button>
          <Link href="/preview" className="flex min-w-0 items-center gap-2 text-white"><DemoBrandMark style="sea"/><span className="truncate text-xs font-bold">منوی آنلاین کاپیتان ام</span></Link>
          <button type="button" aria-label="اطلاعات مجموعه" className="btn btn-ghost btn-sm btn-square text-white hover:bg-white/10" onClick={() => state.setNotice("اطلاعات ورود در نسخهٔ نمایشی فقط برای معرفی ساختار منو است.")}><Compass size={17}/></button>
        </div>
        <div className="mx-auto max-w-3xl py-8 text-center sm:py-12">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-cyan-200/30 bg-cyan-100/10 shadow-lg shadow-cyan-950/30"><Anchor size={30} className="text-cyan-200"/></div>
          <p className="mt-4 text-xs font-bold tracking-wide text-cyan-100/75">CAPTAIN M · CAFE & RESTAURANT</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">کافه رستوران کاپیتان ام</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/70">طعم ماجراجویی، به سبک کاپیتان. دستهٔ دلخواهتان را انتخاب کنید یا همهٔ محصولات را ببینید.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2"><Link href="/preview/captainm/products" className="btn min-h-11 border-0 bg-cyan-400 px-5 font-bold text-slate-950 hover:bg-cyan-300">مشاهدهٔ منو <ArrowUpLeft size={16}/></Link><button type="button" className="btn min-h-11 border-white/20 bg-white/10 text-white hover:bg-white/15" onClick={() => state.setNotice("این صفحهٔ اطلاعاتی در دموی محلی مقصد بیرونی باز نمی‌کند.")}><MapPin size={15}/>مسیریابی</button></div>
          <div className="mt-6 inline-flex rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-2 text-xs text-white/75"><DemoHoursAddress address={state.menu.address} hours={state.menu.hours} light/></div>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-3 pb-12 sm:px-6">
      <DemoNotice state={state}/>
      {isHome ? <CaptainLanding state={state}/> : <CaptainMenu state={state} search={search} searchOpen={searchOpen} onSearchChange={setSearch} onToggleSearch={() => setSearchOpen((open) => !open)} products={filteredProducts}/>}
      <CaptainInformation state={state}/>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-cyan-100 py-5 text-[10px] text-slate-500"><span>پیش‌نمایش محلی کاپیتان ام · قیمت‌ها و اطلاعات نمایشی هستند</span><Link href="/preview" className="inline-flex items-center gap-1 font-bold text-cyan-800">دموهای دیگر <ArrowUpLeft size={14}/></Link></footer>
    </main>
    {!isHome && state.count > 0 && <button type="button" className="btn btn-primary fixed bottom-4 end-4 z-40 bg-cyan-700 text-white shadow-xl hover:bg-cyan-800 sm:hidden" onClick={() => document.getElementById("captain-cart")?.scrollIntoView({ behavior: "smooth" })}><ShoppingCart size={17}/>{toFa(state.count)} قلم · {formatPrice(state.total)}</button>}
    <DemoProductDialog state={state} variant="sea"/>
  </div>;
}

function CaptainLanding({ state }: { state: CaptainState }) {
  const categories = state.menu.categories.slice(1);
  return <>
    <section className="-mt-5 rounded-3xl border border-white/50 bg-white p-3 shadow-xl shadow-slate-900/10 sm:-mt-7 sm:p-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {categories.map((category, index) => <Link key={category} href={`/preview/captainm/category/${index}`} className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-cyan-950/5 bg-gradient-to-br from-[#effbfc] to-[#f7fafb] px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:shadow-md">
          <span className="grid size-9 place-items-center rounded-full bg-[#092d42] text-cyan-200 shadow-sm">{index % 4 === 0 ? <Anchor size={16}/> : index % 4 === 1 ? <Compass size={16}/> : index % 4 === 2 ? <Star size={16}/> : <ShoppingCart size={16}/>}</span>
          <span className="text-xs font-black text-slate-800">{category}</span><span dir="ltr" className="text-[9px] font-semibold tracking-wide text-slate-500">{ENGLISH_CATEGORIES[category] ?? "Captain M Menu"}</span>
        </Link>)}
      </div>
      <Link href="/preview/captainm/products" className="btn mt-3 min-h-11 w-full border-0 bg-[#092d42] text-white hover:bg-[#0d4561]">مشاهدهٔ منو <ArrowUpLeft size={15}/></Link>
    </section>
    <section className="mt-6 grid gap-3 md:grid-cols-[1fr_auto] md:items-center"><div className="rounded-2xl border border-cyan-100 bg-white p-4"><h2 className="font-black text-[#092d42]">یک میز برای هر سلیقه</h2><p className="mt-1 text-xs leading-6 text-slate-500">از پیش‌غذا و برگر تا استیک، قهوه و دسر؛ دسته‌ها را باز کنید تا محصولات و جزئیات هر انتخاب را ببینید.</p></div><button type="button" className="btn min-h-11 border-cyan-200 bg-cyan-50 text-cyan-950" onClick={() => state.setNotice("درخواست میز در دمو فقط برای نمایش چیدمان است.")}><Compass size={15}/>درخواست میز</button></section>
  </>;
}

function CaptainMenu({ state, search, searchOpen, onSearchChange, onToggleSearch, products }: { state: CaptainState; search: string; searchOpen: boolean; onSearchChange: (value: string) => void; onToggleSearch: () => void; products: CaptainState["visible"] }) {
  const categories = state.menu.categories;
  return <section className="pt-6" aria-label="محصولات کاپیتان ام">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><span className="text-xs font-bold text-cyan-800">منوی کاپیتان</span><h2 className="mt-1 text-2xl font-black sm:text-3xl">{state.category === "همه" ? "همهٔ انتخاب‌ها" : state.category}</h2><p className="mt-1 text-xs text-slate-500">{toFa(products.length)} محصول · برای دیدن ترکیبات روی محصول بزنید</p></div><div className="flex gap-2"><button type="button" className="btn btn-outline btn-sm border-cyan-300 text-cyan-900" aria-expanded={searchOpen} onClick={onToggleSearch}><Search size={15}/>جست‌وجو</button><Link href="/preview/captainm" className="btn btn-ghost btn-sm">خانهٔ منو <ChevronLeft size={15}/></Link></div></div>
    {searchOpen && <label className="input input-bordered mb-4 flex h-11 items-center gap-2 border-cyan-200 bg-white"><Search size={16} className="text-cyan-700"/><input autoFocus value={search} onChange={(event) => onSearchChange(event.target.value)} className="grow text-sm" placeholder="جست‌وجو در غذاها و نوشیدنی‌ها"/><button type="button" className="btn btn-ghost btn-xs" onClick={() => onSearchChange("")}>پاک‌کردن</button></label>}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_230px]">
      <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">{products.map((product) => <article key={product.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan-300 hover:shadow-md"><button type="button" className="block w-full text-start" onClick={() => state.openProduct(product)} aria-label={`جزئیات ${product.name}`}><FoodArt product={product} variant="sea" className="h-36"/></button><div className="p-3.5"><div className="flex items-start justify-between gap-2"><h3 className="font-black leading-6">{product.name}</h3><span className="badge badge-outline badge-xs border-cyan-200 text-cyan-900">{product.category}</span></div><p className="mt-1 line-clamp-2 min-h-10 text-[11px] leading-5 text-slate-500">{product.description}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><DemoPrice product={product}/><DemoItemActions state={state} product={product}/></div></div></article>)}{products.length === 0 && <p className="col-span-full rounded-xl bg-white p-6 text-center text-sm">چیزی پیدا نشد.</p>}</div>
      <aside className="order-first rounded-2xl border border-cyan-100 bg-white p-3 shadow-sm lg:sticky lg:top-4 lg:order-last"><h3 className="mb-2 px-2 text-xs font-black text-slate-500">دسته‌های منو</h3><nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">{categories.map((category, index) => <Link key={category} href={index === 0 ? "/preview/captainm/products" : `/preview/captainm/category/${index - 1}`} aria-current={state.category === category ? "page" : undefined} className={`btn btn-sm h-9 shrink-0 justify-start rounded-lg lg:w-full ${state.category === category ? "border-cyan-700 bg-cyan-700 text-white" : "border-transparent bg-slate-50 text-slate-700 hover:bg-cyan-50"}`}>{category}</Link>)}</nav><div id="captain-cart" className="mt-3 scroll-mt-4"><DemoCart state={state} title="سبد سفارش"/></div><div className="mt-3 rounded-xl bg-[#092438] p-3 text-white"><h3 className="flex items-center gap-2 text-sm font-black"><Bell size={15} className="text-cyan-300"/>کمک می‌خواهید؟</h3><p className="mt-1 text-[10px] leading-5 text-white/65">درخواست گارسون در پیش‌نمایش ارسال نمی‌شود.</p><button type="button" className="btn btn-sm mt-2 w-full border-white/15 bg-white/10 text-white" onClick={() => state.setNotice("درخواست گارسون در منوی نمونه ارسال نمی‌شود.")}><Bell size={14}/>صدا کردن گارسون</button></div></aside>
    </div>
  </section>;
}

function CaptainInformation({ state }: { state: CaptainState }) {
  return <section className="mt-7 grid gap-4 border-t border-cyan-100 py-7 md:grid-cols-2">
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 font-black"><MapPin size={17} className="text-cyan-800"/>مسیریابی و راه‌های ارتباطی</h2><p className="mt-2 text-xs leading-6 text-slate-500">نشانی و ساعت کاری برای نمونه‌سازی منوی کاپیتان ام نمایش داده شده است. دکمه‌های تماس و مسیر در محیط دمو مقصد بیرونی باز نمی‌کنند.</p><div className="mt-3"><DemoHoursAddress address={state.menu.address} hours={state.menu.hours}/></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{["نشان", "بلد", "ویز", "گوگل‌مپ"].map((label) => <button key={label} type="button" className="btn btn-outline btn-xs min-h-9 border-slate-200" onClick={() => state.setNotice(`مسیریابی ${label} در دموی محلی باز نمی‌شود.`)}><MapPin size={13}/>{label}</button>)}</div><div className="mt-2 flex flex-wrap gap-2">{["تماس یک", "تماس دو", "تماس سه", "تماس چهار"].map((label) => <button key={label} type="button" className="btn btn-ghost btn-xs" onClick={() => state.setNotice("تماس تلفنی از دمو برقرار نمی‌شود.")}>{label}</button>)}</div><div className="mt-3 flex flex-wrap gap-2">{["Instagram", "Telegram", "WhatsApp", "Bale"].map((label) => <button key={label} type="button" className="btn btn-ghost btn-xs" onClick={() => state.setNotice(`پیوند ${label} در دموی محلی غیرفعال است.`)}>{label}</button>)}</div></div>
    <div className="rounded-2xl bg-[#092438] p-5 text-white"><span className="badge border-cyan-200/15 bg-white/10 text-cyan-100">نظرسنجی</span><h3 className="mt-3 text-xl font-black">به بهتر شدن تجربه کمک کنید</h3><p className="mt-2 text-xs leading-6 text-white/65">در این نمونه، فرم نظرسنجی فقط برای نمایش جایگاه این امکان است و پاسخی ارسال نمی‌شود.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn btn-sm bg-cyan-400 text-slate-950" onClick={() => state.setNotice("نظرسنجی در نسخهٔ نمایشی ارسال نمی‌شود.")}>شروع نظرسنجی <CheckCircle2 size={14}/></button><Link href="/preview/captainm" className="btn btn-sm border-white/15 bg-white/10 text-white">بازگشت به منو</Link></div></div>
  </section>;
}
