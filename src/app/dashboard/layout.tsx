import { EmojiIcon , IconText} from "@/components/ui";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { getAuth, isImpersonating } from "@/lib/auth";
import { ensurePendingBusinessTrial } from "@/lib/trial-grants";

export const dynamic = "force-dynamic";
export const metadata = { title: "داشبورد | منوی دیجیتال" };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.role === "courier") redirect("/courier");
  if (auth.business.isSuspended && auth.user.role !== "admin")
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <div className="text-5xl"><IconText>{<EmojiIcon emoji="" />}</IconText></div>
          <h1 className="mt-4 text-xl font-extrabold">حساب شما مسدود شده است</h1>
          <p className="mt-2 text-sm leading-7 text-stone-500">برای رفع مسدودی با پشتیبانی تماس بگیرید.</p>
          <Link href="/login" className="mt-5 inline-block text-sm font-bold text-brand-600">بازگشت</Link>
        </div>
      </div>
    );
  if (auth.business.plan === "pending" && !auth.trialActive && auth.user.role !== "admin" && auth.role === "owner" && auth.business.userId === auth.user.id) {
    const recovery = await ensurePendingBusinessTrial(auth.business.id);
    if (recovery.granted || (await getAuth())?.trialActive) redirect("/dashboard");
  }
  if (auth.business.plan === "pending" && !auth.trialActive && auth.user.role !== "admin") {
    const requested = auth.business.upgradeRequest;
    redirect(`/checkout?plan=${requested && ["basic", "premium", "premium_plus"].includes(requested) ? requested : "basic"}&months=12`);
  }
  return (
    <>
    <DashboardShell
      business={{ name: auth.business.name, slug: auth.business.slug, logoEmoji: auth.business.logoEmoji, logoUrl: auth.business.logoUrl, accentColor: auth.business.accentColor, type: auth.business.type, phone: auth.business.phone, address: auth.business.address, description: auth.business.description, instagram: auth.business.instagram }}
      user={{ name: auth.user.name, email: auth.user.email }}
      features={auth.features}
      planFeatures={auth.planFeatures}
      role={auth.role}
      plan={auth.trialActive ? auth.trialPlan ?? "premium_plus" : auth.business.plan}
      isAdmin={auth.user.role === "admin"}
      impersonating={(await isImpersonating()) ? auth.business.name : undefined}
      setupTourAutoStart={auth.user.role !== "admin" && auth.role === "owner" && !auth.business.setupTourCompletedAt}
    >
      {auth.trialActive && auth.trialEndsAt && <div role="status" className="sticky top-0 z-30 mx-auto w-full max-w-screen-2xl border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-2"><span>دورهٔ آزمایشی فعال است و تا {new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(auth.trialEndsAt)} اعتبار دارد.</span><Link href={`/checkout?plan=${encodeURIComponent(auth.trialPlan ?? "premium_plus")}&months=12`} className="font-bold underline">خرید پلن</Link></div></div>}
      {children}
    </DashboardShell>
    </>
  );
}
