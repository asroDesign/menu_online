import { EmojiIcon , IconText} from "@/components/ui";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { getAuth, isImpersonating } from "@/lib/auth";

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
  if (auth.business.plan === "pending" && auth.user.role !== "admin") {
    const requested = auth.business.upgradeRequest;
    redirect(`/checkout?plan=${requested && ["basic", "premium", "premium_plus"].includes(requested) ? requested : "basic"}&months=12`);
  }
  return (
    <DashboardShell
      business={{ name: auth.business.name, slug: auth.business.slug, logoEmoji: auth.business.logoEmoji, logoUrl: auth.business.logoUrl }}
      user={{ name: auth.user.name, email: auth.user.email }}
      features={auth.features}
      planFeatures={auth.planFeatures}
      role={auth.role}
      plan={auth.business.plan}
      isAdmin={auth.user.role === "admin"}
      impersonating={(await isImpersonating()) ? auth.business.name : undefined}
    >
      {children}
    </DashboardShell>
  );
}
