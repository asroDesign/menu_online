import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowDownLeft, ArrowUpLeft, BadgeCheck, Banknote, ChartNoAxesCombined, ChefHat, Check, CircleHelp, CookingPot, Languages, Package, QrCode, ReceiptText, ShieldCheck, ShoppingBag, Sparkles, Star, Utensils, UsersRound, WalletCards, Workflow } from "lucide-react";
import { DemoMenuGallery } from "@/components/marketing/demo-menu-gallery";
import { Pricing } from "@/components/marketing/pricing";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getPlanList, getPlatformBranding } from "@/lib/app-settings";
import { getSiteUrl } from "@/lib/site-url";
import { getPlanOverrides } from "@/lib/entitlements";
import { resolveFeatures } from "@/lib/plans";
import { formatNumber } from "@/lib/format";
import { RestaurantMenuCalculator } from "@/components/marketing/restaurant-menu-calculator";
import { getPublicTestimonials } from "@/lib/marketing-content";
import "./restaurant-digital-menu.css";

export const dynamic = "force-dynamic";

const faq = [
  { q: "مشتری برای دیدن منوی رستوران باید برنامه نصب کند؟", a: "خیر. مشتری QR را با دوربین گوشی اسکن می‌کند و منو در مرورگر باز می‌شود. امکان نصب وب‌اپ روی گوشی نیز بسته به مرورگر در دسترس است." },
  { q: "آیا هر میز می‌تواند QR جدا داشته باشد؟", a: "بله. از مدیریت میزها برای میزها QR می‌سازید و مشتری با اسکن آن، منو را با زمینهٔ همان میز باز می‌کند. مسیر پرداخت و ثبت سفارش به تنظیمات و دسترسی‌های فعال کسب‌وکار بستگی دارد." },
  { q: "سفارش مشتری چطور به آشپزخانه می‌رسد؟", a: "سفارش در پنل قابل پیگیری است و می‌توانید مقصد چاپ فیش را بر اساس تنظیم پرینتر و دستهٔ محصول مشخص کنید. اتصال دستگاه و نتیجهٔ چاپ به وضعیت عامل و سخت‌افزار وابسته است." },
  { q: "آیا قیمت و موجودی منو خودکار به‌روز می‌شود؟", a: "قیمت و وضعیت عرضه را از پنل مدیریت می‌کنید. برای محصولات دارای دستور تهیه و ردیابی موجودی، مقدار مصرف ثبت‌شده در گردش انبار و هشدارها استفاده می‌شود؛ نتیجه به داده‌های خرید و رسپی وابسته است." },
  { q: "قیمت اشتراک منوی رستوران چطور مشخص می‌شود؟", a: "در جدول پلن‌ها، دسترسی هر امکان را مقایسه کنید. قیمت معادل ماهانه و مبلغ نهایی دوره‌های یک، سه، شش و دوازده‌ماهه نمایش داده می‌شود و خرید آنلاین پس از انتخاب پلن انجام می‌شود." },
  { q: "منوی رستوران را می‌توانم قبل از خرید ببینم؟", a: "بله. نمونه منوها را باز کنید و تجربهٔ دسته‌بندی، تصویر، جزئیات محصول و قالب‌های مختلف را در گوشی بررسی کنید." },
];

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPlatformBranding();
  const canonical = `${getSiteUrl()}/restaurant-digital-menu`;
  const title = `منوی دیجیتال رستوران با QR و سفارش آنلاین | ${branding.siteName}`;
  const description = `منوی QR رستوران، ثبت سفارش از میز، پیگیری صندوق و آشپزخانه، مدیریت منو و اتصال به انبار؛ در یک تجربهٔ یکپارچه و قابل تنظیم با ${branding.siteName}.`;
  return { title, description, alternates: { canonical }, openGraph: { type: "website", locale: "fa_IR", title, description, url: canonical }, twitter: { card: "summary_large_image", title, description } };
}

export default async function RestaurantDigitalMenuPage() {
  const [plans, overrides, branding, testimonials] = await Promise.all([getPlanList(), getPlanOverrides(), getPlatformBranding(), getPublicTestimonials(3)]);
  const matrix = Object.fromEntries(plans.map((plan) => [plan.key, resolveFeatures(plan.key, null, overrides)]));
  const canonical = `${getSiteUrl()}/restaurant-digital-menu`;
  const structuredData = [
    { "@context": "https://schema.org", "@type": "WebPage", name: `منوی دیجیتال رستوران ${branding.siteName}`, url: canonical, inLanguage: "fa-IR", description: "معرفی منوی دیجیتال QR و جریان سفارش رستوران." },
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: branding.siteName, applicationCategory: "BusinessApplication", operatingSystem: "Web", url: canonical, description: "ابزار منوی دیجیتال و مدیریت سفارش رستوران با دسترسی‌های وابسته به پلن و تنظیمات." },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  return <div className="marketing-site mp-restaurant-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <SiteHeader />
    <main>
      <nav className="mp-restaurant-breadcrumb market-container" aria-label="مسیر صفحه"><Link href="/">خانه</Link><span>/</span><span aria-current="page">منوی دیجیتال رستوران</span></nav>

      <section className="rmenu-hero"><div className="market-container rmenu-hero-grid">
        <div className="rmenu-hero-copy"><span className="rmenu-eyebrow"><span className="rmenu-live-dot" /> برای رستوران، از روی میز تا آشپزخانه</span>
          <h1>منوی رستوران؛<br /><em>فراتر از یک QR ساده.</em></h1>
          <p>مشتری منو را با گوشی می‌بیند، میز خودش را انتخاب می‌کند و سفارش می‌دهد. تیم شما همان سفارش را در صندوق و آشپزخانه پیگیری می‌کند؛ منو، فروش و موجودی هم در یک جریان مدیریتی به هم می‌رسند.</p>
          <div className="rmenu-hero-actions"><Link href="/register?trial=demo" className="btn market-button">ساخت منوی رستوران <ArrowUpLeft size={18} /></Link><Link href="/preview" className="btn market-secondary">دیدن نمونه منوها <ArrowUpLeft size={17} /></Link></div>
          <div className="rmenu-proof"><span><Check size={15} /> بدون نصب برنامه برای مشتری</span><i /><span><Check size={15} /> قیمت و محتوا از پنل</span><i /><span><Check size={15} /> قابل اتصال به صندوق و عملیات رستوران</span></div>
        </div>
        <div className="rmenu-hero-visual" role="group" aria-label="پیش‌نمایش نمونه منوی رستوران و فیش آشپزخانه">
          <div className="rmenu-table-tag"><QrCode size={15} /><span>QR میز ۷</span><b>رستوران نمونه</b></div>
          <div className="rmenu-phone"><div className="rmenu-phone-notch" /><div className="rmenu-phone-head"><span>رستوران نارون</span><small>میز ۷ · منوی امروز</small><div><span>کباب</span><span>پیش‌غذا</span><span>نوشیدنی</span></div></div>
            <article className="rmenu-food-card"><Image src="/images/marketing/pizza-four-seasons.webp" alt="پیتزای نمونه در منوی دیجیتال رستوران" width={500} height={500} priority /><div><span className="rmenu-food-badge">پیشنهاد سرآشپز</span><b>پیتزا چهار فصل</b><small>خمیر تازه، پنیر موزارلا و سبزیجات روز</small><strong>۳۹۵٬۰۰۰ <small>تومان</small></strong></div></article>
            <article className="rmenu-food-row"><span className="rmenu-food-mini"><Utensils size={15} /></span><div><b>کباب کوبیده</b><small>دو سیخ · برنج ایرانی</small></div><strong>۳۲۰٬۰۰۰</strong></article>
            <div className="rmenu-add-row"><span>سبد میز ۷ · ۲ قلم</span><b>۵۱۵٬۰۰۰ تومان</b></div>
          </div>
          <div className="rmenu-kitchen-ticket"><div><ChefHat size={16} /><b>آشپزخانه · سفارش #۱۲۸</b><span>۲۱:۴۲ · میز ۷</span></div><p><span>پیتزا چهار فصل</span><b>× ۱</b></p><p><span>کباب کوبیده</span><b>× ۱</b></p><div className="rmenu-ticket-status"><i /> ثبت سفارش · آماده‌سازی</div></div>
          <div className="rmenu-online-chip"><span><Check size={14} /></span><div><b>سفارش ثبت شد</b><small>وضعیت از پنل پیگیری می‌شود</small></div></div>
        </div>
      </div></section>

      <section className="market-container rmenu-section rmenu-pain"><div className="rmenu-section-heading"><span className="rmenu-kicker">هر روز، چند بار تکرار می‌شود</span><h2>منوی چاپی، با هر تغییر<br />هزینه و هماهنگی تازه می‌خواهد.</h2><p>یک منوی دیجیتالِ متصل، بخشی از کارهای تکراری بین مشتری، سالن و آشپزخانه را منظم‌تر می‌کند.</p></div>
        <div className="rmenu-pain-grid">{[
          ["قیمت عوض شده، منو هنوز قدیمی است", "قیمت و وضعیت عرضه را از پنل به‌روز کنید تا نسخهٔ آنلاین با اطلاعات جاری هماهنگ بماند.", Banknote],
          ["سفارش وسط شلوغی گم می‌شود", "سفارش‌های ثبت‌شده را در پنل پیگیری کنید و مقصد چاپ را برای گروه‌های محصول تنظیم کنید.", ReceiptText],
          ["غذای تمام‌شده هنوز سفارش می‌گیرد", "وضعیت موجودبودن را مدیریت کنید و در صورت فعال‌بودن ردیابی، هشدار کمبود مواد را دنبال کنید.", Package],
          ["هزینهٔ هر پرس شفاف نیست", "رسپی و بهای خرید مواد را ثبت کنید تا تحلیل بهای مواد به تصمیم قیمت‌گذاری کمک کند.", ChartNoAxesCombined],
        ].map(([title, text, Icon]) => { const I = Icon as typeof Banknote; return <article key={String(title)}><span><I size={20} /></span><div><h3>{String(title)}</h3><p>{String(text)}</p></div><ArrowDownLeft size={17} className="rmenu-pain-arrow" /></article>; })}</div>
      </section>

      <section className="rmenu-flow-section"><div className="market-container rmenu-section"><div className="rmenu-section-heading"><span className="rmenu-kicker">یک سفارش، مسیر روشن</span><h2>از QR میز تا گزارش فروش.</h2><p>هر مرحله در جای خودش انجام می‌شود؛ دسترسی ماژول‌ها به پلان و تنظیمات کسب‌وکار بستگی دارد.</p></div>
        <ol className="rmenu-flow">{[
          [QrCode, "اسکن QR میز", "منوی آنلاین در مرورگر مشتری باز می‌شود؛ بدون نصب اپلیکیشن."],
          [ShoppingBag, "دیدن و انتخاب", "عکس، توضیح، قیمت و گزینه‌های محصول را بررسی می‌کند و به سبد می‌افزاید."],
          [WalletCards, "ثبت و پرداخت", "سفارش با میز یا روش انتخاب‌شده ثبت می‌شود؛ پرداخت‌های فعال در تنظیمات در دسترس‌اند."],
          [ChefHat, "آماده‌سازی و چاپ", "تیم وضعیت سفارش را دنبال می‌کند و مقصد چاپ را طبق دسته و دستگاه تنظیم می‌کند."],
          [Workflow, "انبار و گزارش", "رسپی، گردش موجودی، تسویه و گزارش در ماژول‌های مربوط پیگیری می‌شوند."],
        ].map(([Icon, title, text], index) => { const I = Icon as typeof QrCode; return <li key={String(title)}><span className="rmenu-flow-number">{formatNumber(index + 1).padStart(2, "۰")}</span><span className="rmenu-flow-icon"><I size={22} /></span><h3>{String(title)}</h3><p>{String(text)}</p>{index < 4 && <span className="rmenu-flow-connector" aria-hidden="true" />}</li>; })}</ol>
      </div></section>

      <section className="market-container rmenu-section rmenu-capabilities"><div className="rmenu-section-heading"><span className="rmenu-kicker">برای کار واقعی رستوران</span><h2>منو، فقط صفحهٔ نمایش غذا نیست.</h2><p>تجربهٔ مشتری را به ابزارهای عملیاتی وصل کنید و هر بخش را با نیاز رستوران تنظیم کنید.</p></div>
        <div className="rmenu-capability-grid">{[
          [QrCode, "QR میز و سالن", "برای میزها کد بسازید و سفارش‌ها را با زمینهٔ میز در جریان کار ببینید."],
          [Sparkles, "محتوای جذاب محصول", "تصویر، توضیحات، ویدیو و جزئیات آیتم را در منو ارائه کنید؛ نظرها پس از تأیید نمایش داده می‌شوند."],
          [Languages, "زبان و منوی زمان‌دار", "محتوا و منوی صبحانه، ناهار یا شام را بر اساس قابلیت‌های فعال و تنظیمات نمایش مدیریت کنید."],
          [ChefHat, "صندوق و آشپزخانه", "سفارش سالن، بیرون‌بر و آنلاین را در مسیرهای مربوط پیگیری کنید و فیش‌ها را به دستگاه مناسب بسپارید."],
          [CookingPot, "رسپی و کنترل مواد", "مقدار مصرف مواد را در دستور تهیه تعریف کنید و بهای مواد و هشدارهای موجودی را بررسی کنید."],
          [UsersRound, "مشتری و بازگشت", "پروفایل و سابقهٔ خرید، امتیاز و ابزارهای وفاداری را با رعایت تنظیمات و مجوزهای لازم مدیریت کنید."],
        ].map(([Icon, title, text]) => { const I = Icon as typeof QrCode; return <article key={String(title)}><span><I size={21} /></span><h3>{String(title)}</h3><p>{String(text)}</p></article>; })}</div>
      </section>

      <section className="rmenu-menu-types"><div className="market-container rmenu-section"><div className="rmenu-section-heading"><span className="rmenu-kicker">برای شیوه‌های مختلف سرویس</span><h2>منو با مدل رستوران شما شروع می‌شود.</h2><p>ساختار منو و دسته‌بندی را با فعالیت کسب‌وکار هماهنگ کنید و بعد با محصولات خودتان کاملش کنید.</p></div><div className="rmenu-types-grid">{[
        ["رستوران ایرانی و کبابی", "پرس‌ها، مخلفات، نوشیدنی و گزینه‌های انتخابی را دسته‌بندی کنید."],
        ["فست‌فود و پیتزا", "منوی پرآیتم، افزودنی‌ها، انتخاب سایز و پیشنهادهای کنار غذا را مرتب کنید."],
        ["رستوران خانوادگی", "پیش‌غذا، غذای اصلی، کودک و دسر را برای مرور سریع در دسترس بگذارید."],
        ["کترینگ و بیرون‌بر", "منوی سفارشی و زمان‌بندی سفارش را با روش دریافت و تحویل هماهنگ کنید."],
      ].map(([title, text], i) => <article key={title}><span>۰{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

      <section className="market-container rmenu-section rmenu-compare"><div><span className="rmenu-kicker">فرق در کار روزانه دیده می‌شود</span><h2>از منوی کاغذی<br />تا تجربهٔ متصل رستوران.</h2><p>این مقایسه تفاوت فرایند دیجیتال با کار دستی را نشان می‌دهد؛ برای مقایسهٔ پلن‌ها، دسترسی هر قابلیت را جداگانه ببینید.</p><Link href="/plans#comparison" className="rmenu-text-link">مقایسهٔ کامل امکانات <ArrowUpLeft size={17} /></Link></div>
        <div className="rmenu-compare-table" role="region" aria-label="مقایسه روش سنتی و منوی دیجیتال" tabIndex={0}><table><thead><tr><th scope="col">کار روزمره</th><th scope="col">منوی چاپی/دستی</th><th scope="col">منوی دیجیتال متصل</th></tr></thead><tbody>{[
          ["تغییر قیمت", "اصلاح یا چاپ دوباره", "ویرایش در پنل و انتشار در منوی آنلاین"],
          ["ثبت سفارش میز", "انتقال شفاهی یا یادداشت", "ثبت سفارش مشتری با QR میز، در صورت فعال بودن"],
          ["آماده‌سازی", "انتقال دستی به بخش بعد", "پیگیری سفارش و مقصد چاپ تنظیم‌شده"],
          ["وضعیت مواد", "شمارش جداگانه", "گردش و هشدار مبتنی بر خرید و رسپی ثبت‌شده"],
          ["تحلیل بهای غذا", "محاسبه در فایل‌های جدا", "تحلیل هزینهٔ مواد بر پایهٔ مقدار و قیمت ثبت‌شده"],
        ].map(([task, old, current]) => <tr key={task}><th scope="row">{task}</th><td>{old}</td><td><Check size={15} />{current}</td></tr>)}</tbody></table></div>
      </section>

      <section className="rmenu-calculator-band"><div className="market-container rmenu-section"><div className="rmenu-section-heading"><span className="rmenu-kicker">یک برآورد ساده برای تصمیم بهتر</span><h2>هزینهٔ چاپ منوی رستوران‌تان را حساب کنید.</h2><p>اعداد خودتان را وارد کنید تا تخمین سالانهٔ چاپ دوباره را ببینید. نتیجه فقط برآورد است و هزینهٔ طراحی یا زمان کارکنان را شامل نمی‌شود.</p></div><RestaurantMenuCalculator /></div></section>

      <DemoMenuGallery />

      {testimonials.length > 0 && <section className="market-container rmenu-section rmenu-testimonials"><div className="rmenu-section-heading"><span className="rmenu-kicker">تجربهٔ صاحبان کسب‌وکار</span><h2>از نگاه کسانی که با مشتری سروکار دارند.</h2><p>نظرهای تأییدشدهٔ کاربران سامانه را بخوانید و بعد نمونه منوها را در گوشی بررسی کنید.</p></div><div className="rmenu-testimonial-grid">{testimonials.map((testimonial) => <article key={testimonial.id}><div className="rmenu-stars" aria-label={`امتیاز ${testimonial.rating} از ۵`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill={index < testimonial.rating ? "currentColor" : "none"} />)}</div><blockquote>«{testimonial.body}»</blockquote><div><span>{testimonial.name.slice(0, 1)}</span><p><b>{testimonial.name}</b><small>{[testimonial.title, testimonial.businessName].filter(Boolean).join(" · ")}</small></p></div></article>)}</div></section>}

      <section id="restaurant-pricing" className="market-container rmenu-section rmenu-pricing"><div className="rmenu-section-heading"><span className="rmenu-kicker">قیمت شفاف، امکانات قابل مقایسه</span><h2>پلنی متناسب با روش کارتان انتخاب کنید.</h2><p>قیمت معادل ماهانه، مبلغ کل دوره و امکانات هر پلن را ببینید. برای جزئیات کامل همهٔ قابلیت‌ها، جدول مقایسه را باز کنید.</p></div><Pricing plans={plans} matrix={matrix} /><div className="rmenu-pricing-note"><ShieldCheck size={18} /><span>ویژگی‌ها به پلن و تنظیمات فعال بستگی دارند؛ مبلغ و دوره را پیش از پرداخت در checkout بررسی کنید.</span><Link href="/plans#comparison">همهٔ امکانات پلن‌ها <ArrowUpLeft size={16} /></Link></div></section>

      <section className="market-container rmenu-section rmenu-faq"><div className="rmenu-faq-intro"><span className="rmenu-kicker"><CircleHelp size={15} /> پرسش‌های متداول</span><h2>پیش از راه‌اندازی منوی رستوران.</h2><p>پاسخ کوتاه به پرسش‌هایی که معمولاً پیش از انتخاب و راه‌اندازی مطرح می‌شوند.</p><Link href="/consultation">برای نیاز خاص رستوران مشاوره بگیرید <ArrowUpLeft size={16} /></Link></div><div className="rmenu-faq-list">{faq.map(({ q, a }) => <details key={q}><summary>{q}<span>＋</span></summary><p>{a}</p></details>)}</div></section>

      <section className="market-container rmenu-final"><div><span><BadgeCheck size={16} /> یک شروع مرحله‌به‌مرحله</span><h2>منوی آنلاین رستوران را<br />با تجربهٔ واقعی مشتری بسازید.</h2><p>ثبت‌نام کنید، فروشگاه را آماده کنید و پیش از انتشار، مسیر QR و سفارش را از گوشی مشتری امتحان کنید.</p><div><Link href="/register?trial=demo" className="btn market-button">شروع رایگان <ArrowUpLeft size={17} /></Link><Link href="/demo" className="btn market-secondary">درخواست نمایش</Link></div></div><div className="rmenu-final-art" aria-hidden="true"><span><QrCode size={90} /></span><i /><i /><i /></div></section>
    </main>
    <SiteFooter />
  </div>;
}
