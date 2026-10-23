"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Anchor, Check, Clock3, Coffee, CupSoda, EggFried, Fish, Flame, Leaf, MapPin, Minus, Pizza, Plus, Salad, Sandwich, ShoppingBag, Sparkles, Star, Utensils, UtensilsCrossed, X } from "lucide-react";
import { formatPrice, toFa } from "@/lib/format";
import type { DemoMenuProduct } from "@/lib/demo-menus";
import type { DemoMenuState } from "./demo-menu-state";
import { useState } from "react";
import styles from "@/components/captainm-theme.module.css";

const artIcons = { coffee: Coffee, food: UtensilsCrossed, dessert: Sparkles, cold: CupSoda, pizza: Pizza, fish: Fish, salad: Salad, breakfast: EggFried, burger: Sandwich, drink: CupSoda } as const;

export function FoodArt({ product, className = "", variant = "warm" }: { product: DemoMenuProduct; className?: string; variant?: "warm" | "violet" | "sea" | "space" | "heritage" }) {
  const Icon = artIcons[product.mark];
  const source = product.mark === "coffee" ? "/images/cashier/beverage.webp" : product.mark === "dessert" ? "/images/cashier/dessert.webp" : product.mark === "cold" || product.mark === "drink" ? "/images/cashier/cold-drink.webp" : "/images/cashier/meal.webp";
  const cosmicBackground: Record<DemoMenuProduct["mark"], string> = {
    coffee: "radial-gradient(ellipse at 50% 112%, rgba(246, 186, 112, .28), transparent 52%), linear-gradient(135deg, #30234a, #172343 58%, #102c3b)",
    food: "radial-gradient(ellipse at 48% 112%, rgba(113, 173, 255, .26), transparent 54%), linear-gradient(135deg, #1c3154, #211c4a 58%, #12313d)",
    dessert: "radial-gradient(ellipse at 50% 112%, rgba(231, 158, 255, .3), transparent 54%), linear-gradient(135deg, #36244d, #25204e 58%, #123044)",
    cold: "radial-gradient(ellipse at 50% 112%, rgba(94, 232, 255, .28), transparent 54%), linear-gradient(135deg, #153d55, #1b2850 58%, #112b42)",
    pizza: "radial-gradient(ellipse at 50% 112%, rgba(255, 177, 94, .32), transparent 54%), linear-gradient(135deg, #382b4a, #272044 58%, #193047)",
    fish: "radial-gradient(ellipse at 50% 112%, rgba(89, 224, 221, .28), transparent 54%), linear-gradient(135deg, #153b50, #20254b 58%, #102f3e)",
    salad: "radial-gradient(ellipse at 50% 112%, rgba(157, 226, 132, .24), transparent 54%), linear-gradient(135deg, #183c4a, #202347 58%, #142f39)",
    breakfast: "radial-gradient(ellipse at 50% 112%, rgba(255, 210, 120, .3), transparent 54%), linear-gradient(135deg, #342b49, #222246 58%, #18334a)",
    burger: "radial-gradient(ellipse at 50% 112%, rgba(255, 166, 104, .32), transparent 54%), linear-gradient(135deg, #3b2949, #252044 58%, #173047)",
    drink: "radial-gradient(ellipse at 50% 112%, rgba(135, 198, 255, .28), transparent 54%), linear-gradient(135deg, #193855, #22204d 58%, #123446)",
  };
  const artPalettes = {
    warm: "from-orange-100 via-amber-50 to-rose-100 text-orange-700",
    violet: "from-violet-200 via-fuchsia-100 to-amber-100 text-violet-800",
    sea: "from-cyan-200 via-sky-100 to-blue-200 text-sky-900",
    space: "from-indigo-300 via-violet-200 to-cyan-200 text-indigo-950",
    heritage: "from-amber-200 via-orange-100 to-yellow-50 text-amber-950",
  };
  const space = variant === "space";
  return <div aria-hidden="true" style={space ? { background: cosmicBackground[product.mark] } : undefined} className={`relative grid overflow-hidden place-items-center bg-gradient-to-br ${space ? styles.cosmicArt : artPalettes[variant]} ${className}`}>
    {!space && <Image src={source} alt="" fill sizes="(max-width: 640px) 45vw, 260px" className="object-cover opacity-75 mix-blend-multiply"/>}
    {!space && <span className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20"/>}
    {space ? <><span className={styles.cosmicArtOrb}/><span className="absolute end-[18%] top-[22%] size-1.5 rounded-full bg-white shadow-[0_0_10px_3px_rgba(255,255,255,.3)]"/><span className="absolute bottom-[24%] start-[16%] size-1 rounded-full bg-cyan-100 shadow-[0_0_9px_3px_rgba(124,236,255,.4)]"/></> : <><span className="absolute -end-5 -top-7 size-24 rounded-full border border-current/10"/><span className="absolute -start-5 -bottom-9 size-28 rounded-full border border-current/10"/></>}
    <span className={`relative z-[1] grid size-14 place-items-center rounded-full shadow-sm ring-1 backdrop-blur ${space ? `${styles.cosmicArtIcon} ring-white/20` : "bg-white/65 ring-white/80"}`}><Icon size={26} strokeWidth={1.5}/></span>
  </div>;
}

export function DemoNotice({ state, dark = false }: { state: DemoMenuState; dark?: boolean }) {
  if (!state.notice) return null;
  return <div role="status" className={`mx-4 my-3 flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs leading-6 ${dark ? "border-white/15 bg-white/10 text-white" : "border-primary/20 bg-primary/5 text-base-content"}`}><span>{state.notice}</span><button type="button" className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-black/5" aria-label="بستن پیام" onClick={() => state.setNotice("")}><X size={15}/></button></div>;
}

export function DemoProductDialog({ state, variant = "warm" }: { state: DemoMenuState; variant?: "warm" | "violet" | "sea" | "space" | "heritage" }) {
  const product = state.selected;
  const [activeTab, setActiveTab] = useState<"description" | "reviews">("description");
  const [review, setReview] = useState("");
  const [feedback, setFeedback] = useState("");
  const closeProduct = state.closeProduct;
  function closeDialog() { state.closeProduct(); setActiveTab("description"); setReview(""); setFeedback(""); }
  useEffect(() => {
    if (!product) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { closeProduct(); setActiveTab("description"); setReview(""); setFeedback(""); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [product, closeProduct]);
  if (!product) return null;
  const price = state.option?.price ?? product.price;
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="demo-item-title" className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-base-100 shadow-2xl sm:max-w-lg sm:rounded-3xl ${variant === "space" ? styles.demoDialog : ""}`}>
      <FoodArt product={product} variant={variant} className="h-48 sm:h-56"/>
        <div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><span className={`badge badge-primary badge-outline ${variant === "space" ? "border-cyan-100/20 text-cyan-100" : ""}`}>{product.category}</span><h2 id="demo-item-title" className="mt-2 text-xl font-black">{product.name}</h2></div><button type="button" onClick={closeDialog} className="btn btn-circle btn-ghost btn-sm" aria-label="بستن جزئیات"><X size={18}/></button></div>
        <div className={`mt-4 flex gap-2 border-b ${variant === "space" ? "border-white/10" : "border-base-200"}`} role="tablist" aria-label="بخش‌های جزئیات محصول"><button type="button" role="tab" aria-selected={activeTab === "description"} onClick={() => setActiveTab("description")} className={`border-b-2 px-3 py-2 text-xs font-bold ${activeTab === "description" ? variant === "space" ? styles.demoDialogTabActive : "border-primary text-primary" : "border-transparent text-base-content/55"}`}>توضیحات</button><button type="button" role="tab" aria-selected={activeTab === "reviews"} onClick={() => setActiveTab("reviews")} className={`border-b-2 px-3 py-2 text-xs font-bold ${activeTab === "reviews" ? variant === "space" ? styles.demoDialogTabActive : "border-primary text-primary" : "border-transparent text-base-content/55"}`}>دیدگاه‌ها · {toFa(2)}</button></div>
        {activeTab === "description" ? <><p className={`mt-3 text-sm leading-7 ${variant === "space" ? "text-slate-300" : "text-base-content/65"}`}>{product.description}</p><p className={`mt-2 rounded-xl p-3 text-xs leading-6 ${variant === "space" ? styles.demoDialogMuted : "bg-base-200/70 text-base-content/55"}`}>اطلاعات ترکیبات و قیمت در این صفحه برای پیش‌نمایش منو است.</p></> : <div className="mt-3 space-y-3"><div className={`rounded-xl p-3 ${variant === "space" ? styles.demoDialogMuted : "bg-base-200/70"}`}><span className="flex items-center gap-1 text-amber-500" aria-label="امتیاز ۵ از ۵">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={12} className="fill-current"/>)}</span><p className="mt-1 text-xs leading-6">طعم و اندازهٔ این انتخاب برای یک وعده مناسب بود.</p><span className="text-[10px] text-base-content/45">دیدگاه نمونه · بدون هویت مشتری</span></div><label className="form-control"><span className="mb-1 text-xs font-bold">دیدگاه شما</span><textarea value={review} onChange={(event) => setReview(event.target.value)} maxLength={300} rows={3} className={`textarea textarea-bordered text-sm ${variant === "space" ? styles.demoDialogInput : ""}`} placeholder="نظر خود را برای پیش‌نمایش بنویسید"/></label><button type="button" disabled={!review.trim()} className="btn btn-outline btn-sm" onClick={() => { setFeedback("دیدگاه در همین پیش‌نمایش نمایش داده شد و به سامانه‌ای ارسال نشد."); setReview(""); }}><Check size={14}/>ثبت نمایشی دیدگاه</button>{feedback && <p role="status" className="rounded-lg bg-success/10 p-2 text-xs text-success">{feedback}</p>}</div>}
        {product.options?.length ? <fieldset className="mt-4"><legend className="mb-2 text-xs font-bold">اندازه و قیمت را انتخاب کنید</legend><div className="grid gap-2 sm:grid-cols-2">{product.options.map((item) => { const selected = state.option?.label === item.label; return <label key={item.label} className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm ${variant === "space" ? selected ? "border-cyan-200/50 bg-cyan-200/10 text-white" : styles.demoDialogMuted : selected ? "border-primary bg-primary/5" : "border-base-300"}`}><span className="flex items-center gap-2"><input type="radio" name="demo-item-option" className="radio radio-primary radio-sm" checked={selected} onChange={() => state.setOption(item)}/>{item.label}</span><b>{formatPrice(item.price)}</b></label>; })}</div></fieldset> : null}
        <div className={`mt-5 flex items-center justify-between gap-3 border-t pt-4 ${variant === "space" ? "border-white/10" : "border-base-200"}`}><b className="text-base">{formatPrice(price)}</b><button type="button" disabled={product.available === false} className="btn btn-primary disabled:btn-disabled" onClick={() => { state.add(product, state.option ?? undefined); state.closeProduct(); state.setNotice(`${product.name} به سبد نمایشی اضافه شد.`); }}><Plus size={16}/>{product.available === false ? "فعلاً ناموجود" : "افزودن به سبد"}</button></div>
      </div>
    </section>
  </div>;
}

export function DemoCart({ state, className = "", title = "سبد سفارش نمایشی" }: { state: DemoMenuState; className?: string; title?: string }) {
  return <aside aria-live="polite" className={`rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm ${className}`}>
    <h2 className="flex items-center gap-2 font-black"><ShoppingBag size={18} className="text-primary"/>{title}<span className="badge badge-primary badge-sm">{toFa(state.count)}</span></h2>
    <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
      {state.cartLines.length === 0 ? <p className="rounded-xl bg-base-200 p-3 text-xs leading-6 text-base-content/55">با افزودن چند قلم، جمع سفارش نمایشی اینجا دیده می‌شود.</p> : state.cartLines.map((line) => <div key={`${line.product.id}:${line.option?.label ?? "default"}`} className="flex items-start justify-between gap-3 text-xs"><span className="min-w-0">{line.product.name}{line.option && <small className="ms-1 text-base-content/55">({line.option.label})</small>}<span className="mt-1 flex items-center gap-1"><button className="btn btn-ghost btn-xs min-h-6 h-6 px-1" aria-label={`کم کردن ${line.product.name}`} onClick={() => state.remove(line.product, line.option)}><Minus size={12}/></button><b>{toFa(line.quantity)}</b><button className="btn btn-ghost btn-xs min-h-6 h-6 px-1" aria-label={`زیاد کردن ${line.product.name}`} onClick={() => state.add(line.product, line.option)}><Plus size={12}/></button></span></span><b className="shrink-0">{formatPrice((line.option?.price ?? line.product.price) * line.quantity)}</b></div>)}
    </div>
    <div className="mt-3 flex items-center justify-between border-t border-base-200 pt-3 text-sm font-black"><span>جمع نمایشی</span><span>{formatPrice(state.total)}</span></div>
    <button type="button" disabled className="btn btn-disabled mt-3 w-full">ثبت سفارش در دمو غیرفعال است</button>
  </aside>;
}

export function DemoPrice({ product }: { product: DemoMenuProduct }) {
  return <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{formatPrice(product.price)}</strong>{product.originalPrice && <del className="text-[11px] text-base-content/40">{formatPrice(product.originalPrice)}</del>}{product.options?.length ? <span className="badge badge-ghost badge-xs">تنوع قیمت</span> : null}</div>;
}

export function DemoHoursAddress({ address, hours, light = false }: { address: string; hours: string; light?: boolean }) {
  return <div className={`flex flex-wrap gap-x-5 gap-y-2 text-xs ${light ? "text-white/75" : "text-base-content/55"}`}><span className="inline-flex items-center gap-1.5"><Clock3 size={14}/>{hours}</span><span className="inline-flex items-center gap-1.5"><MapPin size={14}/>{address}</span></div>;
}

export function DemoItemActions({ state, product, onDetails }: { state: DemoMenuState; product: DemoMenuProduct; onDetails?: () => void }) {
  const quantity = state.cartLines.filter((line) => line.product.id === product.id).reduce((sum, line) => sum + line.quantity, 0);
  if (product.available === false) return <button type="button" disabled className="btn btn-disabled btn-xs min-h-8">ناموجود</button>;
  return <div className="flex items-center gap-2">
    <button type="button" onClick={onDetails ?? (() => state.openProduct(product))} className="btn btn-ghost btn-xs min-h-8">جزئیات</button>
    {product.options?.length ? <button type="button" className="btn btn-primary btn-xs min-h-8" onClick={() => state.openProduct(product)}><Plus size={14}/>انتخاب</button> : quantity === 0 ? <button type="button" className="btn btn-primary btn-xs min-h-8" onClick={() => state.add(product)}><Plus size={14}/>افزودن</button> : <span className="join"><button type="button" className="btn btn-xs join-item min-h-8" aria-label={`کم کردن ${product.name}`} onClick={() => state.remove(product)}><Minus size={13}/></button><span className="join-item grid min-w-7 place-items-center bg-base-200 text-xs font-bold">{toFa(quantity)}</span><button type="button" className="btn btn-xs join-item min-h-8" aria-label={`زیاد کردن ${product.name}`} onClick={() => state.add(product)}><Plus size={13}/></button></span>}
  </div>;
}

export function DemoBrandMark({ style = "amber" }: { style?: "amber" | "violet" | "sea" | "space" | "red" }) {
  const classes = { amber: "bg-amber-500 text-white", violet: "bg-violet-700 text-white", sea: "bg-cyan-600 text-white", space: "bg-gradient-to-br from-indigo-400 to-cyan-400 text-slate-950 shadow-cyan-300/20", red: "bg-red-950 text-amber-100" };
  return <span className={`grid size-11 shrink-0 place-items-center rounded-2xl shadow-md ${classes[style]}`}><Utensils size={21}/></span>;
}

export function DemoSectionTitle({ eyebrow, title, icon = "leaf" }: { eyebrow: string; title: string; icon?: "leaf" | "flame" | "check" | "anchor" }) {
  const Icon = icon === "flame" ? Flame : icon === "check" ? Check : icon === "anchor" ? Anchor : Leaf;
  return <div className="mb-4"><span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary"><Icon size={14}/>{eyebrow}</span><h2 className="mt-1 text-xl font-black sm:text-2xl">{title}</h2></div>;
}
