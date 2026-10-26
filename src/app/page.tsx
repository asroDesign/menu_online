import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { ArrowUpLeft, ArrowLeft, BookOpen, Check, CheckCheck, ChefHat, Coffee, Cookie, MonitorSmartphone, Package, QrCode, ReceiptText, ShieldCheck, Star, UtensilsCrossed, Users, Wallet, Headphones, Play, Sparkles } from "lucide-react";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { MenuClient } from "@/components/menu-client";
import { MiniSite } from "@/components/mini-site";
import { getPlanList, getPlatformBranding, getSetting } from "@/lib/app-settings";
import { getSiteUrl } from "@/lib/site-url";
import { featuresOf, getPlanOverrides } from "@/lib/entitlements";
import { formatNumber } from "@/lib/format";
import { resolveFeatures } from "@/lib/plans";
import { buildPublicMenu } from "@/lib/public-menu";
import { getAuth } from "@/lib/auth";
import { getPublicFaqs, getPublicPosts, getPublicTestimonials } from "@/lib/marketing-content";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Pricing } from "@/components/marketing/pricing";
import { OfflineDesktop } from "@/components/marketing/offline-desktop";
import { HomepageShowcase } from "@/components/marketing/homepage-showcase";
import { DemoMenuGallery } from "@/components/marketing/demo-menu-gallery";
import { PlatformEventBeacon } from "@/components/marketing/platform-event-beacon";
import "@/components/marketing/marketing.css";
import { ProductTour } from "@/components/marketing/product-tour";
import { trialDurationDays } from "@/lib/trial-policy";
import "@/components/marketing/home.css";
export const dynamic = "force-dynamic";
const getBranding = cache(() => getPlatformBranding());

export async function generateMetadata(): Promise<Metadata> {
  const [branding, requestHeaders] = await Promise.all([getBranding(), headers()]);
  const base = getSiteUrl();
  const requestedHost = (requestHeaders.get("host") ?? "").split(":")[0].toLowerCase();
  const platformHost = new URL(base).hostname.toLowerCase();
  const canonical = !requestedHost || requestedHost === platformHost || requestedHost === "localhost" || requestedHost === "127.0.0.1" ? `${base}/` : undefined;
  const description = `${branding.siteName}؛ منوی دیجیتال، سفارش‌گیری و ابزارهای مدیریت رستوران با پشتوانه بیش از ۲۰ سال تجربه رستوران‌داری.`;
  const title = `${branding.siteName} | منوی دیجیتال و مدیریت رستوران`;
  return {
    title,
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: { type: "website", locale: "fa_IR", siteName: branding.siteName, title, description, ...(canonical ? { url: canonical } : {}) },
    twitter: { card: "summary_large_image", title, description },
  };
}
export default async function Home() {
  // Custom-domain parking: a verified customer domain serves its own mini-site / menu at "/"
  const host = ((await headers()).get("host") ?? "").split(":")[0].toLowerCase();
  if (host && !["localhost", "127.0.0.1"].includes(host)) {
    const [parked] = await db.select().from(businesses).where(and(eq(businesses.customDomain, host), eq(businesses.domainStatus, "verified")));
    if (parked && !parked.isSuspended) {
      const f = await featuresOf(parked);
      if (f.custom_domain !== "no") {
        if (f.mini_site !== "no") return <MiniSite biz={parked} custom={f.mini_site === "custom"} />;
        return <MenuClient data={JSON.parse(JSON.stringify(await buildPublicMenu(parked)))} initialTableId={null} />;
      }
    }
  }

  const [auth, plans, overrides, faqRows, testimonials, posts, trial, branding] = await Promise.all([
    getAuth(), getPlanList(), getPlanOverrides(), getPublicFaqs(8), getPublicTestimonials(3), getPublicPosts(3),
    getSetting("trialPolicy", { durationDays: 14 }), getBranding(),
  ]);
  const days = formatNumber(trialDurationDays(trial.durationDays));
  const matrix = Object.fromEntries(plans.map(p => [p.key, resolveFeatures(p.key, null, overrides)]));
  const originalFaqs = [
    ["منوی دیجیتال با نرم‌افزار مدیریت رستوران چه تفاوتی دارد؟", "منوی دیجیتال، محصولات و قیمت‌ها را روی موبایل مشتری نمایش می‌دهد. در پلان‌های دارای دسترسی، سفارش‌گیری، صندوق، انبار، حسابداری و باشگاه مشتریان هم به این تجربه متصل می‌شوند. امکانات هر پلان را در جدول مقایسه بررسی کنید."],
    ["دوره رایگان چگونه فعال می‌شود؟", `بعد از نخستین ثبت‌نام، تأیید شماره موبایل و تکمیل اطلاعات اولیه فروشگاه، دوره آزمایشی ${days} روزه با امکانات پرمیوم پلاس فعال می‌شود. تور راه‌اندازی شما را با بخش‌های واقعی پنل آشنا می‌کند. این فرصت مخصوص ثبت‌نام جدید است.`],
    ["در دوره آزمایشی می‌توانم اشتراک بخرم؟", "بله. هر زمان می‌توانید پلان موردنیاز را انتخاب کنید. پس از پرداخت موفق، اشتراک خریداری‌شده جایگزین دوره آزمایشی می‌شود. صرف انتخاب پلان یا ساخت حساب به معنی خرید اشتراک نیست."],
    ["برای مشتری یا گارسون نصب برنامه لازم است؟", "منوی مشتری و پنل گارسون در مرورگر باز می‌شوند و برای موبایل و تبلت طراحی شده‌اند. اتصال تجهیزات محلی مانند پرینتر ممکن است به نصب عامل ویندوز نیاز داشته باشد."],
    ["آیا می‌توانم ظاهر و محتوای منو را تغییر بدهم؟", "بله؛ تصویر، توضیح، قیمت، دسته‌بندی و گزینه‌های محصول قابل مدیریت‌اند. ده قالب منو و تنظیمات برند وجود دارد. دسترسی به دامنه اختصاصی، مینی‌سایت و سایر امکانات را در پلان‌ها ببینید."],
    ["هزینه اشتراک و تخفیف چگونه محاسبه می‌شود؟", "دوره شش‌ماهه یا سالانه را انتخاب کنید. تعرفه همان دوره و تخفیف فعال آن نمایش داده می‌شود؛ مبلغ نهایی فاکتور را پیش از پرداخت بررسی کنید. کد تخفیف معتبر را می‌توانید در صفحه پرداخت وارد کنید."],
    ["آیا پرداخت آنلاین مشتری هم پشتیبانی می‌شود؟", "بله، با فعال‌بودن تنظیمات درگاه و دسترسی مربوط، مشتری می‌تواند سفارش را آنلاین پرداخت کند. کارت‌به‌کارت نیز تنظیم جداگانه دارد. پرداخت اشتراک سامانه و پرداخت سفارش رستوران دو فرایند جدا هستند."],
    ["چطور بهای تمام‌شده غذا محاسبه می‌شود و در کدام پلن است؟", "ماده، واحد و بهای خرید را در انبار ثبت می‌کنید و مقدار مصرف را در دستور تهیه محصول وارد می‌کنید. تحلیل قیمت از این داده‌ها استفاده می‌کند و در پلن‌های پرمیوم و پرمیوم پلاس فعال است؛ پلن پایه شامل این قابلیت نیست. برای عدد قابل اتکا باید رسپی، تبدیل واحد و هزینه مواد به‌روز باشند."],
    ["پرینتر کافی‌بار و آشپزخانه جداگانه کار می‌کنند؟", "امکان تعریف چند پرینتر و تخصیص دسته‌بندی‌ها به مقصد چاپ وجود دارد. مدل دستگاه، اتصال شبکه یا USB و عامل محلی ویندوز باید بررسی و تنظیم شوند؛ پیش از خرید سخت‌افزار با پشتیبانی هماهنگ کنید."],
    ["آیا همه امکانات در همه پلان‌ها وجود دارند؟", "خیر. دسترسی ماژول‌ها و محدودیت‌ها به پلان بستگی دارد. جدول همه امکانات، مبنای مقایسه است؛ امکانات دوره آزمایشی پرمیوم پلاس را با پلان انتخابی خود یکسان فرض نکنید."],
    ["برای شروع و راه‌اندازی از کجا کمک بگیرم؟", "از تور داخل پنل و بخش آموزش شروع کنید. برای بررسی نیازهای کسب‌وکار، درخواست مشاوره یا نمایش سامانه با کارشناس ثبت کنید. راه‌های ارتباطی در صفحه تماس با ما قرار دارند."],
  ];
  const faqs = [...faqRows.map(f => [f.question, f.answer]), ...originalFaqs].filter((item, index, all) => all.findIndex(other => other[0] === item[0]) === index);
  const siteUrl = getSiteUrl();
  const structuredDescription = `${branding.siteName}؛ منوی دیجیتال، سفارش‌گیری و ابزارهای مدیریت رستوران با پشتوانه بیش از ۲۰ سال تجربه رستوران‌داری.`;
  const structuredData = [
    { "@context": "https://schema.org", "@type": "Organization", name: branding.siteName, url: siteUrl, logo: `${siteUrl}/icon.svg`, description: `نرم‌افزار مدیریت رستوران و منوی دیجیتال، طراحی‌شده با تکیه بر بیش از ۲۰ سال تجربه رستوران‌داری.` },
    { "@context": "https://schema.org", "@type": "WebSite", name: branding.siteName, url: siteUrl, inLanguage: "fa-IR" },
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: branding.siteName, applicationCategory: "BusinessApplication", operatingSystem: "Web", url: siteUrl, description: structuredDescription, featureList: ["منوی دیجیتال و QR", "سفارش‌گیری و صندوق", "مدیریت انبار و بهای غذا", "حسابداری و گزارش", "باشگاه مشتریان", "مدیریت شیفت و چاپ سفارش"] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ];
  return <div className="marketing-site mp-home"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}/><PlatformEventBeacon name="home_view"/><SiteHeader/><main>
    <section className="mp-hero"><div className="market-container mp-hero-inner"><div className="mp-hero-copy">
      <span className="mp-kicker"><span className="mp-live-dot"/> از دل رستوران، برای رستوران</span>
      <h1>سفارش، پرداخت و فروش؛<br/><em>همه در یک پنل هوشمند.</em></h1>
      <p>{branding.siteName} منوی QR، سفارش‌گیری، رزرو میز، مدیریت فروش و عملیات روزانه را یک‌جا جمع می‌کند؛ با تکیه بر <strong>بیش از ۲۰ سال تجربهٔ رستوران‌داری.</strong></p>
      <div className="mp-actions"><Link href={auth ? "/dashboard" : "/register?trial=demo"} className="btn market-button">{auth ? "ورود به داشبورد" : `شروع ${days} روز رایگان`}<ArrowUpLeft size={18}/></Link><Link href="/preview" className="btn market-secondary"><Play size={16}/> دیدن منوهای نمونه</Link></div>
      <div className="mp-hero-notes"><span><CheckCheck size={16}/> بدون نصب برنامه برای مشتری</span><Link href="#buying-guide">راهنمای شروع <ArrowLeft size={14}/></Link></div>
    </div><HomepageShowcase/></div>
    <div className="market-container mp-audience"><span>برای شکل‌های مختلف مهمان‌نوازی</span><div>{[[Coffee,"کافه"],[UtensilsCrossed,"رستوران"],[ChefHat,"فست‌فود"],[Cookie,"قنادی"],[ReceiptText,"کترینگ و بیرون‌بر"]].map(([I,label])=>{const Icon=I as typeof Coffee;return <span key={String(label)}><Icon size={19}/>{String(label)}</span>})}</div></div></section>

    <section id="why-us" className="market-container mp-section mp-experience"><div className="mp-years"><span>پشت این نرم‌افزار</span><strong>۲۰<span>+</span></strong><b>سال تجربهٔ رستوران‌داری</b><p>شناخت مسئله، پیش از نوشتن راه‌حل.</p><UtensilsCrossed size={100} strokeWidth={.6} aria-hidden="true"/></div><div><span className="mp-kicker">با زبان کسب‌وکار شما حرف می‌زنیم</span><h2>فقط نرم‌افزار نساخته‌ایم؛<br/>شلوغیِ ساعت ناهار را می‌شناسیم.</h2><p className="mp-lead">تجربه بیش از دو دهه فعالیت در حوزه رستوران و رستوران‌گردانی، مبنای طراحی این محصول بوده است. مسئله فقط ثبت یک سفارش نیست؛ هماهنگی آدم‌ها، کنترل هزینه‌ها و ساختن تجربه‌ای است که مشتری برایش برگردد.</p><div className="mp-pain-grid">{[["وقتی سفارش‌ها هم‌زمان می‌رسند","مسیر مشخص بین صندوق، گارسون و آماده‌سازی."],["وقتی قیمت مواد تغییر می‌کند","رسپی و تحلیل هزینه برای بازبینی آگاهانه قیمت‌ها."],["وقتی شیفت عوض می‌شود","نقش، برنامه کاری و اطلاعات عملیاتی در دسترس."],["وقتی مشتری دوباره برمی‌گردد","سابقه خرید و ابزارهای باشگاه مشتریان کنار تیم."]].map(([title,text])=><div key={title}><Check size={18}/><h3>{title}</h3><p>{text}</p></div>)}</div></div></section>

    <section id="features" className="mp-soft-section"><div className="market-container mp-section"><div className="mp-section-heading"><span className="mp-kicker">از روی میز تا پشت صحنه</span><h2>شش بخش، یک تصویر کامل<br/>از کسب‌وکار شما.</h2><p>بخش موردنظر را انتخاب کنید و ببینید در کار روزانه چه کمکی به شما می‌کند.</p></div><ProductTour/><p className="mp-caption">امکانات معرفی‌شده در مجموعه پلان‌ها ارائه می‌شوند؛ دسترسی هر ماژول و محدودیت‌های آن را پیش از خرید مقایسه کنید.</p></div></section>

    <section className="market-container mp-section"><div className="mp-section-heading mp-heading-row"><div><span className="mp-kicker">اطلاعات، همراه سفارش حرکت می‌کنند</span><h2>یک سفارش؛<br/>چند بخش هماهنگ.</h2></div><p>وقتی اطلاعات در یک مسیر ثبت می‌شوند، پیگیری کار ساده‌تر است. راه‌اندازی رسپی، حساب‌ها و مقصد چاپ، این ارتباط را کامل می‌کند.</p></div><ol className="mp-order-flow">{[[QrCode,"انتخاب مشتری","منوی تصویری، گزینه‌های محصول و سبد خرید"],[ReceiptText,"ثبت و تأیید","صندوق یا گارسون، میز و جزئیات سفارش"],[ChefHat,"آماده‌سازی","وضعیت سفارش و فیش تفکیک‌شده هر بخش"],[Package,"کنترل مواد","مصرف بر اساس رسپی و تنظیم ردیابی موجودی"],[Wallet,"بررسی نتیجه","پرداخت، مطالبات و گزارش‌های فروش"]].map(([I,title,text],index)=>{const Icon=I as typeof QrCode;return <li key={String(title)}><span className="mp-flow-number">{formatNumber(index+1).padStart(2,"۰")}</span><Icon size={25}/><h3>{String(title)}</h3><p>{String(text)}</p></li>})}</ol></section>

    <OfflineDesktop />

    <section className="mp-dark-section"><div className="market-container mp-section mp-cost-grid"><div><span className="mp-kicker">فروش را ببینید؛ هزینه را هم بشناسید</span><h2>قیمت‌گذاری با شناخت مواد،<br/>نه فقط نگاه به رقبا.</h2><p>بهای مواد اولیه از انبار و میزان مصرف از دستور تهیه محصول می‌آید. تحلیل قیمت، این دو را کنار هم می‌گذارد تا اثر تغییر هزینه‌ها و هدف حاشیه سود را ببینید.</p><ul className="mp-check-list"><li><Check/>تعریف و ویرایش مواد مصرفی هر محصول</li><li><Check/>بررسی هزینه با واحد و مقدار قابل‌ردیابی</li><li><Check/>انتخاب قیمت پیشنهادی با تأیید شما</li></ul><p className="mt-3 text-xs leading-6 text-white/70">قیمت‌گذاری هوشمند در پلن‌های پرمیوم و پرمیوم پلاس فعال است؛ سطح دسترسی هر پلن را در <Link href="/plans#comparison" className="font-bold text-white underline decoration-white/50 underline-offset-4">جدول مقایسه امکانات</Link> ببینید.</p><Link href="/demo" className="btn market-secondary">تحلیل قیمت را در دمو ببینید <ArrowUpLeft size={17}/></Link></div><div className="mp-cost-card"><div className="mp-cost-heading"><span className="mp-icon"><UtensilsCrossed size={25}/></span><div><small>مثال آموزشی · ارقام فرضی</small><h3>رسپی چیزبرگر دوبل</h3></div><span className="mp-cost-tag">بهای مواد</span></div><div className="mp-cost-rows">{[["گوشت چرخ‌کرده","۰٫۳ کیلوگرم × ۶۵۰٬۰۰۰","۱۹۵٬۰۰۰",88],["نان همبرگر","۱ عدد × ۱۲٬۰۰۰","۱۲٬۰۰۰",5],["پنیر موزارلا","۰٫۰۴ کیلوگرم × ۳۸۰٬۰۰۰","۱۵٬۲۰۰",7]].map(([name,detail,cost,width])=><div key={String(name)}><div><b>{String(name)}</b><span>{String(cost)} <small>تومان</small></span></div><small>{String(detail)}</small><div className="mp-cost-bar"><i style={{width:`${width}%`}}/></div></div>)}</div><div className="mp-cost-total"><span>جمع مواد هر واحد</span><strong>۲۲۲٬۲۰۰ <small>تومان</small></strong></div><p>این نمونه فقط هزینه سه ماده را نشان می‌دهد؛ دستمزد، انرژی و سایر هزینه‌ها در این عدد نیست.</p></div></div></section>

    <section className="market-container mp-section"><div className="mp-section-heading"><span className="mp-kicker">از نیاز خودتان شروع کنید</span><h2>برای مدل کاری شما،<br/>یک مسیر مناسب وجود دارد.</h2></div><div className="mp-use-cases">{[[Coffee,"کافه و کافی‌شاپ","تنوع نوشیدنی، گزینه‌های اضافه، فیش کافی‌بار و ارتباط با مشتری همیشگی."],[UtensilsCrossed,"رستوران و سالن پذیرایی","منوی میز، سفارش گارسون، رزرو و هماهنگی سالن و آشپزخانه."],[ChefHat,"فست‌فود و بیرون‌بر","سفارش حضوری و آنلاین، پیگیری مراحل، رسپی و کنترل مواد پرمصرف."],[Cookie,"قنادی و فروش وزنی","محصول وزنی، واحدهای اندازه‌گیری و تجهیزات سازگار با تنظیمات مربوط."],[Package,"کترینگ و تهیه غذا","دستور تهیه، خرید چندقلمی، کنترل موجودی و تحلیل هزینه مواد."],[Users,"مجموعه دارای چند بخش کاری","تفکیک نقش‌ها و مقصد چاپ سفارش میان بخش‌های همان کسب‌وکار."]].map(([I,title,text])=>{const Icon=I as typeof Coffee;return <article key={String(title)}><Icon size={24}/><h3>{String(title)}</h3><p>{String(text)}</p></article>})}</div></section>

    <section className="market-container mp-comparison"><div><span className="mp-kicker">تفاوتی که در کار روزانه حس می‌شود</span><h2>کمتر بین ابزارها جابه‌جا شوید.<br/>بیشتر روی کار مسلط بمانید.</h2><p>این مقایسه با روش دستی و ابزارهای پراکنده است. برای انتخاب بین پلتفرم‌ها، امکانات موردنیازتان را در دمو بررسی کنید.</p><Link href="/plans#comparison" className="mp-text-link">مقایسه کامل امکانات پلان‌ها <ArrowUpLeft size={17}/></Link></div><div className="mp-compare-table" role="region" aria-label="مقایسه روش دستی و مدیریت متصل"><table><thead><tr><th>کار روزانه</th><th>روش پراکنده</th><th>با ابزار متصل</th></tr></thead><tbody>{[["تغییر منو","اصلاح نسخه‌های مختلف","به‌روزرسانی منوی آنلاین"],["هزینه غذا","محاسبه جداگانه مواد","تحلیل از رسپی و انبار"],["سفارش آشپزخانه","انتقال شفاهی یا دستی","وضعیت و مقصد چاپ مشخص"],["پیگیری بدهکار","دفتر و یادداشت‌های جدا","مطالبات و سوابق پرداخت"],["شناخت مشتری","حافظه تیم","پروفایل و سابقه خرید"]].map(([task,before,after])=><tr key={task}><th>{task}</th><td>{before}</td><td><Check size={15}/>{after}</td></tr>)}</tbody></table></div></section>

    <section id="buying-guide" className="mp-soft-section"><div className="market-container mp-section"><div className="mp-section-heading"><span className="mp-kicker">راهنمای گام‌به‌گام خرید منوی آنلاین و دیجیتال</span><h2>از اولین بررسی،<br/>تا اولین سفارش.</h2><p>اول تجربه کنید، بعد امکانات موردنیاز را مقایسه کنید و با اطلاع از مبلغ و دوره، خرید را انجام دهید.</p></div><ol className="mp-guide">{[
      ["نیاز کسب‌وکارتان را مشخص کنید","فقط منوی QR می‌خواهید یا سفارش آنلاین، صندوق، انبار و حسابداری هم لازم دارید؟ تعداد کاربران، تجهیزات و فرایند فعلی را یادداشت کنید.","/consultation","برای انتخاب مشورت بگیرید"],
      ["منو را ببینید و رایگان شروع کنید",`نمونه منو را تجربه کنید. در اولین ثبت‌نام، شماره موبایل را تأیید و اطلاعات اولیه فروشگاه را تکمیل کنید تا دوره ${days} روزه پرمیوم پلاس فعال شود.` ,"/register?trial=demo","ساخت حساب و شروع آزمایش"],
      ["فروشگاه خودتان را آماده کنید","نوع فعالیت را انتخاب کنید؛ منو و دسته‌بندی اولیه متناسب با آن بارگذاری می‌شود. با تور داخل پنل، اطلاعات، محصولات، قیمت‌ها و ساعت کاری را کامل کنید.","/tutorials","راهنمای راه‌اندازی"],
      ["پلان و دوره مناسب را انتخاب کنید","همه امکانات و محدودیت‌ها را مقایسه کنید. بین دوره شش‌ماهه و سالانه، مبلغ کل و تخفیف فعال هر دوره را بررسی کنید.","/plans#comparison","مقایسه همه امکانات"],
      ["فاکتور را بررسی و آنلاین پرداخت کنید","از دکمه خرید پلان وارد پرداخت شوید. پس از ورود به حساب، کد تخفیف معتبر و درگاه فعال را انتخاب کنید؛ خرید با پرداخت موفق نهایی می‌شود و جای دوره آزمایشی را می‌گیرد.","#pricing","انتخاب پلان و خرید"],
      ["QR را منتشر و مسیر سفارش را امتحان کنید","لینک یا QR منو را در دسترس مشتری بگذارید. یک سفارش آزمایشی را از انتخاب تا تحویل بررسی کنید و در صورت نیاز تجهیزات و دسترسی تیم را تنظیم کنید.","/demo","درخواست نمایش با کارشناس"],
    ].map(([title,text,href,label],index)=><li key={title}><span>{formatNumber(index+1).padStart(2,"۰")}</span><div><h3>{title}</h3><p>{text}</p><Link href={href}>{label}<ArrowUpLeft size={16}/></Link></div></li>)}</ol></div></section>

    <DemoMenuGallery/>

    <section id="pricing" className="market-container mp-section"><div className="mp-section-heading"><span className="mp-kicker">خرید روشن، متناسب با نیاز</span><h2>به اندازهٔ امروز انتخاب کنید.<br/>برای رشد فردا آماده باشید.</h2><p>تعرفه‌های زنده سامانه؛ دوره شش‌ماهه یا سالانه را انتخاب کنید. تخفیف هر دوره، در صورت فعال‌بودن، روی همان تعرفه نمایش داده می‌شود.</p></div><Pricing plans={plans} matrix={matrix}/><div className="mp-pricing-help"><ShieldCheck size={22}/><p>پیش از پرداخت، امکانات پلان، مبلغ نهایی و <Link href="/terms">قوانین استفاده</Link> را بررسی کنید.</p><Link href="/consultation">برای انتخاب کمک می‌خواهم <ArrowUpLeft size={16}/></Link></div></section>

    <section className="market-container mp-support"><div><Headphones size={28}/><h3>پیش از خرید، گفت‌وگو کنیم</h3><p>مدل کار، تجهیزات و امکانات موردنیازتان را در درخواست مشاوره مطرح کنید.</p><Link href="/consultation">درخواست مشاوره <ArrowUpLeft size={16}/></Link></div><div><MonitorSmartphone size={28}/><h3>محیط واقعی را ببینید</h3><p>هم نمونه منوی مشتری را ببینید، هم برای نمایش بخش‌های مدیریتی درخواست بدهید.</p><Link href="/demo">نمایش همراه کارشناس <ArrowUpLeft size={16}/></Link></div><div><BookOpen size={28}/><h3>قدم‌به‌قدم راه‌اندازی کنید</h3><p>تور داخل پنل و آموزش‌ها، مسیر آشنایی با قسمت‌های نرم‌افزار را نشان می‌دهند.</p><Link href="/tutorials">مرکز آموزش <ArrowUpLeft size={16}/></Link></div></section>

    {testimonials.length > 0 && <section className="market-container mp-section"><div className="mp-section-heading"><span className="mp-kicker">تجربه همراهان ما</span><h2>از زبان صاحبان کسب‌وکار.</h2></div><div className="testimonials-grid">{testimonials.map(t=><article key={t.id}><div className="rating-stars" aria-label={`امتیاز ${t.rating} از ۵`}>{Array.from({length:5},(_,i)=><Star key={i} size={15} fill={i<t.rating ? "currentColor" : "none"}/>)}</div><blockquote>«{t.body}»</blockquote><div className="quote-author"><span>{t.name.charAt(0)}</span><div><b>{t.name}</b><small>{[t.title,t.businessName].filter(Boolean).join(" · ")}</small></div></div></article>)}</div></section>}
    <section id="faq" className="market-container mp-section mp-faq"><div><span className="mp-kicker">با اطمینان تصمیم بگیرید</span><h2>پاسخ روشن،<br/>قبل از شروع.</h2><p>سؤال دیگری دارید؟ درباره نیاز واقعی مجموعه‌تان با ما صحبت کنید.</p><Link href="/contact" className="mp-text-link">راه‌های ارتباطی <ArrowUpLeft size={17}/></Link></div><div className="faq-list">{faqs.map(([q,a],i)=><details className="collapse collapse-plus" key={q}><summary className="collapse-title"><span>{formatNumber(i+1).padStart(2,"۰")}</span>{q}</summary><div className="collapse-content"><p>{a}</p></div></details>)}</div></section>
    {posts.length > 0 && <section className="market-container mp-section"><div className="mp-section-heading mp-heading-row"><div><span className="mp-kicker">مجله مدیریت رستوران</span><h2>برای بهتر اداره کردن.</h2></div><Link href="/blog" className="mp-text-link">همه مقاله‌ها <ArrowUpLeft size={17}/></Link></div><div className="journal-grid">{posts.map(post=><Link key={post.id} href={`/blog/${post.slug}`} className="journal-card"><div className="journal-art"><BookOpen size={40}/><span>{post.category}</span></div><div><h3>{post.title}</h3><p>{post.excerpt}</p></div></Link>)}</div></section>}
    <section className="market-container mp-last-section"><div className="mp-final"><div><span className="mp-kicker"><Sparkles size={16}/> حالا نوبت تجربه شماست</span><h2>منوی شما، تیم شما،<br/>یک شروع منظم‌تر.</h2><p>{days} روز امکانات پرمیوم پلاس را در نخستین ثبت‌نام تجربه کنید؛ بعد، پلان مناسب کسب‌وکارتان را انتخاب کنید.</p><div className="mp-actions"><Link href="/register?trial=demo" className="btn market-button">شروع رایگان <ArrowUpLeft size={18}/></Link><Link href="/consultation" className="btn market-secondary">اول مشورت کنیم</Link></div></div><div className="mp-final-art" aria-hidden="true"><div><QrCode size={88} strokeWidth={1}/><span>به میز آینده خوش آمدید</span></div><i/><i/></div></div></section>
  </main><SiteFooter/></div>;
}
