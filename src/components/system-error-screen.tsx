"use client";

import Link from "next/link";
import { BrandLogo, usePlatformBranding } from "@/components/brand";
import { Icon } from "@/components/ui";
import { brandThemeStyle } from "@/lib/brand-color";

type ErrorVariant = "not-found" | "server";

const CONTENT: Record<ErrorVariant, {
  code: string;
  status: string;
  context: string;
  title: string;
  description: string;
  icon: string;
  primary: string;
  primaryHref: string;
  secondary: string;
  secondaryHref: string;
  quickLinks: { label: string; description: string; href: string; icon: string }[];
}> = {
  "not-found": {
    code: "۴۰۴",
    status: "مسیر پیدا نشد",
    context: "این آدرس به صفحهٔ فعالی وصل نیست",
    title: "این صفحه پیدا نشد",
    description: "ممکن است آدرس صفحه تغییر کرده باشد یا پیوندی که باز کرده‌اید دیگر فعال نباشد. از مسیرهای اصلی ادامه دهید.",
    icon: "search",
    primary: "رفتن به صفحهٔ اصلی",
    primaryHref: "/",
    secondary: "ورود به پنل",
    secondaryHref: "/login",
    quickLinks: [
      { label: "صفحهٔ اصلی", description: "معرفی امکانات MenuPeak", href: "/", icon: "home" },
      { label: "تعرفه‌ها", description: "مقایسهٔ پلن‌ها", href: "/plans", icon: "layers" },
      { label: "درخواست‌ها", description: "مشاوره و پشتیبانی", href: "/contact", icon: "message" },
      { label: "ورود", description: "ورود به پنل مدیریت", href: "/login", icon: "lock" },
    ],
  },
  server: {
    code: "۵۰۰",
    status: "خطای موقت سامانه",
    context: "درخواست فعلی کامل نشد",
    title: "بارگذاری این صفحه کامل نشد",
    description: "ممکن است ارتباط با سرور موقتاً ناپایدار شده باشد. دوباره تلاش کنید یا از یکی از مسیرهای اصلی پنل ادامه دهید.",
    icon: "warning",
    primary: "تلاش دوباره",
    primaryHref: "/dashboard",
    secondary: "بازگشت به پنل",
    secondaryHref: "/dashboard",
    quickLinks: [
      { label: "سفارش‌ها", description: "صف سفارش‌های امروز", href: "/dashboard/orders", icon: "orders" },
      { label: "رزروها", description: "میزها و زمان‌بندی", href: "/dashboard/reservations", icon: "calendar" },
      { label: "درخواست‌ها", description: "پیام‌های سالن", href: "/dashboard/customer-feedback", icon: "message" },
      { label: "مالی", description: "درآمد و تسویه", href: "/dashboard/accounting", icon: "wallet" },
    ],
  },
};

export function SystemErrorScreen({ variant, onRetry, errorDigest }: { variant: ErrorVariant; onRetry?: () => void; errorDigest?: string }) {
  const branding = usePlatformBranding();
  const content = CONTENT[variant];
  const siteName = branding.siteName || "MenuPeak";

  return (
    <main dir="rtl" className="min-h-dvh bg-brand-50 text-base-content" style={{ ...brandThemeStyle(branding.brandColor), backgroundImage: "linear-gradient(color-mix(in srgb, var(--color-primary) 5%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 5%, transparent) 1px, transparent 1px)", backgroundSize: "48px 48px" }}>
      <div dir="ltr" className="mx-auto grid min-h-dvh w-full max-w-[1700px] place-items-center p-2.5 sm:p-5">
        <div className="grid w-full grid-cols-1 gap-3 rounded-[30px] border border-brand-100 bg-white p-3 shadow-xl sm:gap-5 sm:rounded-[38px] sm:p-5 lg:min-h-[calc(100dvh-64px)] lg:grid-cols-[minmax(340px,0.82fr)_minmax(0,1.18fr)]">
          <aside dir="rtl" className="relative flex min-h-[370px] flex-col overflow-hidden rounded-[26px] bg-gradient-to-br from-brand-800 via-primary to-brand-700 p-4 text-primary-content sm:min-h-[430px] sm:rounded-[30px] sm:p-6 lg:min-h-0 lg:p-7 xl:p-8">
            <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-40 size-[27rem] rounded-full bg-brand-400/25 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -right-28 size-[28rem] rounded-full bg-brand-200/10 blur-3xl" />

            <div className="relative z-10 flex items-start justify-between gap-3">
              <Link href="/" className="flex min-w-0 items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[17px] border border-white/20 bg-white/10 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.12)]">
                  <BrandLogo url={branding.logoUrl} alt="" className="size-full object-contain" fallback={<Icon name="utensils" className="size-6 text-primary-content" />} />
                </span>
                <span className="min-w-0 text-right">
                  <span className="block truncate text-sm font-black text-primary-content">{siteName} Panel</span>
                  <span className="mt-1 block text-xs font-bold text-white/65">پنل مدیریت مجموعه</span>
                </span>
              </Link>
              <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-extrabold text-white/90 backdrop-blur">
                <Icon name={content.icon} className="size-4 text-primary-content" />{content.status}
              </span>
            </div>

            <div className="relative z-10 mt-7 rounded-[24px] border border-white/15 bg-white/[0.08] p-3.5 shadow-[0_20px_50px_rgba(0,0,0,.08)] backdrop-blur sm:mt-10 sm:p-5">
              <p className="px-1 text-xs font-bold leading-6 text-white/65">{content.context}</p>
              <div className="mt-3 grid min-h-[130px] place-items-center rounded-[22px] border border-primary-content/25 bg-white/[0.08] sm:min-h-[160px]">
                <span className="text-[clamp(3.8rem,12vw,6rem)] font-black leading-none tracking-tight text-primary-content">خطا</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-2.5">
                {[
                  { label: "سفارش", icon: "cart", tone: "border-brand-200 bg-white text-brand-900" },
                  { label: "آشپزخانه", icon: "utensils", tone: "border-brand-200 bg-brand-50 text-brand-900" },
                  { label: "صندوق", icon: "file", tone: "border-brand-200 bg-brand-50 text-brand-900" },
                ].map((item) => (
                  <div key={item.label} className={`grid min-h-[78px] place-items-center rounded-[17px] border px-1.5 py-2.5 sm:min-h-[94px] sm:rounded-[19px] ${item.tone}`}>
                    <Icon name={item.icon} className="size-5 sm:size-6" />
                    <span className="mt-1 text-[10px] font-black sm:text-xs">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 mt-4 flex items-center gap-3 rounded-full border border-white/10 bg-black/10 px-4 py-3 text-center text-[11px] font-bold text-white/70 sm:mt-5 sm:text-xs">
              <span className="h-px flex-1 bg-white/20" />مسیر درست عملیات در پنل شروع می‌شود<span className="h-px flex-1 bg-white/20" />
            </div>
          </aside>

          <section dir="rtl" className="flex min-w-0 flex-col justify-between rounded-[24px] bg-white px-2 py-3 sm:rounded-[28px] sm:px-5 sm:py-5 lg:px-7 lg:py-7 xl:px-9 xl:py-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-2 text-xs font-extrabold text-brand-800">
                  <Icon name="coffee" className="size-4" />مسیر پنل {siteName}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-2 text-xs font-extrabold text-brand-800">
                  <Icon name={content.icon} className="size-4" />{content.status}
                </span>
              </div>

              <p className="mt-8 text-sm font-black text-primary sm:mt-10">برای ادامهٔ عملیات روزانه</p>
              <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.8rem)] font-black leading-[1.55] tracking-tight text-base-content">{content.title}</h1>
              <p className="mt-3 max-w-[780px] text-sm font-semibold leading-8 text-base-content/60 sm:text-base sm:leading-9">{content.description}</p>
              {errorDigest && <p className="mt-2 break-all text-xs font-medium text-base-content/55">شناسهٔ خطا: <code>{errorDigest}</code></p>}

              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
                {onRetry ? (
                  <button type="button" onClick={onRetry} className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-[14px] bg-primary px-5 text-sm font-extrabold text-primary-content shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                    <Icon name="refresh" className="size-4" />{content.primary}
                  </button>
                ) : (
                  <Link href={content.primaryHref} className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-[14px] bg-primary px-5 text-sm font-extrabold text-primary-content shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                    <Icon name="home" className="size-4" />{content.primary}
                  </Link>
                )}
                <Link href={content.secondaryHref} className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-[14px] border border-brand-200 bg-white px-5 text-sm font-extrabold text-brand-800 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  <Icon name={onRetry ? "home" : "lock"} className="size-4" />{content.secondary}
                </Link>
              </div>
            </div>

            <section aria-label="دسترسی سریع" className="mt-7 rounded-[25px] border border-brand-100 bg-brand-50 p-3.5 sm:mt-8 sm:p-4 lg:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-black text-base-content">دسترسی سریع</h2>
                <p className="text-[11px] font-bold text-base-content/55 sm:text-xs">مسیرهای اصلی پنل</p>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                {content.quickLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="group flex min-h-[76px] min-w-0 items-center gap-3 rounded-[19px] border border-brand-100 bg-white px-3.5 py-3 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:min-h-[88px] sm:px-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-[16px] bg-brand-50 text-brand-700 transition group-hover:bg-brand-100">
                      <Icon name={item.icon} className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-brand-900">{item.label}</span>
                      <span className="mt-1 block truncate text-xs font-bold text-base-content/55">{item.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </section>
        </div>
      </div>
    </main>
  );
}
