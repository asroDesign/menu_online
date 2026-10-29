import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpLeft, Banknote, Check, CircleCheck, Cloud, Database, History, MonitorDown, Printer, RefreshCw, ShieldCheck, ShoppingBag, WifiOff } from "lucide-react";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getSiteUrl } from "@/lib/site-url";

const steps = [
  { number: "۰۱", icon: MonitorDown, title: "دریافت اولیه روی ویندوز", text: "صندوق را نصب کنید و وقتی اینترنت در دسترس است، منوی کسب‌وکار را به دستگاه متصل و دریافت کنید." },
  { number: "۰۲", icon: ShoppingBag, title: "ثبت سفارش در صندوق", text: "سفارش حضوری را با منو، میز یا نوع سفارش در همان صندوق بسازید؛ قطع اینترنت مانع ثبت روی دستگاه نمی‌شود." },
  { number: "۰۳", icon: Printer, title: "چاپ از تجهیزات محلی", text: "فیش مشتری و مسیرهای چاپ آماده‌سازی را در تنظیمات دستگاه تعیین کنید تا کار صندوق و آشپزخانه ادامه یابد." },
  { number: "۰۴", icon: RefreshCw, title: "همگام‌سازی بعد از اتصال", text: "با برگشت اینترنت، سفارش‌های صف‌شده به سامانه می‌رسند و در پنل مرکزی قابل پیگیری می‌شوند." },
];

const features = [
  { icon: Database, title: "ثبت محلی سفارش", text: "فروش آفلاین روی همان رایانه ذخیره می‌شود و برای ادامهٔ کار منتظر پاسخ سرور نمی‌ماند." },
  { icon: History, title: "تاریخچه و جزئیات در قطعی", text: "سفارش‌های ثبت‌شده روی دستگاه را همراه جزئیاتشان بازبینی کنید؛ حتی وقتی اتصال موقتاً قطع است." },
  { icon: Printer, title: "چاپ روی پرینترهای متصل", text: "صفحهٔ صندوق می‌تواند از چاپگرهای تنظیم‌شدهٔ همان رایانه برای فیش استفاده کند." },
  { icon: Banknote, title: "ثبت روش تسویه", text: "دریافت نقدی یا ثبت رسید کارتخوان با شمارهٔ پیگیری را در فاکتور ثبت کنید." },
  { icon: Cloud, title: "ارسال خودکار پس از اتصال", text: "فروش‌های محلی در بازگشت اینترنت به سرور فرستاده می‌شوند تا گزارش مرکزی به‌روز شود." },
  { icon: ShieldCheck, title: "اتصال دستگاه کنترل‌شده", text: "برای هر صندوق یک دستگاه متصل بسازید و فایل اتصال آن را فقط روی همان رایانه نگه دارید." },
];

export const metadata: Metadata = {
  title: "صندوق آفلاین ویندوز برای کافه و رستوران | MenuPeak Desktop",
  description: "معرفی صندوق ویندوز MenuPeak برای ادامهٔ ثبت سفارش، دسترسی به تاریخچهٔ محلی، چاپ فیش و همگام‌سازی فروش پس از اتصال دوبارهٔ اینترنت.",
  alternates: { canonical: `${getSiteUrl()}/pos-system` },
  openGraph: {
    title: "MenuPeak Desktop؛ صندوق رستوران در قطعی اینترنت",
    description: "سفارش را روی ویندوز ثبت کنید، جزئیات محلی را ببینید و بعد از اتصال اینترنت با سامانه همگام کنید.",
    url: `${getSiteUrl()}/pos-system`,
    type: "website",
  },
};

export default function OfflinePosMarketingPage() {
  return <div className="marketing-site min-h-dvh bg-base-100"><SiteHeader/><main dir="rtl">
    <section className="relative isolate overflow-hidden bg-slate-950 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_12%_20%,rgba(59,130,246,.28),transparent_38%),radial-gradient(ellipse_at_85%_85%,rgba(16,185,129,.15),transparent_32%)]"/>
      <div className="market-container grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:py-20">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold"><span className="badge border-sky-300/30 bg-sky-300/10 text-sky-100"><MonitorDown size={14}/> MenuPeak Desktop · صندوق ویندوز</span><span className="badge border-white/15 bg-white/5 text-white/70"><WifiOff size={13}/> ادامهٔ کار در قطعی اینترنت</span></div>
          <h1 className="max-w-3xl text-3xl font-black leading-[1.65] sm:text-4xl lg:text-5xl">وقتی اینترنت می‌رود،<br/><span className="text-sky-300">صندوق از کار نمی‌افتد.</span></h1>
          <p className="mt-5 max-w-2xl text-sm leading-8 text-slate-300 sm:text-base">MenuPeak Desktop سفارش را روی رایانهٔ صندوق ذخیره می‌کند؛ فهرست سفارش‌های همان دستگاه و جزئیاتشان در دسترس می‌ماند، چاپ محلی ادامه پیدا می‌کند و فروش‌های آفلاین پس از برگشت اتصال برای همگام‌سازی فرستاده می‌شوند.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Link href="/register?trial=demo" className="btn border-0 bg-sky-500 text-white hover:bg-sky-400">شروع رایگان و ساخت منو <ArrowUpLeft size={17}/></Link><Link href="/dashboard/settings/offline-pos" className="btn btn-outline border-white/25 text-white hover:border-white/50 hover:bg-white/10">راهنمای نصب و اتصال <ArrowUpLeft size={16}/></Link></div>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300"><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-300"/>تاریخچهٔ سفارش در حالت آفلاین</span><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-300"/>چاپ از رایانهٔ صندوق</span><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-300"/>همگام‌سازی پس از اتصال</span></div>
        </div>
        <div className="mx-auto w-full max-w-lg rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-2xl shadow-sky-950/40 backdrop-blur">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4"><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-sky-400/15 text-sky-300"><MonitorDown size={18}/></span><span><b className="block text-xs">صندوق کافه نارون</b><small className="mt-1 block text-[10px] text-slate-400">دستگاه محلی · فروش ادامه دارد</small></span></div><span className="badge border-amber-300/20 bg-amber-300/10 text-amber-200"><WifiOff size={12}/> اینترنت قطع</span></div>
            <div className="mt-4 rounded-2xl bg-white p-4 text-slate-800">
              <div className="flex items-center justify-between text-[10px] text-slate-500"><span>فاکتور جدید · نمونه</span><span>میز ۴</span></div>
              <div className="mt-3 space-y-2 text-xs"><div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>لاته × ۲</span><b>۲۴۰٬۰۰۰</b></div><div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>کیک شکلاتی × ۱</span><b>۱۲۰٬۰۰۰</b></div></div>
              <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 pt-3"><span className="text-[10px] text-slate-500">جمع فاکتور</span><b className="text-sm">۳۶۰٬۰۰۰ تومان</b></div>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-emerald-100"><span className="grid size-9 place-items-center rounded-xl bg-emerald-300/15"><CircleCheck size={18}/></span><span className="min-w-0 flex-1"><b className="block text-xs">سفارش روی همین دستگاه ثبت شد</b><small className="mt-1 block text-[10px] text-emerald-100/65">در تاریخچه می‌ماند تا اتصال دوباره برقرار شود.</small></span><Printer size={17}/></div>
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-sky-300/20 bg-sky-300/10 py-2.5 text-[10px] font-bold text-sky-100"><Cloud size={15}/> با برگشت اینترنت، همگام‌سازی آغاز می‌شود <ArrowLeft size={13}/></div>
          </div>
          <p className="px-2 pb-1 pt-3 text-center text-[10px] leading-5 text-slate-400">تصویرسازی نمونه؛ صندوق و گزارش مرکزی در حالت آنلاین از طریق همگام‌سازی متصل می‌مانند.</p>
        </div>
      </div>
    </section>

    <section className="market-container py-12 sm:py-16">
      <div className="mx-auto max-w-3xl text-center"><span className="badge badge-primary badge-outline">مسیر یک سفارش آفلاین</span><h2 className="mt-4 text-2xl font-black sm:text-3xl">ثبت، چاپ و همگام‌سازی؛<br className="hidden sm:block"/> قدم‌به‌قدم و قابل پیگیری.</h2><p className="mt-3 text-sm leading-7 text-base-content/60">برای روزی که اینترنت ناپایدار است، مسیر فروش را روی رایانهٔ صندوق ادامه دهید.</p></div>
      <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{steps.map(({number,icon:Icon,title,text})=><li key={number} className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm"><span className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon size={21}/></span><b className="text-xs text-base-content/35">{number}</b></span><h3 className="mt-4 font-extrabold">{title}</h3><p className="mt-2 text-xs leading-6 text-base-content/60">{text}</p></li>)}</ol>
    </section>

    <section className="bg-base-200/60 py-12 sm:py-16"><div className="market-container"><div className="max-w-2xl"><span className="text-xs font-bold text-primary">امکانات صندوق ویندوز</span><h2 className="mt-2 text-2xl font-black sm:text-3xl">اطلاعات فروش، حتی بدون اینترنت دم دست است.</h2><p className="mt-3 text-sm leading-7 text-base-content/60">کارهای روزانه روی دستگاه انجام می‌شوند؛ بعد از اتصال دوباره، داده‌ها به پنل سامانه می‌رسند.</p></div><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{features.map(({icon:Icon,title,text})=><article key={title} className="rounded-2xl border border-base-300 bg-base-100 p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={19}/></span><h3 className="mt-3 text-sm font-extrabold">{title}</h3><p className="mt-2 text-xs leading-6 text-base-content/60">{text}</p></article>)}</div></div></section>

    <section className="market-container grid gap-8 py-12 sm:py-16 lg:grid-cols-[1fr_.9fr] lg:items-center">
      <div><span className="badge border-warning/30 bg-warning/10 text-warning-content">پیش‌نیازهای شفاف</span><h2 className="mt-4 text-2xl font-black">یک بار آنلاین آماده کنید؛<br/>بعد در قطعی هم بفروشید.</h2><p className="mt-3 text-sm leading-7 text-base-content/65">برای اولین اتصال، دریافت منو و جفت‌کردن صندوق به اینترنت نیاز دارید. منوی محلی روی دستگاه ذخیره می‌شود؛ هر دستگاه فروش آفلاین خودش را نگه می‌دارد و با اتصال دوباره همگام می‌کند.</p><div className="mt-4 rounded-2xl border border-warning/25 bg-warning/5 p-4"><b className="text-sm">ثبت رسید کارتخوان، پرداخت بانکی خودکار نیست.</b><p className="mt-2 text-xs leading-6 text-base-content/65">در حالت آفلاین می‌توانید دریافت نقدی را ثبت کنید یا رسید کارتخوان و شمارهٔ پیگیری را وارد کنید. ارسال مبلغ به دستگاه کارتخوان و دریافت نتیجهٔ بانکی به اتصال و SDK سازگار شرکت پرداخت نیاز دارد.</p></div></div>
      <div className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-7"><h3 className="font-extrabold">برای شروع چه کنید؟</h3><ul className="mt-4 space-y-3 text-sm">{["حساب MenuPeak و فروشگاه خود را بسازید.","نسخهٔ ویندوز را از بخش راه‌اندازی صندوق دریافت و روی رایانهٔ صندوق نصب کنید.","در زمان اتصال، منو را دریافت و چاپگرهای محلی را تنظیم کنید.","سفارش نمونه را ثبت کنید و مسیر تاریخچه، چاپ و همگام‌سازی را بررسی کنید."].map((item,index)=><li key={item} className="flex items-start gap-3"><span className="grid size-6 flex-none place-items-center rounded-full bg-primary/10 text-[10px] font-black text-primary">{index+1}</span><span className="text-xs leading-6 text-base-content/70">{item}</span></li>)}</ul><Link href="/dashboard/settings/offline-pos" className="btn btn-primary mt-6 w-full">رفتن به راهنمای نصب و اتصال <ArrowUpLeft size={16}/></Link></div>
    </section>

    <section className="market-container pb-14 sm:pb-20"><div className="rounded-3xl bg-primary px-5 py-8 text-primary-content sm:px-9 sm:py-10"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><span className="text-xs font-bold opacity-75">MenuPeak Desktop</span><h2 className="mt-2 text-2xl font-black">صندوق را با منوی آنلاین خودتان همراه کنید.</h2><p className="mt-2 max-w-2xl text-sm leading-7 opacity-80">فروشگاه را آماده کنید، منو را دریافت کنید و بعد از چند مرحله صندوق ویندوز را به همان کسب‌وکار متصل کنید.</p></div><div className="flex flex-wrap gap-2"><Link href="/register?trial=demo" className="btn border-0 bg-white text-primary hover:bg-white/90">شروع رایگان <ArrowUpLeft size={16}/></Link><Link href="/plans#comparison" className="btn btn-outline border-white/40 text-white hover:bg-white/10">دیدن پلن‌ها <ArrowUpLeft size={16}/></Link></div></div></div></section>
    </main><SiteFooter/></div>;
}
