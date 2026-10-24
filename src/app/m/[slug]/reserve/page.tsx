import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicMenu } from "@/lib/public-menu";
import { ReservationForm } from "@/components/reservation-form";
import { Icon } from "@/components/ui";
import { DEMO_SLUG } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

export default async function ReservePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === DEMO_SLUG) notFound();
  const data = await getPublicMenu(slug);
  if (!data || !data.caps.reservations) notFound();
  return (
    <main dir="rtl" className="min-h-dvh bg-[#f4f7fb] px-3 py-4 text-base-content sm:px-5 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <Link href={`/m/${slug}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-primary transition hover:bg-white"><Icon name="arrowRight" className="size-4"/>بازگشت به منوی {data.business.name}</Link>
        <div className="mt-4 overflow-hidden rounded-[1.8rem] bg-white shadow-[0_24px_70px_-38px_rgba(15,23,42,.35)] ring-1 ring-base-300">
          <div className="relative overflow-hidden px-5 py-6 text-white sm:px-8 sm:py-8" style={{ background: `linear-gradient(125deg, ${data.business.accentColor}, ${data.business.accentColor}dd 55%, #172554)` }}>
            <span className="absolute -end-10 -top-16 size-48 rounded-full bg-white/10"/><span className="absolute -bottom-20 start-1/3 size-52 rounded-full bg-white/10"/>
            <span className="relative grid size-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Icon name="calendar" className="size-6"/></span>
            <p className="relative mt-4 text-xs font-bold text-white/75">{data.business.name}</p>
            <h1 className="relative mt-1 text-2xl font-black sm:text-3xl">رزرو میز</h1>
            <p className="relative mt-2 max-w-lg text-xs leading-6 text-white/80">زمان و تعداد نفرات را انتخاب کنید، میزهای آزاد را ببینید و درخواستتان را برای مجموعه بفرستید.</p>
          </div>
          <div className="p-4 sm:p-7">
          <ReservationForm
            slug={slug}
            businessName={data.business.name}
            settings={data.business.reservationSettings!}
            accentColor={data.business.accentColor}
          />
          </div>
        </div>
      </div>
    </main>
  );
}
