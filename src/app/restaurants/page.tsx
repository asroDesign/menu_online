import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { featuresOf } from "@/lib/entitlements";
import { ensureDemoData } from "@/lib/seed";
import { hasAny } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "رستوران‌ها و سفارش آنلاین | منوی دیجیتال" };

export default async function Restaurants() {
  await ensureDemoData();
  const all = await db.select().from(businesses).where(eq(businesses.isSuspended, false));
  const list = [];
  for (const b of all) {
    const f = await featuresOf(b);
    if (b.slug === "admin-panel") continue;
    list.push({ b, order: b.acceptOrders && (hasAny(f, "self_order") || hasAny(f, "delivery_order")), delivery: hasAny(f, "delivery_order") });
  }
  return (
    <div className="min-h-dvh bg-[#f6f5f3]">
      <header className="border-b border-stone-200 bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Link href="/" className="flex items-center gap-2 font-extrabold"><span className="flex size-9 items-center justify-center rounded-xl bg-brand-500 text-white">🍽️</span>منوی دیجیتال</Link><Link href="/login" className="text-sm font-semibold text-stone-600">ورود مدیران</Link></div></header>
      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="text-2xl font-black">رستوران‌ها و کافه‌ها</h1>
        <p className="mt-2 text-sm text-stone-500">منو را ببینید و مستقیم از هر رستوران سفارش دهید؛ برای ارسال، مقصد را روی نقشه مشخص کنید.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {list.map(({ b, order, delivery }) => (
            <Link key={b.id} href={`/m/${b.slug}`} className="group flex gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-0.5 hover:shadow-lg">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl text-3xl text-white" style={{ background: b.accentColor }}>{b.logoEmoji}</span>
              <div className="min-w-0"><h2 className="font-extrabold">{b.name}</h2><p className="mt-1 line-clamp-2 text-xs leading-6 text-stone-500">{b.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">{order ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-700">سفارش آنلاین</span> : <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-500">فقط منو</span>}{delivery && <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-sky-700">🛵 ارسال</span>}</div></div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
