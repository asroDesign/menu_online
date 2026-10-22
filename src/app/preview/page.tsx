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
  title: "فهرست دموهای منوی دیجیتال | MenuPeak",
  description: "پنج دمو برای بررسی چیدمان منوی مشتری؛ شامل نمونه‌های SoftMenu، Captain M، هفت‌خان و کافه نارون.",
  alternates: { canonical: `${getSiteUrl()}/preview` },
};

export default async function PreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const menu = typeof params.menu === "string" ? params.menu : undefined;
  return <div className="marketing-site min-h-dvh bg-base-200/50"><PlatformEventBeacon name="demo_preview_view"/><SiteHeader/><main className="market-container py-10 sm:py-14">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl"><span className="badge badge-primary badge-outline">۵ منوی قابل انتخاب</span><h1 className="mt-4 text-3xl font-black sm:text-5xl">دموهای منوی مشتری.<br/><span className="text-primary">پیش از خرید، خودتان ببینید.</span></h1><p className="mt-4 leading-8 text-base-content/65">نمونه‌های SoftMenu، کاپیتان ام و هفت‌خان را جداگانه باز کنید و دسته‌ها، محصولات، تنوع قیمت و سبد محلی را بررسی کنید. داده‌ها نمایشی‌اند و سفارشی ثبت نمی‌شود.</p></div>
      <Link href="/demo" className="btn btn-primary">درخواست نمایش همراه کارشناس <ArrowUpLeft size={17}/></Link>
    </div>
    <div className="alert mb-6 border-primary/20 bg-primary/5"><LockKeyhole size={19}/><span>فقط دادهٔ نمونه · بدون ورود · سبد موقت محلی · بدون ثبت سفارش/اطلاعات مشتری، پرداخت یا پیامک</span></div>
    <DemoPreview initialMenuId={menu}/>
    <section className="mt-12 grid items-center gap-6 rounded-3xl bg-base-100 p-6 shadow-sm ring-1 ring-base-300 sm:p-8 lg:grid-cols-[0.85fr_1.15fr]">
      <div><h2 className="text-2xl font-black">نمایی از پنل مدیریت</h2><p className="mt-3 leading-7 text-base-content/65">این تصویر نیز داده‌ی نمونه است و به حساب یا کسب‌وکار واقعی وصل نیست.</p><Link href="/plans" className="btn btn-outline mt-5">مقایسه تعرفه‌ها <ArrowUpLeft size={16}/></Link></div>
      <div className="overflow-hidden rounded-2xl"><DashboardPreview/></div>
    </section>
  </main><SiteFooter/></div>;
}
