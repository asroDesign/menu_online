import Link from "next/link";
import { ArrowUpLeft, Coffee, Crown, Ship, Sparkles, UtensilsCrossed } from "lucide-react";
import { DEMO_MENUS, type DemoMenuTheme } from "@/lib/demo-menus";

const themeStyles: Record<DemoMenuTheme, { cover: string; accent: string; Icon: typeof Coffee }> = {
  narvan: { cover: "from-emerald-950 via-teal-900 to-stone-800", accent: "text-emerald-100", Icon: Coffee },
  softmenu: { cover: "from-indigo-950 via-violet-900 to-fuchsia-800", accent: "text-violet-100", Icon: Sparkles },
  softmenuPlus: { cover: "from-sky-950 via-cyan-900 to-teal-800", accent: "text-cyan-100", Icon: UtensilsCrossed },
  captain: { cover: "from-slate-950 via-sky-950 to-cyan-900", accent: "text-sky-100", Icon: Ship },
  haftkhan: { cover: "from-stone-950 via-red-950 to-amber-950", accent: "text-amber-100", Icon: Crown },
};

export function DemoMenuGallery() {
  return <section id="demo-menus" className="market-container py-12 sm:py-16" aria-labelledby="demo-menu-gallery-title">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="max-w-2xl">
        <span className="badge badge-primary badge-outline">پیش از خرید، منوها را ببینید</span>
        <h2 id="demo-menu-gallery-title" className="mt-3 text-2xl font-black text-base-content sm:text-3xl">فهرست دموهای منوی مشتری</h2>
        <p className="mt-2 text-sm leading-7 text-base-content/65">چهار نمونهٔ معرفی‌شده و یک نمونهٔ کافه را باز کنید؛ هر دمو ظاهر و دسته‌بندی خودش را دارد و بدون ثبت سفارش قابل بررسی است.</p>
      </div>
      <Link href="/preview" className="btn btn-outline btn-sm min-h-10">همهٔ دموها <ArrowUpLeft size={16}/></Link>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {DEMO_MENUS.map((menu) => {
        const style = themeStyles[menu.theme];
        const Icon = style.Icon;
        const href = menu.id === "narvan" ? `/preview?menu=${encodeURIComponent(menu.id)}` : `/preview/${menu.id}`;
        return <Link key={menu.id} href={href} prefetch={false} className="group min-w-0 overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <div className={`relative flex min-h-32 flex-col justify-between overflow-hidden bg-gradient-to-br p-4 text-white ${style.cover}`}>
            <span aria-hidden="true" className="absolute -end-8 -top-10 size-32 rounded-full border border-white/15 bg-white/5 transition-transform duration-300 group-hover:scale-110" />
            <div className="relative flex items-center justify-between gap-2"><span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold backdrop-blur">{menu.businessType}</span><Icon className={`size-5 ${style.accent}`} aria-hidden="true"/></div>
            <div className="relative mt-5"><h3 className="truncate text-lg font-black">{menu.businessName}</h3><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/75">{menu.description}</p></div>
          </div>
          <div className="p-3.5">
            <div className="flex flex-wrap gap-1.5" aria-label="دسته‌های نمونه">
              {menu.categories.slice(1, 4).map((category) => <span key={category} className="rounded-full bg-base-200 px-2 py-1 text-[10px] font-bold text-base-content/65">{category}</span>)}
              {menu.categories.length > 4 && <span className="rounded-full bg-base-200 px-2 py-1 text-[10px] font-bold text-base-content/55">+{menu.categories.length - 4}</span>}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-base-200 pt-3 text-[10px] text-base-content/55"><span>{menu.products.length} قلم نمونه</span><span>{menu.categories.length - 1} دسته</span></div>
            <span className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-primary/5 text-xs font-extrabold text-primary transition group-hover:bg-primary group-hover:text-primary-content">مشاهدهٔ این دمو <ArrowUpLeft size={15}/></span>
          </div>
        </Link>;
      })}
    </div>
  </section>;
}
