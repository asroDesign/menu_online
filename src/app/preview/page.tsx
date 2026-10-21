import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpLeft, LockKeyhole } from "lucide-react";
import { DemoPreview } from "@/components/marketing/demo-preview";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { PlatformEventBeacon } from "@/components/marketing/platform-event-beacon";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "دموی تعاملی منوی دیجیتال | MenuPeak",
  description: "پیش‌نمایش ساختگی و فقط‌خواندنی منوی دیجیتال و پنل MenuPeak؛ بدون ثبت سفارش یا ارسال اطلاعات.",
  alternates: { canonical: `${getSiteUrl()}/preview` },
};

export default function PreviewPage() {
  return <div className="marketing-site min-h-dvh bg-base-200/50"><PlatformEventBeacon name="demo_preview_view"/><SiteHeader/><main className="market-container py-10 sm:py-14">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl"><span className="badge badge-primary badge-outline">پیش‌نمایش تعاملی</span><h1 className="mt-4 text-3xl font-black sm:text-5xl">منو را تجربه کنید.<br/><span className="text-primary">بدون ثبت اطلاعات.</span></h1><p className="mt-4 leading-8 text-base-content/65">اطلاعات این محیط ساختگی است. اقلام سبد فقط به‌صورت محلی نمایش داده می‌شوند و سفارشی به سامانه فرستاده نمی‌شود.</p></div>
      <Link href="/demo" className="btn btn-primary">درخواست نمایش همراه کارشناس <ArrowUpLeft size={17}/></Link>
    </div>
    <div className="alert mb-6 border-primary/20 bg-primary/5"><LockKeyhole size={19}/><span>فقط داده‌ی نمونه · بدون ورود · بدون ذخیره‌سازی · بدون پرداخت یا پیامک</span></div>
    <DemoPreview/>
    <section className="mt-12 grid items-center gap-6 rounded-3xl bg-base-100 p-6 shadow-sm ring-1 ring-base-300 sm:p-8 lg:grid-cols-[0.85fr_1.15fr]">
      <div><h2 className="text-2xl font-black">نمایی از پنل مدیریت</h2><p className="mt-3 leading-7 text-base-content/65">این تصویر نیز داده‌ی نمونه است و به حساب یا کسب‌وکار واقعی وصل نیست.</p><Link href="/plans" className="btn btn-outline mt-5">مقایسه تعرفه‌ها <ArrowUpLeft size={16}/></Link></div>
      <div className="overflow-hidden rounded-2xl"><DashboardPreview/></div>
    </section>
  </main><SiteFooter/></div>;
}
