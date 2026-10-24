"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, CalendarDays, Clock3, MapPin, Phone, Play, ShoppingBag } from "lucide-react";
import type { MenuGalleryItem, Settings } from "@/lib/plans";
import type { PublicMenu } from "@/lib/public-menu";
import { cn, Icon } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { toFa } from "@/lib/format";

type Business = PublicMenu["business"];

function Gallery({ items, name, accent, compact = false }: { items: MenuGalleryItem[]; name: string; accent: string; compact?: boolean }) {
  const [active, setActive] = useState(0);
  const item = items[active];
  if (!item) return null;
  return <section aria-label={`گالری ${name}`} className={cn("overflow-hidden bg-stone-100", compact ? "rounded-2xl" : "rounded-b-[2rem] sm:rounded-[2rem]")}>
    <div className={cn("relative isolate overflow-hidden", compact ? "aspect-[2.3/1]" : "aspect-[1.7/1] sm:aspect-[2.25/1]")}>
      {item.kind === "video"
        ? <video key={item.url} src={item.url} autoPlay muted loop playsInline preload="metadata" className="absolute inset-0 size-full object-cover" aria-label={item.caption || `ویدیوی ${name}`} />
        : <Image key={item.url} src={item.url} alt={item.caption || name} fill unoptimized priority={active === 0} sizes="(max-width: 640px) 100vw, 720px" className="object-cover" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/5" />
      {item.caption && <p className="absolute inset-x-4 bottom-4 z-10 line-clamp-2 text-sm font-bold text-white drop-shadow-md sm:text-base">{item.caption}</p>}
      {item.kind === "video" && <span className="absolute end-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur"><Play className="size-3" fill="currentColor"/> ویدیو</span>}
    </div>
    {items.length > 1 && <div className="no-scrollbar flex gap-2 overflow-x-auto bg-white/90 p-2.5" role="group" aria-label="انتخاب تصویر گالری">
      {items.map((media, index) => <button key={media.id} type="button" onClick={() => setActive(index)} aria-label={`نمایش تصویر ${toFa(index + 1)}`} aria-pressed={active === index} className={cn("relative size-14 shrink-0 overflow-hidden rounded-xl ring-1 transition sm:size-16", active === index ? "ring-2 ring-offset-1" : "ring-stone-200 opacity-75 hover:opacity-100")} style={active === index ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}>
        {media.kind === "video" ? <><video src={media.url} muted playsInline preload="metadata" className="size-full object-cover"/><span className="absolute inset-0 grid place-items-center bg-black/20"><Play className="size-4 text-white" fill="currentColor"/></span></> : <Image src={media.url} alt="" fill unoptimized sizes="64px" className="object-cover" />}
      </button>)}
    </div>}
  </section>;
}

function todayHours(hours: Settings["operatingHours"] | null) {
  if (!hours?.enabled) return "ساعت کاری را از مجموعه بپرسید";
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", weekday: "short" }).format(new Date());
  const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekday];
  const hoursToday = hours.days?.find((entry) => entry.day === day);
  return hoursToday?.open ? `${hoursToday.start} تا ${hoursToday.end}` : "امروز تعطیل است";
}

export function PublicMenuGallery({ items, name, accent }: { items: MenuGalleryItem[]; name: string; accent: string }) {
  if (!items.length) return null;
  return <div className="px-3 pt-3 sm:px-5 sm:pt-5"><Gallery items={items} name={name} accent={accent} compact /></div>;
}

export function PublicMenuShowcase({
  business, items, reservations, canOrder, canDelivery, readOnly, tableName, onOpenMenu,
}: {
  business: Business; items: MenuGalleryItem[]; reservations: boolean; canOrder: boolean; canDelivery: boolean;
  readOnly: boolean; tableName?: string; onOpenMenu: () => void;
}) {
  const { accentColor, name, address, phone, description, logoEmoji, logoUrl, isOpen, operatingHours, lat, lng } = business;
  const mapUrl = lat != null && lng != null ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}` : "";
  return <section className="mx-auto max-w-3xl space-y-3 px-3 pt-3 sm:px-5 sm:pt-5" aria-label={`معرفی ${name}`}>
    <Gallery items={items} name={name} accent={accentColor} />
    <div className="rounded-[1.7rem] bg-white p-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,.34)] ring-1 ring-stone-200/70 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200"><BrandLogo url={logoUrl} alt={name} className="size-full object-contain p-1.5" fallback={<span className="text-2xl">{logoEmoji}</span>} /></span>
          <div className="min-w-0"><h1 className="truncate text-xl font-black text-stone-900 sm:text-2xl">{name}</h1>{address && <p className="mt-1 flex items-center gap-1 text-xs text-stone-500"><MapPin className="size-3.5 shrink-0"/><span className="truncate">{address}</span></p>}</div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[11px] font-extrabold text-emerald-800 ring-1 ring-emerald-100"><ShoppingBag className="size-3.5"/> منوی مشتری</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-2", isOpen ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-600")}><span className={cn("size-2 rounded-full", isOpen ? "bg-emerald-500" : "bg-stone-400")}/>{isOpen ? "اکنون باز است" : "اکنون بسته است"}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-50 px-3 py-2 text-stone-600"><Clock3 className="size-3.5"/> امروز · {todayHours(operatingHours)}</span>
        {tableName && <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-2 text-blue-800"><Icon name="table" className="size-3.5"/>{tableName}</span>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button type="button" onClick={onOpenMenu} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold text-white shadow-sm transition hover:brightness-105 active:scale-[.99] sm:col-span-1" style={{ backgroundColor: accentColor }}><ShoppingBag className="size-4"/> مشاهده منو <ArrowDown className="size-3.5"/></button>
        {reservations && !readOnly && <Link href={`/m/${business.slug}/reserve`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-50 px-3 text-sm font-extrabold text-amber-950 ring-1 ring-amber-100 transition hover:bg-amber-100"><CalendarDays className="size-4"/> رزرو میز</Link>}
        {phone && <a href={`tel:${phone}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50"><Phone className="size-4"/> تماس</a>}
      </div>
      {(canDelivery || reservations) && <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-stone-600">
        {canDelivery && <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2.5"><span>سفارش بیرون‌بر</span><b className="text-stone-800">دارد</b></div>}
        {reservations && <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2.5"><span>رزرو آنلاین</span><b className="text-stone-800">فعال</b></div>}
      </div>}
      {!canOrder && !readOnly && <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-6 text-blue-900">این منو برای مشاهده است؛ برای سفارش با مجموعه تماس بگیرید.</p>}
      {description && <div className="mt-5 border-t border-stone-100 pt-4"><p className="text-xs font-extrabold text-stone-800">درباره {name}</p><p className="mt-2 text-xs leading-7 text-stone-600">{description}</p></div>}
    </div>
    {mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 text-sm ring-1 ring-stone-200 transition hover:bg-stone-50"><span className="flex items-center gap-2 font-extrabold text-stone-900"><span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><MapPin className="size-4"/></span>موقعیت و مسیر<small className="font-normal text-stone-500">{address || "موقعیت دقیق مجموعه"}</small></span><span className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ backgroundColor: accentColor }}>مسیریابی</span></a>}
  </section>;
}
