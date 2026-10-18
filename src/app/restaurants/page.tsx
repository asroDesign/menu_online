import { EmojiIcon} from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import "@/components/marketing/marketing.css";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { featuresOf } from "@/lib/entitlements";
import { ensureDemoData, DEMO_SLUG } from "@/lib/seed";
import { DEMO_ENABLED } from "@/lib/demo-mode";
import { hasAny } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "رستوران‌ها و سفارش آنلاین | منوی دیجیتال" };

export default async function Restaurants() {
  await ensureDemoData();
  const all = await db.select().from(businesses).where(eq(businesses.isSuspended, false));
  const list = [];
  for (const b of all) {
    const f = await featuresOf(b);
    if (b.slug === "admin-panel" || (!DEMO_ENABLED && b.slug === DEMO_SLUG)) continue;
    list.push({ b, order: b.acceptOrders && (hasAny(f, "self_order") || hasAny(f, "delivery_order")), delivery: hasAny(f, "delivery_order") });
  }
  return (
    <div className="marketing-site"><SiteHeader/>
      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="text-2xl font-black">رستوران‌ها و کافه‌ها</h1>
        <p className="mt-2 text-sm text-stone-500">منو را ببینید و مستقیم از هر رستوران سفارش دهید؛ برای ارسال، مقصد را روی نقشه مشخص کنید.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {list.map(({ b, order, delivery }) => (
            <Link key={b.id} href={`/m/${b.slug}`} className="group flex gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-0.5 hover:shadow-lg">
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-3xl text-white" style={{ background: b.accentColor }}><BrandLogo url={b.logoUrl} alt={b.name} className="size-full bg-white object-contain p-1.5" fallback={<EmojiIcon emoji={b.logoEmoji} />} /></span>
              <div className="min-w-0"><h2 className="font-extrabold">{b.name}</h2><p className="mt-1 line-clamp-2 text-xs leading-6 text-stone-500">{b.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">{order ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-700">سفارش آنلاین</span> : <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-500">فقط منو</span>}{delivery && <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-sky-700">{<EmojiIcon emoji="" />} ارسال</span>}</div></div>
            </Link>
          ))}
        </div>
      </main><SiteFooter/>
    </div>
  );
}
