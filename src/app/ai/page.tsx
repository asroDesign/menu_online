import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpLeft, Check, Clock3, Sparkles, WandSparkles } from "lucide-react";
import { AiMenuHeroVisual, AiPageInteractions } from "@/components/marketing/ai-page-interactions";
import styles from "@/components/marketing/ai-page.module.css";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getPlatformBranding, getSetting } from "@/lib/app-settings";
import { getSiteUrl } from "@/lib/site-url";
import { trialDurationDays } from "@/lib/trial-policy";
import { formatNumber } from "@/lib/format";
import "@/components/marketing/marketing.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPlatformBranding();
  const title = `ساخت منوی هوشمند و ابزارهای AI رستوران | ${branding.siteName}`;
  const description = "منوی دیجیتال کافه و رستوران را از فهرست یا عکس بسازید، توضیح و تصویر غذا آماده کنید و با تحلیل فروش، پیشنهاد مکمل و سفارش QR در یک مسیر کار کنید.";
  const canonical = `${getSiteUrl()}/ai`;
  return {
    metadataBase: new URL(getSiteUrl()),
    title,
    description,
    alternates: { canonical },
    openGraph: { type: "website", locale: "fa_IR", siteName: branding.siteName, title, description, url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function AiMarketingPage() {
  const [branding, trial] = await Promise.all([
    getPlatformBranding(),
    getSetting("trialPolicy", { durationDays: 14 }),
  ]);
  const days = formatNumber(trialDurationDays(trial.durationDays));
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `دستیار هوشمند منوی دیجیتال ${branding.siteName}`,
    description: "ابزارهای ساخت منوی دیجیتال، آماده‌سازی توضیحات و تصاویر محصول، پیشنهاد مکمل و تحلیل فروش برای کافه و رستوران.",
    url: `${getSiteUrl()}/ai`,
    inLanguage: "fa-IR",
  };

  return <div className={`marketing-site ${styles.site}`}>
    <SiteHeader />
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><Sparkles size={15}/>دستیار هوشمند منوی دیجیتال</span>
            <h1>منوی رستوران را <em>هوشمندتر</em> بسازید و بهتر بفروشید</h1>
            <p>از فهرست غذا یا عکس منوی چاپی شروع کنید. توضیحات و تصاویر را آماده کنید، نتیجه را خودتان بازبینی کنید و بعد منوی QR، سفارش‌ها و تحلیل فروش را کنار هم داشته باشید.</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryCta} href="/register?trial=demo">شروع رایگان {days} روزه <ArrowUpLeft size={17}/></Link>
              <Link className={styles.secondaryCta} href="#builders">دیدن روش‌های ساخت منو <ArrowUpLeft size={16}/></Link>
            </div>
            <div className={styles.heroNotes}>
              <span><Check size={13}/>مناسب کافه، رستوران و فست‌فود</span>
              <span><Check size={13}/>پیش‌نویس پیش از انتشار</span>
              <span><Clock3 size={13}/>بدون نصب اپ برای مشتری</span>
            </div>
          </div>
          <AiMenuHeroVisual />
        </div>
      </section>

      <AiPageInteractions />

      <section className={styles.closing}>
        <div className={styles.container}>
          <span className={styles.kicker}><WandSparkles size={13}/>از منو شروع کنید؛ رشد را اندازه بگیرید</span>
          <h2>ابزارهای روزمرهٔ رستوران، یک‌جا و متصل</h2>
          <p>منو، پیشنهاد مکمل، سفارش آنلاین، موجودی و بینش فروش را در یک تجربهٔ یکپارچه مدیریت کنید. امکانات دقیق هر کسب‌وکار بر اساس پلن و دسترسی پنل فعال می‌شود.</p>
          <Link className={styles.primaryCta} href="/register?trial=demo">ساخت حساب و شروع کار <ArrowUpLeft size={17}/></Link>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
