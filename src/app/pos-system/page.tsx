import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUpLeft, Check, CircleAlert, CloudUpload, Database, History, Monitor, Printer, RefreshCw, ShieldCheck, ShoppingBasket, WifiOff } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getSiteUrl } from "@/lib/site-url";
import "./pos-system.css";

export const metadata: Metadata = {
  title: "صندوق آفلاین ویندوز برای کافه و رستوران | MenuPeak",
  description: "ثبت فروش محلی هنگام قطعی اینترنت، دسترسی به سفارش‌های دریافت‌شده، چاپ محلی و همگام‌سازی پس از بازگشت ارتباط؛ همراه با توضیح محدودیت‌های نسخهٔ فعلی.",
  alternates: { canonical: `${getSiteUrl()}/pos-system` },
  openGraph: { title: "صندوق آفلاین ویندوز MenuPeak", description: "فروش را در قطعی اینترنت ادامه دهید و پس از اتصال، داده‌های محلی را همگام کنید.", url: `${getSiteUrl()}/pos-system`, type: "website" },
};

const steps = [
  { title: "یک بار با اینترنت آماده کنید", text: "مدیر دستگاه را به کسب‌وکار متصل می‌کند و منو و داده‌های مجاز را روی همان رایانه دریافت می‌کند.", icon: ShieldCheck },
  { title: "سفارش را محلی ثبت کنید", text: "در قطعی اینترنت، سفارش صندوق ابتدا در پایگاه محلی دستگاه ذخیره می‌شود تا کار صندوق متوقف نشود.", icon: ShoppingBasket },
  { title: "رسید را از مسیر محلی چاپ کنید", text: "چاپگرهای تنظیم‌شدهٔ همان رایانه می‌توانند فیش محلی را دریافت کنند؛ تست چاپ از اتصال به صف سایت جداست.", icon: Printer },
  { title: "پس از اتصال، صف را پیگیری کنید", text: "فرمان‌ها با شناسهٔ یکتا ارسال می‌شوند؛ موارد متعارض برای بازبینی می‌مانند و وضعیت صف در برنامه دیده می‌شود.", icon: CloudUpload },
];

const capabilities = [
  { title: "فروش محلی و صف ارسال", text: "سفارش تازه روی دستگاه ذخیره می‌شود و وضعیت pending، تعارض یا همگام‌شده در صف قابل مشاهده است.", icon: Database },
  { title: "تاریخچهٔ سفارش‌های دریافت‌شده", text: "فهرست و جزئیات سفارش‌هایی که پیش از قطعی در دستگاه cache شده‌اند، بدون اتصال هم قابل مشاهده‌اند.", icon: History },
  { title: "چاپ از رایانهٔ صندوق", text: "چاپ محلی از پرینتر تنظیم‌شده مستقل از صف چاپ ابری است. خروج کاغذ باید روی خود دستگاه بررسی شود.", icon: Printer },
  { title: "همگام‌سازی قابل پیگیری", text: "در صورت تغییر هم‌زمان داده یا رد فرمان، وضعیت و علت در صف باقی می‌ماند تا مدیر آن را بررسی کند.", icon: RefreshCw },
];

export default function PosSystemPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "MenuPeak Desktop",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Windows",
    description: "صندوق ویندوز با ثبت محلی فروش، دسترسی به داده‌های دریافت‌شده و همگام‌سازی صف پس از بازگشت اینترنت.",
  };
  return <div className="marketing-site mp-pos-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <SiteHeader />
    <main>
      <section className="mp-pos-hero">
        <div className="market-container mp-pos-hero-grid">
          <div className="mp-pos-copy">
            <span className="mp-kicker"><Monitor size={16} /> MenuPeak Desktop · صندوق ویندوز</span>
            <h1>قطعی اینترنت،<br /><em>پایان فروش نیست.</em></h1>
            <p>صندوق محلی MenuPeak برای ثبت فروش روی رایانهٔ ویندوزی طراحی شده است. سفارش‌های محلی و تاریخچهٔ دریافت‌شده در دسترس می‌مانند و صف پس از بازگشت اینترنت برای همگام‌سازی تلاش می‌کند.</p>
            <div className="mp-pos-actions"><Link className="btn market-button" href="https://github.com/asroDesign/menu_online/releases/download/windows-bridge-latest/MenuPeak-Bridge-Setup-x64.exe">دریافت برنامهٔ ویندوز <ArrowUpLeft size={18} /></Link><Link className="btn market-secondary" href="/register?trial=demo">شروع رایگان <ArrowUpLeft size={18} /></Link></div>
            <div className="mp-pos-proof"><span><Check size={15} /> فروش محلی در قطعی اینترنت</span><span><Check size={15} /> تاریخچهٔ cacheشده</span><span><Check size={15} /> چاپ محلی</span></div>
          </div>
          <div className="mp-pos-mock" aria-label="پیش‌نمایش صندوق محلی در زمان قطعی اینترنت">
            <div className="mp-pos-window"><div className="mp-pos-window-bar"><span><i /><i /><i /></span><b>صندوق محلی MenuPeak</b><span className="mp-pos-offline-badge"><WifiOff size={13} /> بدون اینترنت</span></div>
              <div className="mp-pos-window-body"><div className="mp-pos-catalog"><div className="mp-pos-catalog-head"><span>منوی دریافت‌شده</span><small>کافه نارون</small></div>{[["لاته", "۱۲۰٬۰۰۰"], ["کیک شکلاتی", "۱۶۰٬۰۰۰"], ["چای ماسالا", "۹۵٬۰۰۰"]].map(([name, price]) => <div className="mp-pos-product" key={name}><span className="mp-pos-product-icon"><ShoppingBasket size={15} /></span><span><b>{name}</b><small>موجود در نسخهٔ محلی</small></span><strong>{price}</strong></div>)}</div>
                <aside className="mp-pos-ticket"><div className="mp-pos-ticket-head"><span>سفارش جاری</span><b>#۱۲۸</b></div><div className="mp-pos-ticket-row"><span>لاته × ۲</span><b>۲۴۰٬۰۰۰</b></div><div className="mp-pos-ticket-row"><span>کیک شکلاتی × ۱</span><b>۱۶۰٬۰۰۰</b></div><div className="mp-pos-ticket-total"><span>جمع سفارش</span><b>۴۰۰٬۰۰۰ تومان</b></div><div className="mp-pos-local-save"><Database size={16} /><span><b>روی دستگاه ذخیره شد</b><small>در صف همگام‌سازی</small></span><Check size={16} /></div></aside></div>
              <div className="mp-pos-queue"><span><CircleAlert size={14} /> ۱ سفارش محلی</span><span><Printer size={14} /> چاپ محلی آماده</span><span><ArrowDown size={14} /> اتصال که برگشت، ارسال می‌شود</span></div>
            </div>
            <div className="mp-pos-sync-card"><span className="mp-pos-sync-icon"><CloudUpload size={19} /></span><span><b>صف محلی تا زمان اتصال محفوظ است</b><small>همگام‌سازی و بررسی تعارض پس از بازگشت اینترنت</small></span><RefreshCw size={16} /></div>
          </div>
        </div>
      </section>

      <section className="market-container mp-section mp-pos-problem"><div className="mp-section-heading"><span className="mp-kicker">در ساعت شلوغی مکث نکنید</span><h2>وقتی ارتباط قطع می‌شود،<br />صندوق هنوز باید کار کند.</h2><p>صندوق محلی دادهٔ قبلاً دریافت‌شده را نگه می‌دارد و ثبت فروش را از اتصال لحظه‌ای به سایت جدا می‌کند.</p></div><div className="mp-pos-capability-grid">{capabilities.map(({ title, text, icon: Icon }) => <article key={title}><span><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

      <section className="mp-pos-flow"><div className="market-container mp-section"><div className="mp-section-heading"><span className="mp-kicker">از آماده‌سازی تا همگام‌سازی</span><h2>مسیر هر سفارش روشن است.</h2><p>اتصال اولیه و دریافت snapshot نیاز به اینترنت دارد؛ هنگام قطعی دستگاه از داده‌های محلی استفاده می‌کند.</p></div><ol className="mp-pos-steps">{steps.map(({ title, text, icon: Icon }, index) => <li key={title}><span className="mp-pos-step-icon"><Icon size={21} /></span><span className="mp-pos-step-number">۰{index + 1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol></div></section>

      <section className="market-container mp-section mp-pos-boundaries"><div className="mp-pos-boundary-card"><div><span className="mp-kicker">شفاف دربارهٔ نسخهٔ فعلی</span><h2>چه چیزی آفلاین می‌ماند؟</h2><p>نسخهٔ جاری، صندوق و سوابق سفارش دریافت‌شده را در قطعی پوشش می‌دهد. دسترسی آفلاین به همهٔ ماژول‌های پنل هنوز کامل نیست؛ برخی عملیات انبار، رزرو، میز، شیفت و حسابداری در صف‌های محدود خود ثبت می‌شوند و نتیجهٔ قطعی آن‌ها پس از اعتبارسنجی سرور مشخص می‌شود.</p><ul><li><Check size={16} />قیمت و مجوز فرمان هنگام همگام‌سازی دوباره بررسی می‌شود.</li><li><Check size={16} />در تعارض، داده بی‌صدا بازنویسی نمی‌شود.</li><li><Check size={16} />اولین جفت‌سازی و دریافت دادهٔ اولیه به اینترنت نیاز دارد.</li></ul></div><div className="mp-pos-boundary-aside"><ShieldCheck size={27} /><b>تراکنش محلی با تأیید سرور یکی نیست.</b><span>گزارش نهایی مرکزی پس از sync موفق به‌روز می‌شود.</span></div></div></section>

      <section className="market-container mp-pos-cta"><div><span className="mp-kicker">برای کافه و رستوران</span><h2>قبل از نصب، مسیر صندوق‌تان را بررسی کنید.</h2><p>با ثبت درخواست نمایش یا مشاوره، تجهیزات و فرآیند صندوق خود را با تیم MenuPeak مرور کنید.</p></div><div><Link className="btn market-button" href="/demo">درخواست نمایش <ArrowUpLeft size={17} /></Link><Link className="btn market-secondary" href="/consultation">درخواست مشاوره</Link></div></section>
    </main>
    <SiteFooter />
  </div>;
}
