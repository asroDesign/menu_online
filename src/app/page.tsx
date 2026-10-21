import Link from "next/link";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { ArrowUpLeft, ArrowLeft, BookOpen, CalendarDays, ChartNoAxesCombined, ChefHat, Coffee, Layers, QrCode, ReceiptText, Star, UtensilsCrossed, Wallet } from "lucide-react";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { MenuClient } from "@/components/menu-client";
import { MiniSite } from "@/components/mini-site";
import { getPlanList } from "@/lib/app-settings";
import { featuresOf, getPlanOverrides } from "@/lib/entitlements";
import { formatNumber } from "@/lib/format";
import { resolveFeatures } from "@/lib/plans";
import { buildPublicMenu } from "@/lib/public-menu";
import { ensureDemoData } from "@/lib/seed";
import { getAuth } from "@/lib/auth";
import { getPublicFaqs, getPublicPosts, getPublicTestimonials } from "@/lib/marketing-content";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Pricing } from "@/components/marketing/pricing";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { PlatformEventBeacon } from "@/components/marketing/platform-event-beacon";
import "@/components/marketing/marketing.css";
export const dynamic = "force-dynamic";
const solutions = [
  { icon: QrCode, title: "منویی که همیشه تازه است", text: "تصویر، قیمت و موجودی را به‌روز کنید؛ مشتری همان لحظه آخرین منو را روی موبایل خود می‌بیند.", label: "منوی دیجیتال و QR", className: "solution-menu" },
  { icon: ChefHat, title: "هر سفارش، سر جای خودش", text: "صندوق، گارسون و آشپزخانه را به هم وصل کنید. از ثبت سفارش تا آماده‌سازی و تحویل، مسیر روشن است.", label: "سفارش‌گیری یکپارچه", className: "solution-orders" },
  { icon: ChartNoAxesCombined, title: "تصمیم بهتر با عددهای روشن", text: "فروش، هزینه‌ها و موجودی انبار را کنار هم ببینید و مدیریت روزانه را با دید بازتری پیش ببرید.", label: "حسابداری و انبار", className: "solution-finance" },
];
const fallbackFaqs = [
  ["مشتری برای دیدن منو باید برنامه نصب کند؟", "خیر. کافی است QR روی میز را اسکن کند یا لینک منو را باز کند. منو در مرورگر موبایل نمایش داده می‌شود."],
  ["آیا امکانات پلن‌ها متفاوت است؟", "بله. در صفحه تعرفه‌ها می‌توانید تمام امکانات و تفاوت پلن‌ها را مشاهده کنید. دسترسی هر امکان طبق پلن انتخابی شما تعیین می‌شود."],
  ["تعرفه‌ها چگونه محاسبه می‌شوند؟", "اشتراک به صورت شش‌ماهه یا سالانه ارائه می‌شود. مبلغ نمایش داده‌شده برای کل دوره است و تخفیف فعال همان دوره در آن محاسبه شده است."],
  ["قبل از انتخاب می‌توانم سامانه را ببینم؟", "بله. منوی نمونه را باز کنید یا برای نمایش بخش‌های مدیریتی، درخواست دموی رایگان ثبت کنید."],
];
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

  await ensureDemoData();
  const [auth, plans, overrides, faqRows, testimonials, posts] = await Promise.all([getAuth(), getPlanList(), getPlanOverrides(), getPublicFaqs(), getPublicTestimonials(3), getPublicPosts(3)]);
  const matrix = Object.fromEntries(plans.map(p=>[p.key,resolveFeatures(p.key,null,overrides)]));
  const faqs = faqRows.length ? faqRows.slice(0,5).map(f=>[f.question,f.answer]) : fallbackFaqs;
  return <div className="marketing-site"><PlatformEventBeacon name="home_view"/><SiteHeader/><main>
    <section className="market-hero"><div className="market-container hero-grid"><div className="hero-copy"><span className="eyebrow"><span className="status-dot"/> برای کافه‌ها و رستوران‌های رو به رشد</span><h1>طعم خوب از شما،<br/><em>نظم کار با ما.</em></h1><p>از منوی روی میز تا سفارش در آشپزخانه؛<br className="desktop-break"/> رستوران‌تان را از یک جای ساده و یکپارچه مدیریت کنید.</p><div className="hero-actions"><Link href={auth ? "/dashboard" : "/preview"} className="btn market-button">{auth ? "ورود به داشبورد" : "دموی تعاملی منو"}<ArrowUpLeft size={19}/></Link><Link href="/demo" className="btn market-secondary">درخواست نمایش همراه کارشناس</Link></div>{!auth && <Link href="/register?trial=demo" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">شروع دموی رایگان <ArrowUpLeft size={16}/></Link>}<div className="hero-assurances"><span>منوی دیجیتال</span><i/><span>سفارش‌گیری</span><i/><span>حسابداری و انبار</span></div></div><DashboardPreview/></div><div className="market-container hero-bottom"><span>یک همراه، برای تمام بخش‌های کسب‌وکار</span><div><span><Coffee size={19}/> کافه</span><span><UtensilsCrossed size={19}/> رستوران</span><span><ChefHat size={19}/> فودکورت</span><span><ReceiptText size={19}/> بیرون‌بر</span></div></div></section>
    <section id="features" className="market-container market-section"><div className="section-heading split-heading"><div><span className="eyebrow">کمتر درگیر جزئیات، بیشتر کنار مشتری</span><h2>پشت یک تجربهٔ خوب،<br/>یک مدیریت خوب است.</h2></div><p>ابزارهای روزانهٔ شما در کنار هم قرار می‌گیرند؛<br/>تا برای مهم‌ترین بخش کار، وقت بیشتری داشته باشید.</p></div><div className="solutions-grid">{solutions.map(({icon:Icon,...s})=><article key={s.title} className={`solution-card ${s.className}`}><div className="solution-art"><Icon size={48} strokeWidth={1.25}/><span>{s.label}</span>{s.className==="solution-menu" ? <div className="mini-menu"><span>اسپرسو دبل <b>۸۵٬۰۰۰</b></span><span>کاپوچینو <b>۱۱۵٬۰۰۰</b></span><span>چیزکیک <b>۱۵۵٬۰۰۰</b></span></div> : s.className==="solution-orders" ? <div className="mini-flow"><span>ثبت</span><ArrowLeft size={14}/><span>آماده‌سازی</span><ArrowLeft size={14}/><span>تحویل</span></div> : <div className="mini-bars" aria-hidden="true">{[35,55,42,75,60,90,78].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div>}</div><div className="solution-copy"><h3>{s.title}</h3><p>{s.text}</p><Link href="/plans#comparison">امکانات این بخش <ArrowUpLeft size={16}/></Link></div></article>)}</div></section>
    <section className="workflow-section"><div className="market-container workflow-grid"><div><span className="eyebrow">از سلام مشتری تا خداحافظی</span><h2>همهٔ تیم،<br/><em>در یک مسیر.</em></h2><p>فرقی ندارد سفارش از روی میز ثبت شود یا پشت صندوق؛ هر بخش اطلاعات مورد نیاز خودش را در اختیار دارد.</p><Link href="/tutorials" className="workflow-link">با سامانه آشنا شوید <ArrowUpLeft size={19}/></Link></div><ol className="workflow-steps">{[[QrCode,"۰۱","منو را به دست مشتری برسانید","منوی تصویری، دسته‌بندی و قیمت‌های به‌روز، با یک اسکن."],[ReceiptText,"۰۲","سفارش را به جریان بیندازید","ثبت سفارش توسط مشتری، گارسون یا صندوق، متناسب با پلن."],[ChefHat,"۰۳","آماده کنید و تحویل دهید","مدیریت وضعیت سفارش‌ها و ارسال اقلام به بخش آماده‌سازی."],[ChartNoAxesCombined,"۰۴","روز را با دید روشن تمام کنید","گزارش فروش، حسابداری و کنترل موجودی در پلن‌های مربوط."]].map(([I,n,title,desc])=>{const Icon=I as typeof QrCode;return <li key={String(n)}><span className="step-icon"><Icon size={22}/></span><div><small>{String(n)}</small><h3>{String(title)}</h3><p>{String(desc)}</p></div></li>})}</ol></div></section>
    <section className="market-container module-strip"><div><CalendarDays/><h3>جای مهمان‌تان محفوظ</h3><p>رزرو میز با امکان تنظیم پیش‌پرداخت</p></div><div><Wallet/><h3>حساب‌ها مرتب‌تر</h3><p>پرداخت، هزینه و اسناد در کنار هم</p></div><div><Layers/><h3>موجودی زیر نظر شما</h3><p>ثبت ورود و خروج و کنترل مواد اولیه</p></div></section>
    <section id="pricing" className="market-container market-section"><div className="section-heading centered"><span className="eyebrow">انتخابی به اندازهٔ کسب‌وکار شما</span><h2>از یک منوی ساده،<br/><em>تا مدیریت یکپارچه.</em></h2><p>دورهٔ اشتراک را انتخاب کنید. قیمت و تخفیف هر پلن، شفاف و مشخص است.</p></div><Pricing plans={plans} matrix={matrix}/></section>
    {testimonials.length>0 && <section className="testimonials-section"><div className="market-container"><div className="section-heading split-heading"><div><span className="eyebrow">از زبان همراهان ما</span><h2>تجربه‌ای که تعریف می‌شود.</h2></div><Link href="/testimonials" className="text-link">همه تجربه‌ها <ArrowUpLeft size={18}/></Link></div><div className="testimonials-grid">{testimonials.map(t=><article key={t.id}><div className="rating-stars" aria-label={`امتیاز ${t.rating} از ۵`}>{Array.from({length:5},(_,i)=><Star key={i} size={15} fill={i<t.rating ? "currentColor" : "none"}/>)}</div><blockquote>«{t.body}»</blockquote><div className="quote-author"><span>{t.name.charAt(0)}</span><div><b>{t.name}</b><small>{[t.title,t.businessName].filter(Boolean).join(" · ")}</small></div></div></article>)}</div></div></section>}
    <section className="market-container market-section faq-grid"><div className="section-heading"><span className="eyebrow">پیش از شروع</span><h2>شاید سوال<br/>شما هم باشد.</h2><p>برای انتخاب راهکار مناسب رستوران‌تان،<br/>کنارتان هستیم.</p><Link href="/consultation" className="text-link">با ما صحبت کنید <ArrowUpLeft size={18}/></Link></div><div className="faq-list">{faqs.map(([q,a],i)=><details className="collapse collapse-plus" key={q}><summary className="collapse-title"><span>{formatNumber(i+1).padStart(2,"۰")}</span>{q}</summary><div className="collapse-content"><p>{a}</p></div></details>)}<Link href="/faq" className="text-link">همه سوالات متداول <ArrowUpLeft size={17}/></Link></div></section>
    {posts.length>0 && <section className="market-container market-section journal-section"><div className="section-heading split-heading"><div><span className="eyebrow">مجلهٔ منوی دیجیتال</span><h2>برای بهتر اداره کردن.</h2></div><Link href="/blog" className="text-link">همه مقاله‌ها <ArrowUpLeft size={18}/></Link></div><div className="journal-grid">{posts.map(post=><Link key={post.id} href={`/blog/${post.slug}`} className="journal-card"><div className="journal-art"><BookOpen size={40}/><span>{post.category}</span></div><div><small>{post.category}</small><h3>{post.title}</h3><p>{post.excerpt}</p><span className="text-link">خواندن مقاله <ArrowUpLeft size={17}/></span></div></Link>)}</div></section>}
    <section className="market-container closing-section"><div className="closing-card"><div><span className="eyebrow">فصل تازهٔ کسب‌وکار شما</span><h2>میز بعدی،<br/>برای یک شروع تازه.</h2><p>بیایید ببینیم منوی دیجیتال چطور به رستوران شما کمک می‌کند.</p><div className="hero-actions"><Link href="/register?trial=demo" className="btn market-button">شروع دموی رایگان <ArrowUpLeft size={18}/></Link><Link href="/demo" className="btn market-secondary">درخواست نمایش همراه کارشناس</Link></div></div><div className="table-art" aria-hidden="true"><div className="plate"><UtensilsCrossed size={66} strokeWidth={1}/><span>یک تجربهٔ بهتر</span></div><div className="table-seat seat-one"/><div className="table-seat seat-two"/></div></div></section>
  </main><SiteFooter/></div>;
}
