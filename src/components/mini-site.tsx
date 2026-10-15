import Link from "next/link";
import type { businesses } from "@/db/schema";
import type { Settings } from "@/lib/plans";

type Biz = typeof businesses.$inferSelect;

export function MiniSite({ biz, custom }: { biz: Biz; custom: boolean }) {
  const ms = ((biz.settings ?? {}) as Settings).miniSite ?? {};
  const accent = biz.accentColor;
  return (
    <div className="min-h-dvh bg-white text-stone-900">
      <header className="relative overflow-hidden px-6 py-24 text-center text-white" style={{ background: `linear-gradient(135deg, ${accent}, #1c1917)` }}>
        {custom && ms.heroImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ms.heroImage} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
        )}
        <div className="relative mx-auto max-w-2xl">
          <div className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-white text-4xl shadow-xl">{biz.logoEmoji}</div>
          <h1 className="mt-6 text-4xl font-black">{ms.heroTitle || biz.name}</h1>
          <p className="mt-4 text-lg leading-8 text-white/85">{ms.heroSubtitle || biz.description}</p>
          {ms.showMenuButton !== false && (
            <Link href={`/m/${biz.slug}`} className="mt-8 inline-block rounded-2xl bg-white px-8 py-3.5 font-bold text-stone-900 shadow-xl transition hover:scale-105">مشاهده منو و سفارش 🍽️</Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-14 px-6 py-14">
        {(ms.about || biz.description) && (
          <section><h2 className="text-2xl font-black" style={{ color: accent }}>درباره‌ی ما</h2><p className="mt-4 whitespace-pre-line text-lg leading-9 text-stone-600">{ms.about || biz.description}</p></section>
        )}
        {custom && ms.sections?.map((s, i) => (
          <section key={i} className="rounded-3xl bg-stone-50 p-8"><h2 className="text-xl font-black">{s.title}</h2><p className="mt-3 leading-8 text-stone-600">{s.text}</p></section>
        ))}
        {ms.gallery && ms.gallery.length > 0 && (
          <section>
            <h2 className="mb-5 text-2xl font-black" style={{ color: accent }}>گالری</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {ms.gallery.map((g, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={g} alt="" loading="lazy" className="aspect-square w-full rounded-2xl object-cover shadow-sm" />
              ))}
            </div>
          </section>
        )}
        <section className="grid gap-4 sm:grid-cols-3">
          {ms.hours && <div className="rounded-2xl bg-stone-50 p-5"><p className="text-2xl">⏰</p><p className="mt-2 text-xs text-stone-500">ساعات کار</p><p className="mt-1 font-bold">{ms.hours}</p></div>}
          {biz.phone && <a href={`tel:${biz.phone}`} className="rounded-2xl bg-stone-50 p-5"><p className="text-2xl">📞</p><p className="mt-2 text-xs text-stone-500">تماس</p><p className="mt-1 font-bold">{biz.phone}</p></a>}
          {biz.address && <div className="rounded-2xl bg-stone-50 p-5"><p className="text-2xl">📍</p><p className="mt-2 text-xs text-stone-500">آدرس</p><p className="mt-1 font-bold leading-7">{biz.address}</p></div>}
        </section>
        {biz.instagram && <p className="text-center"><a href={`https://instagram.com/${biz.instagram}`} target="_blank" className="font-bold" style={{ color: accent }} dir="ltr">@{biz.instagram}</a></p>}
      </main>
      <footer className="border-t border-stone-100 py-6 text-center text-xs text-stone-400">© {biz.name} · قدرت‌گرفته از منوی دیجیتال</footer>
    </div>
  );
}
