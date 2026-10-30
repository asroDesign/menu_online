import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownLeft, ArrowUpLeft, BadgeCheck, Banknote, BookOpenCheck, Boxes,
  Calculator, ChartNoAxesCombined, Check, ChevronLeft, CircleHelp, FileCheck2,
  FileSpreadsheet, Landmark, LockKeyhole, PackageCheck, ReceiptText, ShieldCheck,
  ShoppingBag, Sparkles, Store, WalletCards,
} from "lucide-react";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { AccountingConnections } from "@/components/marketing/accounting-software-interactions";
import { BusinessStory, ComparisonStory, FeatureExplorer, OfflineStory, ProfitStory, SaleStory, SecurityStory } from "@/components/marketing/accounting-story";
import { getPlatformBranding } from "@/lib/app-settings";
import { getSiteUrl } from "@/lib/site-url";
import "@/components/marketing/marketing.css";
import styles from "./accounting-software.module.css";
import story from "./accounting-story.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = await getPlatformBranding();
  const title = `حسابداری رستوران و کافه؛ متصل به فروش و انبار | ${siteName}`;
  const description = "اسناد دوطرفهٔ فروش، صندوق، موجودی و تسویه را در یک دفتر مالی ببینید؛ همراه با دفتر کل، تراز آزمایشی، صورت‌های مالی، چک، مطالبات و حقوق.";
  const canonical = `${getSiteUrl()}/accounting-software`;
  return {
    metadataBase: new URL(getSiteUrl()), title, description,
    alternates: { canonical },
    openGraph: { type: "website", locale: "fa_IR", siteName, title, description, url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

const groups = [
  { title: "فروش و سود", icon: ChartNoAxesCombined, items: [
    ["شاخص‌های مالی", "درآمد، سود، وجه نقد و روند فروش در گزارش‌های پنل.", "/dashboard/profit-loss", "سود و زیان"],
    ["اسناد فروش", "ردیابی سندهای خودکار، دریافت‌ها، تخفیف‌ها و برگشت سفارش.", "/dashboard/accounting", "دفتر اسناد"],
    ["کنترل شیفت صندوق", "مقایسهٔ نقد مورد انتظار و مبلغ شمارش‌شده در پایان شیفت.", "/dashboard/reports", "گزارش شیفت"],
  ] },
  { title: "دفاتر و گزارش‌ها", icon: BookOpenCheck, items: [
    ["دفتر روزنامه و کل", "گردش حساب‌ها با ماندهٔ تجمعی و فیلتر تاریخ شمسی.", "/dashboard/accounting", "دفاتر حسابداری"],
    ["تراز آزمایشی", "تراز دو و چهارستونی در سطح کل، معین و تفصیلی.", "/dashboard/accounting", "تراز آزمایشی"],
    ["صورت‌های مالی", "صورت سود و زیان، ترازنامه و کنترل تعادل حساب‌ها.", "/dashboard/accounting", "صورت‌های مالی"],
  ] },
  { title: "خزانه، چک و طرف‌حساب", icon: Landmark, items: [
    ["بانک و صندوق", "ماندهٔ حساب‌ها، گردش‌های ورودی و خروجی و تاریخچهٔ تسویه.", "/dashboard/bank", "بانک و صندوق"],
    ["دفتر چک", "ثبت چک دریافتی و پرداختی، ذی‌نفع، سررسید و سندهای مرتبط.", "/dashboard/cheques", "مدیریت چک‌ها"],
    ["مطالبات و دریافتنی‌ها", "ماندهٔ مشتریان و ثبت دریافت یا برگشت وجه.", "/dashboard/receivables", "دفتر مطالبات"],
  ] },
  { title: "انبار و هزینه", icon: Boxes, items: [
    ["موجودی و گردش کالا", "رسید خرید چندقلمی، خروج، ضایعات، شمارش و گردش موجودی.", "/dashboard/inventory", "مدیریت انبار"],
    ["بهای تمام‌شده", "اتصال دستور تهیه به موجودی و مشاهدهٔ هزینهٔ مواد محصول.", "/dashboard/pricing", "تحلیل بهای غذا"],
    ["درآمد و هزینه", "ثبت درآمد و هزینه با حساب متناظر و ردیف حسابداری.", "/dashboard/income-expense", "درآمد و هزینه"],
  ] },
  { title: "پرسنل و کنترل مالی", icon: FileCheck2, items: [
    ["حقوق و دستمزد", "کارکرد ماهانه، فیش، خروجی بیمه و مالیات حقوق و سند تعهد.", "/dashboard/payroll", "حقوق و دستمزد"],
    ["دارایی و استهلاک", "ثبت دارایی و محاسبهٔ استهلاک خط مستقیم در دورهٔ مالی.", "/dashboard/assets", "دارایی‌ها"],
    ["سطح دسترسی و دورهٔ مالی", "کنترل نقش‌ها، پیش‌نویس، سند قطعی و بستن سال مالی.", "/dashboard/accounting", "تنظیم دفتر"],
  ] },
];

const faqs = [
  ["آیا فروش و موجودی مستقیماً وارد حسابداری می‌شوند؟", "ثبت فروش و گردش‌های انبار در مسیرهای پشتیبانی‌شده سند مرتبط می‌سازند؛ دفتر کل و گزارش‌ها از همان اسناد خوانده می‌شوند."],
  ["آیا سند قطعی قابل ویرایش است؟", "خیر. سند قطعی با سند برگشتی اصلاح می‌شود تا سابقهٔ مالی و رد تغییر باقی بماند. پیش‌نویس تا قبل از قطعی‌شدن قابل ویرایش است."],
  ["آیا نرم‌افزار به بانک یا سامانهٔ مؤدیان وصل می‌شود؟", "در نسخهٔ فعلی، حساب بانکی و کارتخوان برای ثبت و گزارش داخلی استفاده می‌شوند؛ مغایرت‌گیری خودکار صورتحساب بانکی یا ارسال مستقیم به سامانهٔ مؤدیان در این نسخه فعال نیست."],
  ["در قطعی اینترنت حسابداری چه می‌شود؟", "اپ Windows صندوق می‌تواند داده‌های دریافت‌شده را محلی نگه دارد و ثبت سند آفلاین محدود را پس از اتصال همگام کند. گزارش‌ها و عملیات مالی کامل آفلاین نیستند."],
];

export default async function AccountingSoftwarePage() {
  const { siteName } = await getPlatformBranding();
  const schema = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: `${siteName} · حسابداری رستوران`, applicationCategory: "BusinessApplication", operatingSystem: "Web", description: "حسابداری دوطرفه و مدیریت مالی متصل به سفارش، صندوق، انبار، چک، مطالبات و حقوق.", url: `${getSiteUrl()}/accounting-software`, inLanguage: "fa-IR" };
  return <div className={`marketing-site ${styles.site}`}>
    <SiteHeader />
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <div className={styles.breadcrumb}><Link href="/">خانه</Link><ChevronLeft size={14}/><span>حسابداری رستوران</span></div>
            <div className={styles.eyebrow}><span className={styles.liveDot}/> حسابداری متصل به عملیات روزانه</div>
            <h1>حساب‌هایتان<br/><em>خودشان ثبت می‌شوند.</em></h1>
            <p>هر فروش صندوق و سفارش آنلاین، هر تخفیف و هر کالایی که از انبار خارج می‌شود، در مسیرهای مالی پشتیبانی‌شده سند می‌سازد. شما و حسابدارتان به‌جای تایپ دوباره، نتیجه را در دفتر و گزارش‌ها بررسی می‌کنید.</p>
            <div className={styles.heroActions}><Link href="/register?trial=demo" className={styles.primaryCta}>شروع رایگان <ArrowUpLeft size={17}/></Link><Link href="/plans#comparison" className={styles.secondaryCta}>بررسی پلن‌ها <ArrowUpLeft size={16}/></Link></div>
            <div className={styles.heroNotes}><span><Check size={14}/> اسناد دوطرفه و متوازن</span><span><Check size={14}/> تاریخ و گزارش شمسی</span><span><Check size={14}/> دسترسی بر اساس نقش</span></div>
            <p className={styles.scopeNote}>دامنهٔ امکانات به پلن و سطح دسترسی کسب‌وکار وابسته است؛ برای محدودیت‌های نسخهٔ فعلی بخش پرسش‌های متداول را ببینید.</p>
          </div>
          <div className={styles.heroVisual} aria-label="نمای اتصال عملیات کافه به دفتر حسابداری">
            <div className={styles.visualTop}><span><span className={styles.liveDot}/> دفتر مالی MenuPeak</span><span className={styles.lock}><LockKeyhole size={13}/> فضای کسب‌وکار شما</span></div>
            <div className={styles.flowDiagram}>
              <div className={styles.flowInputs}><div><ShoppingBag/><span><b>صندوق و سفارش</b><small>فروش، تخفیف، دریافت</small></span></div><div><PackageCheck/><span><b>انبار و دستور تهیه</b><small>رسید، مصرف، ضایعات</small></span></div><div><WalletCards/><span><b>بانک، چک و مشتری</b><small>تسویه و مطالبات</small></span></div></div>
              <div className={styles.flowConnect}><i/><i/><i/><span>ثبت رویداد</span></div>
              <div className={styles.ledgerCard}><div className={styles.ledgerHead}><span><ReceiptText size={14}/> سند فروش روز</span><b><BadgeCheck size={13}/> متوازن</b></div><div className={styles.ledgerRow}><span>بانک / صندوق</span><b>۵۸۵٬۰۰۰</b><small>بدهکار</small></div><div className={styles.ledgerRow}><span>تخفیف فروش</span><b>۶۵٬۰۰۰</b><small>بدهکار</small></div><div className={styles.ledgerRow}><span>فروش غذا و نوشیدنی</span><b>۶۵۰٬۰۰۰</b><small>بستانکار</small></div><div className={styles.ledgerRule}/><div className={styles.ledgerTotals}><span>جمع سند</span><b>۶۵۰٬۰۰۰ <small>تومان</small></b></div><div className={styles.ledgerFoot}><Check size={13}/> ثبت یکتا · جزئیات در دفتر روزنامه</div></div>
            </div>
            <div className={styles.visualBottom}><span><span className={styles.pulseDot}/> گردش حساب به‌روز</span><span><Calculator size={13}/> دفتر دوبل</span></div>
          </div>
        </div>
      </section>

      <section className={`${story.scene} ${story.section}`} id="why-profit"><div className={story.shell}><ProfitStory/></div></section>

      <section className={`${story.scene} ${story.section} ${story.wash}`} id="business"><div className={story.shell}><div className={story.intro}><span className={story.kicker}>برای مسئلهٔ روزانهٔ هر صنف</span><h2>حسابداری مخصوص صنف شما</h2><p>منو، خرید و خرج‌های هر کسب‌وکار شکل خودش را دارد. مسیرهای مالی را با نیاز همان کار روزمره ببینید.</p></div><BusinessStory/></div></section>



      <section id="workflow" className={styles.workflow}><div className={styles.container}>
        <div className={styles.sectionIntro}><span className={styles.kicker}>از یک فروش تا دفتر متوازن</span><h2>یک سفارش؛ چند اثر قابل‌ردیابی</h2><p>نمونهٔ زیر یک تصویر آموزشی از نحوهٔ ثبت است. ارقام و نام‌ها نمایشی‌اند و نتیجهٔ واقعی هر سفارش به اقلام، پرداخت، تخفیف، مالیات و دستور تهیه بستگی دارد.</p></div>
        <SaleStory />
      </div></section>

      <section id="connections" className={`${styles.container} ${styles.connections}`}><div className={styles.sectionIntro}><span className={styles.kicker}>اطلاعات یک‌بار ثبت می‌شود</span><h2>بخش‌های عملیاتی به دفتر مالی وصل‌اند</h2><p>این پیوندها به مسیرهای واقعی پنل MenuPeak می‌رسند. هر عمل فقط در محدودهٔ entitlement و نقش مجاز کاربر انجام می‌شود.</p></div><AccountingConnections mode="modules"/></section>

      <section className={`${story.scene} ${story.section}`} id="offline"><div className={story.shell}><div className={story.offline}><OfflineStory/></div></div></section>

      <section id="features" className={`${styles.container} ${styles.features}`}><div className={styles.sectionIntro}><span className={styles.kicker}>ابزارهای مالی در همان سامانه</span><h2>امکانات حسابداری و مدیریت مالی</h2><p>صاحب کسب‌وکار پاسخ سریع می‌خواهد؛ حسابدار هم دفتر، سند و گزارش قابل بررسی. برای جزئیات هر بخش، مسیر عملیاتی آن را باز کنید.</p></div><FeatureExplorer groups={groups.map(({title,items})=>({title,items}))}/></section>

      <section className={`${story.scene} ${story.section} ${story.wash}`} id="security"><div className={story.shell}><div className={story.intro}><span className={story.kicker}>امنیت مالی، بخشی از اعتماد</span><h2>اطلاعات مالی شما، قفل و امن</h2><p>کنترل دسترسی، جداسازی داده‌ها و حفظ سابقه در رویدادهای مالی را در تجربهٔ واقعی سامانه ببینید.</p></div><SecurityStory/></div></section>

      <section className={`${story.scene} ${story.section}`} id="compare"><div className={story.shell}><div className={story.intro}><span className={story.kicker}>حسابداری متصل به کار روزانه</span><h2>چرا حسابداری MenuPeak؟</h2><p>به‌جای تایپ دوباره، از پیوند سفارش، فروش، بهای مواد و دفاتر برای رسیدگی منظم‌تر استفاده کنید.</p></div><ComparisonStory siteName={siteName}/></div></section>

      <section className={styles.roles}><div className={styles.container}><div className={styles.sectionIntro}><span className={styles.kicker}>یک دفتر، دو نمای متفاوت</span><h2>برای صاحب مجموعه ساده؛ برای حسابدار دقیق</h2></div><div className={styles.roleGrid}><article><span className={styles.roleIcon}><ChartNoAxesCombined/></span><h3>برای مدیر کافه و رستوران</h3><p>وضعیت فروش، سود، موجودی، چک و مطالبات را از صفحه‌های متصل ببینید؛ بدون نیاز به ثبت دوبارهٔ رویدادهای عملیاتی.</p><ul><li><Check/> گزارش سود و زیان و روند فروش</li><li><Check/> مشاهدهٔ ماندهٔ صندوق و بانک</li><li><Check/> هشدار و دسترسی به چک و مطالبات</li></ul></article><article><span className={styles.roleIcon}><FileSpreadsheet/></span><h3>برای حسابدار</h3><p>سند تراز‌شده، کدینگ سه‌سطحی، سال مالی شمسی و دفاتر قابل چاپ برای رسیدگی دقیق‌تر در دسترس است.</p><ul><li><Check/> پیش‌نویس، قطعی‌سازی و سند برگشتی</li><li><Check/> دفتر روزنامه، کل و تراز آزمایشی</li><li><Check/> چاپ گزارش و روکش حسابداری</li></ul></article></div></div></section>



      <section className={styles.setup}><div className={styles.container}><div className={styles.sectionIntro}><span className={styles.kicker}>از پنل خودتان شروع کنید</span><h2>راه‌اندازی در سه قدم</h2><p>حسابداری بخشی از جریان روزانهٔ کسب‌وکار است؛ لازم نیست فروش و کالا را دوباره تعریف کنید.</p></div><div className={styles.setupGrid}>{[["۱","فعال‌کردن دسترسی","پلن و نقش دارای دسترسی حسابداری را انتخاب کنید."],["۲","بررسی کدینگ و مانده‌ها","سال مالی، سرفصل‌ها و حساب بانکی را بازبینی کنید."],["۳","ثبت روزانه و گزارش","اسناد اتوماتیک را کنترل و گزارش‌های موردنیاز را چاپ کنید."]].map(([number,title,copy])=><article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div><div className={styles.closing}><div><Sparkles size={18}/><span><b>حسابداری را با فروش واقعی مجموعه‌تان ببینید.</b><small>امکانات هر پلن را با ماژول‌های مورد نیازتان تطبیق دهید.</small></span></div><div><Link href="/register?trial=demo" className={styles.primaryCta}>شروع آزمایشی <ArrowUpLeft size={16}/></Link><Link href="/plans#comparison" className={styles.secondaryCta}>مقایسهٔ پلن‌ها <ArrowUpLeft size={15}/></Link></div></div></div></section>

      <section className={`${styles.container} ${styles.faq}`}><div className={styles.sectionIntro}><span className={styles.kicker}><CircleHelp size={14}/> پرسش‌های حسابداری</span><h2>پیش از شروع بدانید</h2></div><div>{faqs.map(([q,a])=><details key={q}><summary>{q}<ArrowDownLeft size={16}/></summary><p>{a}</p></details>)}</div></section>
    </main>
    <SiteFooter />
  </div>;
}
