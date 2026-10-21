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
    <main dir="rtl" className="min-h-dvh bg-base-200/70 px-4 py-8 text-base-content">
      <div className="mx-auto max-w-xl">
        <Link href={`/m/${slug}`} className="text-sm font-semibold text-primary">← بازگشت به منوی {data.business.name}</Link>
        <div className="mt-5 rounded-3xl bg-base-100 p-5 shadow-xl shadow-base-content/5 ring-1 ring-base-300 sm:p-8">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon name="calendar" className="size-6" /></span>
          <h1 className="mt-4 text-2xl font-extrabold">رزرو میز</h1>
          <p className="mt-2 text-sm leading-7 text-base-content/60">درخواست رزرو در {data.business.name} را ثبت کنید. رستوران پس از بررسی ظرفیت، رزرو را تأیید می‌کند.</p>
          <ReservationForm
            slug={slug}
            businessName={data.business.name}
            settings={data.business.reservationSettings!}
            accentColor={data.business.accentColor}
          />
        </div>
      </div>
    </main>
  );
}
