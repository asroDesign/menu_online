"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft, ArrowUpLeft, Bell, CheckCircle2, ChevronLeft, Clock3, Coffee,
  Compass, Flame, MapPin, Orbit, Pizza, Salad, Sandwich, Search,
  ShoppingCart, Sparkles, Star, UtensilsCrossed, Wine,
} from "lucide-react";
import { formatPrice, toFa } from "@/lib/format";
import { useDemoMenuState } from "./demo-menu-state";
import {
  DemoBrandMark, DemoCart, DemoHoursAddress, DemoItemActions, DemoNotice,
  DemoPrice, DemoProductDialog, FoodArt,
} from "./demo-template-parts";
import styles from "@/components/captainm-theme.module.css";

type CaptainView = "home" | "products";
type CaptainState = ReturnType<typeof useDemoMenuState>;

const CATEGORY_ICONS = [Salad, Sandwich, Pizza, Sandwich, UtensilsCrossed, Flame, Sandwich, Sandwich, Star, Coffee, Wine, Wine, Wine, Coffee, Coffee, Sparkles, Sparkles, Coffee, Compass, Flame, Sparkles];
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

  return <div dir="rtl" className={styles.demoRoot}>
    <header className={styles.demoHeader}>
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className={`${styles.demoTopbar} flex items-center justify-between gap-3 py-3`}>
          <Link href="/preview" className="flex min-w-0 items-center gap-2 text-white" aria-label="بازگشت به دموهای منو">
            <DemoBrandMark style="space"/><span className="truncate text-xs font-bold sm:text-sm">منوی کاپیتان ام</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/75 sm:inline-flex"><span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.8)]"/>منوی نمایشی</span>
            <button type="button" className="btn btn-ghost btn-sm gap-2 text-white hover:bg-white/10" onClick={() => state.setNotice("درخواست گارسون در این پیش‌نمایش به سامانه ارسال نمی‌شود.")}><Bell size={15}/><span className="hidden sm:inline">صدا کردن گارسون</span></button>
          </div>
        </div>
        <div className={styles.demoHero}>
          <div className={styles.heroContent}>
            <span className={styles.demoKicker}><Orbit size={14}/> CAPTAIN M <span className="opacity-40">/</span> GALACTIC DINING</span>
            <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-5xl sm:leading-[1.2]">کافه‌رستوران<br className="hidden sm:block"/> کاپیتان ام</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-200/75 sm:text-base">یک سفر خوش‌طعم میان ستاره‌ها؛ منو را بگردید، انتخابتان را بسازید و ترکیبات هر غذا را ببینید.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/preview/captainm/products" className="btn min-h-12 border-0 bg-cyan-300 px-5 font-extrabold text-slate-950 shadow-[0_8px_28px_rgba(34,211,238,.16)] hover:bg-cyan-200">شروع گشت در منو <ArrowLeft size={16}/></Link>
              <button type="button" className="btn min-h-12 border border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => state.setNotice("مسیریابی در پیش‌نمایش محلی مقصد بیرونی باز نمی‌کند.")}><MapPin size={15}/>مسیریابی</button>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/35 px-3 py-2 text-slate-200/80"><Clock3 size={14} className="text-cyan-200"/>{state.menu.hours}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/35 px-3 py-2 text-slate-200/80"><MapPin size={14} className="text-cyan-200"/>{state.menu.address}</span>
            </div>
          </div>
          <div className={styles.planetStage} aria-hidden="true"><span className={styles.planet}/><span className="absolute end-[17%] top-[17%] size-2 rounded-full bg-cyan-100 shadow-[0_0_16px_5px_rgba(124,236,255,.35)]"/><span className="absolute bottom-[17%] start-[18%] size-1.5 rounded-full bg-violet-200 shadow-[0_0_12px_4px_rgba(167,139,250,.35)]"/></div>
        </div>
      </div>
    </header>

    <main className="relative mx-auto max-w-6xl space-y-6 px-4 pb-12 pt-6 sm:space-y-8 sm:px-6 sm:pt-8">
      <DemoNotice state={state} dark/>
      {isHome ? <CaptainLanding state={state}/> : <CaptainMenu state={state} search={search} searchOpen={searchOpen} onSearchChange={setSearch} onToggleSearch={() => setSearchOpen((open) => !open)} products={filteredProducts}/>}
      <CaptainInformation state={state}/>
      <footer className={`${styles.demoFooter} flex flex-wrap items-center justify-between gap-3 border-t py-5 text-[10px]`}><span>پیش‌نمایش محلی کاپیتان ام · قیمت‌ها و اطلاعات نمایشی هستند</span><Link href="/preview" className="inline-flex items-center gap-1 font-bold text-cyan-200">دموهای دیگر <ArrowUpLeft size={14}/></Link></footer>
    </main>
    {!isHome && state.count > 0 && <button type="button" className="btn btn-primary fixed bottom-4 end-4 z-40 border-0 bg-cyan-700 text-white shadow-xl hover:bg-cyan-800 sm:hidden" onClick={() => document.getElementById("captain-cart")?.scrollIntoView({ behavior: "smooth" })}><ShoppingCart size={17}/>{toFa(state.count)} قلم · {formatPrice(state.total)}</button>}
    <DemoProductDialog state={state} variant="space"/>
  </div>;
}

function CaptainLanding({ state }: { state: CaptainState }) {
  const categories = state.menu.categories.slice(1);
  const featured = state.menu.products.slice(0, 4);
  return <>
    <section className={`${styles.demoSection} p-4 sm:p-6`} aria-labelledby="captain-categories-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-wide text-cyan-200"><Compass size={13}/> مقصد بعدی را انتخاب کنید</span><h2 id="captain-categories-title" className={`${styles.demoSectionTitle} mt-1 text-xl font-black sm:text-2xl`}>از کدام منظومه شروع کنیم؟</h2></div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] text-slate-300">{toFa(categories.length)} دستهٔ منو</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {categories.slice(0, 8).map((category, index) => {
          const CategoryIcon = CATEGORY_ICONS[index % CATEGORY_ICONS.length];
          const itemCount = state.menu.products.filter((product) => product.category === category).length;
          return <Link key={category} href={`/preview/captainm/category/${index}`} className={`${styles.demoCategory} flex min-h-[5.25rem] min-w-0 items-center gap-3 rounded-xl px-3 py-3 sm:min-h-20 sm:px-4`}>
            <span className={`${styles.demoCategoryIcon} grid size-10 shrink-0 place-items-center rounded-xl`}><CategoryIcon size={18}/></span>
            <span className="min-w-0"><span className="block truncate text-xs font-extrabold sm:text-sm">{category}</span><span className="mt-1 block truncate text-[9px] font-medium text-slate-400 sm:text-[10px]">{toFa(itemCount)} انتخاب · {ENGLISH_CATEGORIES[category] ?? "Captain M"}</span></span>
          </Link>;
        })}
      </div>
      <Link href="/preview/captainm/products" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-200/20 bg-cyan-300/10 px-4 text-xs font-extrabold text-cyan-100 transition hover:bg-cyan-300/15">دیدن همهٔ دسته‌ها و محصولات <ArrowUpLeft size={15}/></Link>
    </section>

    <section aria-labelledby="captain-featured-title">
      <div className="mb-3 flex items-end justify-between gap-3"><div><span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-cyan-200"><Flame size={13}/> انتخاب‌های کاپیتان</span><h2 id="captain-featured-title" className={`${styles.demoSectionTitle} mt-1 text-lg font-black sm:text-xl`}>پیشنهاد برای شروع</h2></div><Link href="/preview/captainm/products" className="text-xs font-bold text-cyan-200">کل منو <ChevronLeft size={14} className="inline"/></Link></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {featured.map((product) => <article key={product.id} className={`${styles.demoProductCard} overflow-hidden rounded-2xl`}>
          <button type="button" className="block w-full text-start" onClick={() => state.openProduct(product)} aria-label={`جزئیات ${product.name}`}><FoodArt product={product} variant="space" className="h-32 sm:h-36"/></button>
          <div className="p-3"><span className="text-[10px] font-bold text-cyan-200/80">{product.category}</span><h3 className="mt-1 truncate text-sm font-black">{product.name}</h3><p className="mt-1 line-clamp-2 min-h-9 text-[10px] leading-5 text-slate-300/65">{product.description}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><DemoPrice product={product}/><DemoItemActions state={state} product={product}/></div></div>
        </article>)}
      </div>
    </section>
  </>;
}

function CaptainMenu({ state, search, searchOpen, onSearchChange, onToggleSearch, products }: { state: CaptainState; search: string; searchOpen: boolean; onSearchChange: (value: string) => void; onToggleSearch: () => void; products: CaptainState["visible"] }) {
  const categories = state.menu.categories;
  return <section className="pt-1" aria-label="محصولات کاپیتان ام">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-cyan-200"><Orbit size={13}/> منوی کاپیتان</span><h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">{state.category === "همه" ? "همهٔ انتخاب‌ها" : state.category}</h2><p className="mt-1 text-xs text-slate-400">{toFa(products.length)} محصول · برای دیدن ترکیبات، محصول را انتخاب کنید</p></div>
      <div className="flex gap-2"><button type="button" className="btn btn-outline btn-sm border-cyan-200/30 bg-white/5 text-cyan-100 hover:bg-white/10" aria-expanded={searchOpen} onClick={onToggleSearch}><Search size={15}/>جست‌وجو</button><Link href="/preview/captainm" className="btn btn-ghost btn-sm text-slate-200">خانهٔ منو <ChevronLeft size={15}/></Link></div>
    </div>
    {searchOpen && <label className={`${styles.demoToolbar} input input-bordered mb-4 flex h-11 items-center gap-2 rounded-xl`}><Search size={16} className="text-cyan-200"/><input autoFocus value={search} onChange={(event) => onSearchChange(event.target.value)} className="grow bg-transparent text-sm outline-none" placeholder="جست‌وجو در غذاها و نوشیدنی‌ها"/><button type="button" className="btn btn-ghost btn-xs text-slate-300" onClick={() => onSearchChange("")}>پاک‌کردن</button></label>}
    {!search && <nav aria-label="دسته‌بندی منو" className={`${styles.demoSection} mb-4 flex gap-2 overflow-x-auto p-2.5`}>
      {categories.map((category, index) => <Link key={category} href={index === 0 ? "/preview/captainm/products" : `/preview/captainm/category/${index - 1}`} aria-current={state.category === category ? "page" : undefined} className={`flex min-h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-[11px] font-bold transition ${state.category === category ? "border-cyan-200/40 bg-cyan-300 text-slate-950" : "border-white/5 bg-white/[.035] text-slate-200 hover:border-cyan-100/20 hover:bg-white/[.08]"}`}>{category}<span className="text-[9px] opacity-65">{toFa(state.menu.products.filter((product) => product.category === category).length)}</span></Link>)}
    </nav>}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
      <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => <article key={product.id} className={`${styles.demoProductCard} overflow-hidden rounded-2xl transition hover:border-cyan-100/30`}>
          <button type="button" className="block w-full text-start" onClick={() => state.openProduct(product)} aria-label={`جزئیات ${product.name}`}><FoodArt product={product} variant="space" className="h-36"/></button>
          <div className="p-3.5"><div className="flex items-start justify-between gap-2"><h3 className="font-black leading-6 text-slate-50">{product.name}</h3><span className="shrink-0 rounded-full border border-cyan-100/15 bg-cyan-100/5 px-2 py-1 text-[9px] font-bold text-cyan-100">{product.category}</span></div><p className="mt-1 line-clamp-2 min-h-10 text-[11px] leading-5 text-slate-300/70">{product.description}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><DemoPrice product={product}/><DemoItemActions state={state} product={product}/></div></div>
        </article>)}
        {products.length === 0 && <p className={`${styles.demoSection} col-span-full p-6 text-center text-sm text-slate-200`}>چیزی پیدا نشد.</p>}
      </div>
      <aside className={`order-last rounded-2xl p-3.5 lg:sticky lg:top-4 ${styles.demoSection}`}>
        <h3 className="mb-3 flex items-center gap-2 px-1 text-xs font-black text-cyan-100"><ShoppingCart size={15}/>سفارش شما</h3>
        <div id="captain-cart" className="scroll-mt-4"><DemoCart state={state} title="سبد نمایشی" className="!border-white/10 !bg-[#0b1228] !text-slate-100"/></div>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/8 bg-white/[.035] p-3 text-white"><Bell size={15} className="mt-0.5 shrink-0 text-cyan-300"/><p className="text-[10px] leading-5 text-slate-300/70">این پیش‌نمایش سفارشی به کارکنان ارسال نمی‌کند.</p></div>
      </aside>
    </div>
  </section>;
}

function CaptainInformation({ state }: { state: CaptainState }) {
  return <section className={`${styles.demoSection} grid gap-4 p-4 sm:grid-cols-2 sm:p-5`} aria-label="اطلاعات مجموعه">
    <div><span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-cyan-200"><MapPin size={13}/> اطلاعات مجموعه</span><h2 className="mt-1 text-sm font-black text-white">پیدا کردن ایستگاه کاپیتان ام</h2><div className="mt-3"><DemoHoursAddress address={state.menu.address} hours={state.menu.hours} light/></div></div>
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[.035] p-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-100/15 bg-cyan-200/10 text-cyan-200"><CheckCircle2 size={18}/></span><p className="text-[11px] leading-6 text-slate-300/70">این پیش‌نمایش برای نمایش قالب و گردش منو است؛ اطلاعات و قیمت‌ها نمونه هستند.</p></div>
  </section>;
}
