"use client";

import { useMemo, useState } from "react";
import { CakeSlice, Check, Coffee, Cookie, EggFried, IceCreamCone, Minus, Plus, ShoppingBag, Snowflake } from "lucide-react";
import { formatPrice, toFa } from "@/lib/format";

const categories = ["همه", "قهوه", "صبحانه", "دسر"];
const products = [
  { id: 1, category: "قهوه", name: "لاته وانیلی", description: "اسپرسوی دوبل، شیر گرم و وانیل طبیعی", price: 148_000, mark: Coffee },
  { id: 2, category: "قهوه", name: "آیس آمریکانو", description: "اسپرسو، آب خنک و یخ تازه", price: 112_000, mark: Snowflake },
  { id: 3, category: "صبحانه", name: "تست آووکادو", description: "نان خمیرترش، آووکادو و تخم‌مرغ", price: 238_000, mark: EggFried },
  { id: 4, category: "صبحانه", name: "پنکیک عسل", description: "پنکیک روز با میوه فصل و عسل", price: 195_000, mark: IceCreamCone },
  { id: 5, category: "دسر", name: "چیزکیک زعفرانی", description: "چیزکیک خانگی با زعفران ایرانی", price: 165_000, mark: CakeSlice },
  { id: 6, category: "دسر", name: "کوکی شکلاتی", description: "کوکی تازه با شکلات تلخ", price: 78_000, mark: Cookie },
];

/** Local-only sample UI: no request, form submission, analytics, or database write. */
export function DemoPreview() {
  const [category, setCategory] = useState("همه");
  const [cart, setCart] = useState<Record<number, number>>({});
  const visible = useMemo(() => category === "همه" ? products : products.filter((p) => p.category === category), [category]);
  const count = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  const total = products.reduce((sum, p) => sum + p.price * (cart[p.id] ?? 0), 0);
  const change = (id: number, delta: number) => setCart((current) => {
    const next = { ...current, [id]: Math.max(0, Math.min(20, (current[id] ?? 0) + delta)) };
    if (!next[id]) delete next[id];
    return next;
  });

  return <section aria-labelledby="sample-menu-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div className="overflow-hidden rounded-3xl bg-base-100 shadow-xl ring-1 ring-base-300">
      <div className="bg-neutral p-6 text-neutral-content sm:p-8">
        <span className="badge badge-primary badge-outline">نمونه ساختگی</span>
        <h2 id="sample-menu-title" className="mt-4 text-2xl font-black sm:text-3xl">کافه نارون</h2>
        <p className="mt-2 max-w-xl text-sm leading-7 text-neutral-content/75">منوی نمونه را مرور کنید و اقلامی را به سبد نمایشی اضافه کنید. این سبد فقط در همین صفحه و مرورگر نگه داشته می‌شود.</p>
      </div>
      <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-base-100/95 p-4 backdrop-blur" aria-label="دسته‌بندی منو">
        {categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`btn btn-sm shrink-0 ${category === item ? "btn-primary" : "btn-ghost"}`}>{item}</button>)}
      </div>
      <div className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
        {visible.map((product) => { const Mark = product.mark; return <article key={product.id} className="card card-side min-h-36 bg-base-100 ring-1 ring-base-300">
          <div className="grid w-20 shrink-0 place-items-center rounded-s-2xl bg-base-200 text-primary sm:w-24" aria-hidden="true"><Mark size={30} strokeWidth={1.5}/></div>
          <div className="card-body gap-1 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2"><h3 className="font-extrabold">{product.name}</h3><span className="badge badge-ghost badge-sm">{product.category}</span></div>
            <p className="text-xs leading-5 text-base-content/60">{product.description}</p>
            <div className="mt-auto flex items-center justify-between gap-2 pt-2"><b className="text-sm">{formatPrice(product.price)}</b>
              {(cart[product.id] ?? 0) === 0 ? <button type="button" className="btn btn-primary btn-xs" aria-label={`افزودن ${product.name} به سبد نمایشی`} onClick={() => change(product.id, 1)}><Plus size={15}/> افزودن</button> : <div className="join" aria-label={`تعداد ${product.name}`}><button type="button" className="btn btn-xs join-item" aria-label={`کم‌کردن ${product.name}`} onClick={() => change(product.id, -1)}><Minus size={14}/></button><span className="join-item grid min-w-8 place-items-center bg-base-200 text-xs font-bold">{toFa(cart[product.id])}</span><button type="button" className="btn btn-xs join-item" aria-label={`افزودن ${product.name}`} onClick={() => change(product.id, 1)}><Plus size={14}/></button></div>}
            </div>
          </div>
        </article>; })}
      </div>
    </div>
    <aside className="card h-fit bg-base-100 p-5 shadow-lg ring-1 ring-base-300" aria-live="polite">
      <h3 className="flex items-center gap-2 font-extrabold"><ShoppingBag size={19}/> سبد نمایشی <span className="badge badge-primary badge-sm">{toFa(count)}</span></h3>
      <div className="mt-4 space-y-3">
        {count === 0 ? <p className="rounded-xl bg-base-200 p-4 text-sm text-base-content/60">برای دیدن جمع نمونه، یک محصول اضافه کنید.</p> : products.filter((p) => cart[p.id]).map((p) => <div key={p.id} className="flex justify-between gap-3 text-sm"><span>{p.name} × {toFa(cart[p.id])}</span><b>{formatPrice(p.price * cart[p.id])}</b></div>)}
      </div>
      <div className="mt-4 flex justify-between border-t border-base-300 pt-4 font-extrabold"><span>جمع نمونه</span><span>{formatPrice(total)}</span></div>
      <button type="button" disabled className="btn btn-disabled mt-4 w-full" aria-describedby="preview-readonly"><Check size={16}/> ثبت سفارش در پیش‌نمایش خاموش است</button>
      <p id="preview-readonly" className="mt-3 text-xs leading-6 text-base-content/60">هیچ سفارش، پرداخت، پیامک یا تغییر داده‌ای انجام نمی‌شود.</p>
    </aside>
  </section>;
}
