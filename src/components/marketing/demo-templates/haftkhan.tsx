"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpLeft, BookOpen, ChefHat, Clock3, Coffee, Crown, Flame, MapPin, Search, ShoppingBag, Star, Utensils } from "lucide-react";
import { formatPrice, toFa } from "@/lib/format";
import { useDemoMenuState } from "./demo-menu-state";
import { DemoBrandMark, DemoCart, DemoHoursAddress, DemoItemActions, DemoNotice, DemoPrice, DemoProductDialog, FoodArt } from "./demo-template-parts";

const CATEGORY_ICONS = [ChefHat, Coffee, Utensils, Flame, Star, MapPin, BookOpen, ShoppingBag, Clock3];

export function HaftkhanDemo() {
  const state = useDemoMenuState("haftkhan");
  const [search, setSearch] = useState("");
  const visible = state.visible.filter((product) => !search || `${product.name} ${product.description} ${product.category}`.includes(search));

  return <div dir="rtl" className="min-h-screen bg-[#fcf5f5] text-[#392b2d]">
    <header className="border-b border-rose-950/10 bg-[#fffafa]">
      <div className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/preview" className="btn btn-ghost btn-sm text-[#641c27]"><ArrowUpLeft size={15}/>دموهای دیگر</Link>
          <button type="button" className="btn btn-outline btn-sm border-rose-950/20 text-[#641c27]" onClick={() => document.getElementById("haftkhan-cart")?.scrollIntoView({ behavior: "smooth" })}><ShoppingBag size={15}/>سبد <span className="badge badge-sm border-rose-950/10 bg-rose-50">{toFa(state.count)}</span></button>
        </div>
        <div className="mx-auto mt-3 flex max-w-2xl flex-col items-center text-center">
          <DemoBrandMark style="red"/>
          <p className="mt-3 text-[10px] font-bold tracking-[.25em] text-rose-900/55">RESTAURANT · SHIRAZ</p>
          <h1 className="mt-1 text-3xl font-black text-[#641c27] sm:text-4xl">هفت‌خوان</h1>
          <p className="mt-2 text-xs leading-6 text-rose-950/55">روایت سفرهٔ ایرانی · مهمان‌نوازی از دل شیراز</p>
          <div className="mt-4 w-full"><DemoHoursAddress address={state.menu.address} hours={state.menu.hours}/></div>
          <label className="input input-bordered mt-5 flex h-12 w-full items-center gap-3 rounded-2xl border-rose-950/15 bg-white shadow-sm"><Search size={18} className="text-rose-900/55"/><input value={search} onChange={(event) => setSearch(event.target.value)} className="grow text-sm" placeholder="نام غذا را جست‌وجو کنید"/><button type="button" className="btn btn-ghost btn-xs text-rose-900" onClick={() => setSearch("")}>پاک‌کردن</button></label>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-3 pb-14 sm:px-6">
      <DemoNotice state={state}/>
      <section className="py-6 sm:py-8" aria-label="دسته‌بندی‌های منو">
        <div className="mb-3 flex items-end justify-between gap-3"><div><span className="text-[10px] font-bold text-rose-900/55">انتخاب از سفره</span><h2 className="mt-1 text-lg font-black text-[#641c27]">دسته‌های هفت‌خوان</h2></div><span className="text-[10px] text-rose-950/45">{toFa(state.menu.categories.length - 1)} دسته</span></div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-10">
          {state.menu.categories.map((category, index) => { const Icon = index === 0 ? Crown : CATEGORY_ICONS[(index - 1) % CATEGORY_ICONS.length]; return <button key={category} type="button" aria-pressed={state.category === category} onClick={() => state.setCategory(category)} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center transition hover:-translate-y-0.5 hover:shadow-sm ${state.category === category ? "border-[#641c27] bg-[#641c27] text-white shadow-md" : "border-rose-950/10 bg-white text-[#641c27] hover:border-rose-300 hover:bg-rose-50"}`}><Icon size={20}/><span className="text-[10px] font-bold leading-4">{category}</span></button>; })}
        </div>
      </section>

      <section id="haftkhan-menu" className="scroll-mt-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><span className="text-[10px] font-bold text-rose-900/55">منوی امروز</span><h2 className="mt-1 text-2xl font-black text-[#641c27]">{state.category === "همه" ? "سفرهٔ هفت‌خوان" : state.category}</h2><p className="mt-1 text-[11px] text-rose-950/50">{toFa(visible.length)} انتخاب · قیمت‌ها در این نمونه نمایشی هستند</p></div><button type="button" className="btn btn-ghost btn-sm text-[#641c27]" onClick={() => state.setNotice("این منو پیش‌نمایش است و سفارش واقعی ثبت نمی‌کند.")}><BookOpen size={15}/>راهنمای منو</button></div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((product) => <article key={product.id} className="group min-w-0 overflow-hidden rounded-2xl border border-rose-950/10 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-lg">
            <button type="button" onClick={() => state.openProduct(product)} className="relative block w-full text-start" aria-label={`جزئیات ${product.name}`}><FoodArt product={product} variant="heritage" className="aspect-[1.2] w-full transition group-hover:scale-[1.02]"/><span className="absolute bottom-2 start-2 rounded-full bg-white/90 px-2 py-1 text-[9px] font-bold text-[#641c27] shadow-sm">{product.category}</span></button>
            <div className="p-2.5 sm:p-3"><h3 className="line-clamp-1 text-xs font-black text-[#641c27] sm:text-sm">{product.name}</h3><p className="mt-1 line-clamp-2 min-h-8 text-[9px] leading-4 text-rose-950/50 sm:text-[10px]">{product.description}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><DemoPrice product={product}/><DemoItemActions state={state} product={product}/></div></div>
          </article>)}
          {visible.length === 0 && <p className="col-span-full rounded-2xl bg-white p-8 text-center text-sm text-rose-950/55">غذایی با این عبارت پیدا نشد.</p>}
        </div>
      </section>

      <details id="haftkhan-cart" className="mt-6 rounded-2xl border border-rose-950/10 bg-white p-3"><summary className="cursor-pointer list-none"><span className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 font-black text-[#641c27]"><ShoppingBag size={18}/>سبد انتخاب‌ها <span className="badge badge-sm bg-rose-50 text-[#641c27]">{toFa(state.count)}</span></span><span className="text-xs font-bold text-rose-900">{formatPrice(state.total)}</span></span></summary><div className="mt-3"><DemoCart state={state} title="سینی انتخاب‌های شما"/></div></details>

      <section className="mt-7 grid gap-4 border-y border-rose-950/10 py-7 md:grid-cols-[1fr_0.7fr]"><div><span className="text-xs font-bold text-rose-900/60">مهمان‌نوازی شیرازی</span><h2 className="mt-1 text-xl font-black text-[#641c27]">از هفت‌خوان تا سفرهٔ شما</h2><p className="mt-3 text-sm leading-8 text-rose-950/60">هفت‌خوان، نمونه‌ای از منوی رستورانی است که غذاهای سنتی، کافه و خوراک‌های ویژه را در یک تجربهٔ یکپارچه ارائه می‌کند. دسته‌ها را مرور کنید و توضیح هر غذا را بخوانید.</p><div className="mt-4 flex flex-wrap gap-2"><span className="badge border-rose-950/10 bg-white"><Utensils size={13}/>غذای ایرانی</span><span className="badge border-rose-950/10 bg-white"><Star size={13}/>سفرهٔ مجلسی</span><span className="badge border-rose-950/10 bg-white"><Clock3 size={13}/>پذیرایی روزانه</span></div></div><div className="rounded-2xl bg-[#f4e7e8] p-5"><h3 className="font-black text-[#641c27]">اطلاعات مجموعه</h3><p className="mt-2 text-xs leading-6 text-rose-950/55">نشانی و ساعت کاری نمایشی هفت‌خوان.</p><DemoHoursAddress address={state.menu.address} hours={state.menu.hours}/><button type="button" className="btn btn-ghost btn-sm mt-3 text-[#641c27]" onClick={() => state.setNotice("در دمو لینک‌های تلفن و نقشه مقصد بیرونی باز نمی‌کنند.")}><MapPin size={14}/>تماس و مسیر</button></div></section>

      <section className="py-7"><div className="mb-4 flex items-end justify-between gap-3"><div><span className="text-xs font-bold text-rose-900/60">از دفتر هفت‌خوان</span><h2 className="mt-1 text-xl font-black text-[#641c27]">روایت‌های سفره</h2></div><Link href="/blog" className="btn btn-ghost btn-sm text-[#641c27]">مطالب بیشتر <ArrowUpLeft size={14}/></Link></div><div className="grid gap-3 sm:grid-cols-3">{[["راز کلم‌پلوی شیرازی","از سبزی معطر تا کوفته‌های کوچک؛ طعم جنوب در یک قاب."],["چیدمان یک سفرهٔ ایرانی","رسم مهمانی و جزئیات همراه غذا."],["برنج زعفرانی، عطر خانه","انتخاب برنج و دم‌کشیدن آرام."]].map(([title,description])=><article key={title} className="rounded-2xl border border-rose-950/10 bg-white p-4"><BookOpen size={18} className="text-rose-900"/><h3 className="mt-3 text-sm font-black">{title}</h3><p className="mt-1 text-xs leading-6 text-rose-950/55">{description}</p><button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-rose-900" onClick={() => state.setNotice("این مطلب بخشی از پیش‌نمایش منو است.")}>خواندن <ArrowUpLeft size={14}/></button></article>)}</div></section>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rose-950/10 py-5 text-[10px] text-rose-950/50"><span>دموی نمایشی هفت‌خوان · هیچ سفارشی ثبت نمی‌شود</span><Link href="/preview" className="inline-flex items-center gap-1 font-bold text-[#641c27]">بازگشت به دموها <ArrowUpLeft size={14}/></Link></footer>
    </main>
    {state.count > 0 && <button type="button" className="btn btn-primary fixed bottom-4 end-4 z-40 bg-[#641c27] text-white shadow-xl hover:bg-[#741f22] sm:hidden" onClick={() => document.getElementById("haftkhan-cart")?.scrollIntoView({ behavior: "smooth" })}><ShoppingBag size={17}/>{toFa(state.count)} قلم · {formatPrice(state.total)}</button>}
    <DemoProductDialog state={state} variant="heritage"/>
  </div>;
}
