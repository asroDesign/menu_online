import Link from "next/link";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { MenuClient } from "@/components/menu-client";
import { getPlanList } from "@/lib/app-settings";
import { formatNumber } from "@/lib/format";
import { MiniSite } from "@/components/mini-site";
import { featuresOf } from "@/lib/entitlements";
import { buildPublicMenu } from "@/lib/public-menu";
import { ensureDemoData, DEMO_SLUG } from "@/lib/seed";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: "📱", title: "منوی دیجیتال با QR", text: "برای هر میز یک QR اختصاصی؛ مشتری اسکن می‌کند، منوی تصویری را می‌بیند و سفارش می‌دهد." },
  { icon: "🧑‍🍳", title: "پنل سفارش‌گیری گارسون", text: "انتخاب میز، لمس محصولات و ارسال لحظه‌ای سفارش به آشپزخانه؛ بدون کاغذ و بدون اشتباه." },
  { icon: "🗂️", title: "کاتالوگ محصولات", text: "دسته‌بندی، قیمت، تخفیف، ایموجی و تصویر برای هر آیتم. با یک کلیک ناموجود یا ویژه کنید." },
  { icon: "📊", title: "داشبورد فروش", text: "فروش روزانه، پرفروش‌ترین‌ها، میانگین سفارش و وضعیت میزها را زنده ببینید." },
  { icon: "🪑", title: "مدیریت میز و سالن", text: "سالن، تراس و VIP تعریف کنید؛ میزهای اشغال و آزاد با رنگ مشخص هستند." },
  { icon: "🧾", title: "جریان سفارش حرفه‌ای", text: "از «جدید» تا «پرداخت»؛ وضعیت هر سفارش را با یک لمس تغییر دهید." },
];

const PLANS = [
  { name: "پایه", tag: "منو و کاتالوگ", price: "۲٬۹۹۰٬۰۰۰", old: "۳٬۴۹۰٬۰۰۰", items: ["راه‌اندازی اولیه رایگان", "منوی دیجیتال و QR نامحدود", "کاتالوگ محصولات", "دسته‌بندی و تخفیف", "پشتیبانی تیکتی ۲۴/۷"] },
  { name: "پرمیوم", tag: "سفارشگیر و گارسون", price: "۱۱٬۹۹۰٬۰۰۰", old: "۱۳٬۹۹۰٬۰۰۰", popular: true, items: ["همه امکانات پلن پایه", "پنل سفارش‌گیری گارسون", "داشبورد آماده‌سازی", "ثبت سفارش، پیش‌سفارش، بیرون‌بر", "گزارش‌گیری فروش"] },
  { name: "پرمیوم پلاس", tag: "برندهای زنجیره‌ای", price: "۱۹٬۹۹۰٬۰۰۰", old: "۲۴٬۹۹۰٬۰۰۰", items: ["همه امکانات پلن پرمیوم", "وب‌سایت اختصاصی برند", "دامنه .com و .ir رایگان", "چند شعبه", "اولویت پشتیبانی"] },
];

const FAQ = [
  ["منوی دیجیتال چیست؟", "نسخه آنلاین منوی شماست که مشتری از طریق QR کد یا لینک، بدون نصب برنامه به آن دسترسی دارد؛ همیشه به‌روز و بدون هزینه چاپ."],
  ["آیا فقط برای رستوران و کافه است؟", "خیر. هر کسب‌وکاری با محصول یا خدمات، از گل‌فروشی تا سالن زیبایی، می‌تواند از آن به‌عنوان کاتالوگ آنلاین استفاده کند."],
  ["آیا برای مشاهده و مدیریت نرم‌افزار لازم است؟", "نه. همه‌چیز وب‌اپلیکیشن است و روی موبایل، تبلت و کامپیوتر کار می‌کند."],
  ["چطور سفارش‌ها به گارسون می‌رسد؟", "سفارش مشتری یا گارسون بلافاصله در بخش سفارش‌ها نمایش داده می‌شود و می‌توانید وضعیت آن را تا پرداخت پیش ببرید."],
];

export default async function Home() {
  const livePlans = await getPlanList();
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
  const auth = await getAuth();
  const cta = auth ? { href: "/dashboard", label: "ورود به داشبورد" } : { href: "/register", label: "شروع رایگان" };

  return (
    <div className="bg-white">
      <nav className="sticky top-0 z-40 border-b border-stone-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-500 text-lg text-white shadow-lg shadow-brand-500/30">🍽️</span>
            <span className="text-lg font-extrabold">منوی دیجیتال</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-stone-600 md:flex">
            <a href="#features" className="hover:text-brand-600">امکانات</a>
            <a href="#pricing" className="hover:text-brand-600">تعرفه‌ها</a>
            <a href="#faq" className="hover:text-brand-600">سوالات متداول</a>
          </div>
          <div className="flex items-center gap-2">
            {!auth && <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">ورود</Link>}
            <Link href={cta.href} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800">{cta.label}</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -start-32 top-10 size-96 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-4 py-1.5 text-xs font-bold text-brand-700">✨ کاتالوگ آنلاین · منوی QR · سفارش گارسون</span>
            <h1 className="mt-6 text-4xl leading-[1.35] font-black tracking-tight text-stone-900 sm:text-5xl">
              منوی کافه و رستوران‌تان را <span className="text-brand-500">دیجیتال</span> کنید و سفارش‌گیری را هوشمند
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-9 text-stone-600">
              مشتری با اسکن QR میز، منوی تصویری شما را می‌بیند و سفارش می‌دهد؛ گارسون و آشپزخانه همان لحظه مطلع می‌شوند و شما همه‌چیز را از یک داشبورد مدیریت می‌کنید.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={cta.href} className="rounded-2xl bg-brand-500 px-7 py-3.5 font-bold text-white shadow-xl shadow-brand-500/30 transition hover:bg-brand-600">{cta.label}</Link>
              <Link href="/restaurants" className="rounded-2xl bg-white px-7 py-3.5 font-bold text-stone-800 ring-1 ring-stone-200 transition hover:bg-stone-50">رستوران‌ها 🍴</Link>
              <Link href={`/m/${DEMO_SLUG}?table=3`} className="rounded-2xl bg-white px-7 py-3.5 font-bold text-stone-800 ring-1 ring-stone-200 transition hover:bg-stone-50">مشاهده منوی نمونه 👀</Link>
            </div>
            <div className="mt-10 flex gap-8 text-sm">
              {[["+۱۰ سال", "تجربه سفارشگیر"], ["۹۹٫۹٪", "پایداری سرویس"], ["۲۴/۷", "پشتیبانی"]].map(([a, b]) => (
                <div key={b}><p className="text-xl font-black text-stone-900">{a}</p><p className="text-stone-500">{b}</p></div>
              ))}
            </div>
          </div>

          {/* Phone mock */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -end-6 top-16 z-10 hidden rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-100 sm:block">
              <p className="text-[11px] text-stone-500">سفارش جدید · میز ۳</p>
              <p className="mt-1 text-sm font-extrabold">۳ آیتم · ۷۸۵٬۰۰۰ تومان</p>
              <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">در انتظار تأیید</span>
            </div>
            <div className="absolute -start-6 bottom-24 z-10 hidden rounded-2xl bg-stone-900 p-3 text-white shadow-xl sm:block">
              <p className="text-[11px] text-stone-400">فروش امروز</p>
              <p className="text-sm font-extrabold">۴٬۲۸۰٬۰۰۰ تومان</p>
              <p className="text-[10px] text-emerald-400">▲ ۱۸٪ نسبت به دیروز</p>
            </div>
            <div className="rounded-[2.5rem] bg-stone-900 p-3 shadow-2xl">
              <div className="overflow-hidden rounded-[2rem] bg-[#f6f5f3]">
                <div className="bg-gradient-to-br from-brand-500 to-brand-700 px-5 pb-6 pt-8 text-white">
                  <div className="flex items-center gap-3"><span className="flex size-12 items-center justify-center rounded-xl bg-white text-2xl">🌸</span><div><p className="font-extrabold">کافه رستوران نیلوفر</p><p className="text-[11px] text-white/80">🪑 میز ۳ · سالن اصلی</p></div></div>
                </div>
                <div className="-mt-3 space-y-2.5 rounded-t-3xl bg-[#f6f5f3] p-4">
                  <div className="flex gap-2 text-xs font-semibold"><span className="rounded-full bg-brand-500 px-3 py-1.5 text-white">☕ قهوه</span><span className="rounded-full bg-white px-3 py-1.5 text-stone-600">🍕 پیتزا</span><span className="rounded-full bg-white px-3 py-1.5 text-stone-600">🍰 دسر</span></div>
                  {[["☕", "کاپوچینو", "۱۱۵٬۰۰۰", "/food/coffee.jpg"], ["🍕", "پیتزا پپرونی", "۲۹۵٬۰۰۰", "/food/pizza.jpg"], ["🍰", "چیزکیک نیویورکی", "۱۵۵٬۰۰۰", "/food/dessert.jpg"]].map(([e, n, p, img]) => (
                    <div key={n} className="flex gap-3 rounded-2xl bg-white p-2.5 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={e} className="size-16 rounded-xl object-cover" />
                      <div className="flex-1"><p className="text-sm font-bold">{n}</p><p className="mt-5 text-xs font-extrabold">{p} تومان</p></div>
                      <span className="flex size-8 items-center justify-center self-end rounded-lg bg-brand-500 text-white">+</span>
                    </div>
                  ))}
                  <div className="rounded-2xl bg-brand-500 p-3.5 text-center text-sm font-bold text-white">مشاهده و ثبت سفارش · ۵۶۵٬۰۰۰ تومان</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold text-brand-600">امکانات</p>
          <h2 className="mt-2 text-3xl font-black">همه‌چیز برای مدیریت منو و سفارش</h2>
          <p className="mt-4 leading-8 text-stone-500">از ساخت منو تا تحویل سفارش و گزارش فروش، در یک پلتفرم یکپارچه.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl bg-stone-50 p-6 ring-1 ring-stone-100 transition hover:-translate-y-1 hover:bg-white hover:shadow-xl">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-stone-100">{f.icon}</span>
              <h3 className="mt-4 text-lg font-extrabold">{f.title}</h3>
              <p className="mt-2 text-sm leading-7 text-stone-500">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-stone-900 py-20 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-black">در سه قدم آنلاین شوید</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[["۱", "ثبت‌نام و ساخت منو", "دسته‌بندی‌ها و محصولات را با قیمت و تصویر اضافه کنید."], ["۲", "چاپ QR میزها", "برای هر میز QR اختصاصی بسازید و روی میز بگذارید."], ["۳", "دریافت سفارش", "سفارش مشتری و گارسون را در داشبورد مدیریت کنید."]].map(([n, t, d]) => (
              <div key={n} className="rounded-3xl bg-white/5 p-7 ring-1 ring-white/10">
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-500 text-lg font-black">{n}</span>
                <h3 className="mt-5 text-lg font-extrabold">{t}</h3>
                <p className="mt-2 text-sm leading-7 text-stone-400">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
        <div className="text-center">
          <p className="text-sm font-bold text-brand-600">تعرفه سالانه</p>
          <h2 className="mt-2 text-3xl font-black">پلنی متناسب با اندازه کسب‌وکار شما</h2>
          <span className="mt-4 inline-block rounded-full bg-rose-50 px-4 py-1 text-xs font-bold text-rose-600">۱۵٪ تخفیف ویژه</span>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p, pi) => (
            <div key={p.name} className={`relative rounded-3xl p-7 ring-1 ${p.popular ? "bg-stone-900 text-white shadow-2xl ring-stone-900 lg:-translate-y-3" : "bg-white ring-stone-200"}`}>
              {p.popular && <span className="absolute -top-3 start-7 rounded-full bg-brand-500 px-3 py-1 text-xs font-bold text-white">محبوب‌ترین</span>}
              <h3 className="text-xl font-black">{p.name}</h3>
              <p className={`mt-1 text-sm ${p.popular ? "text-stone-400" : "text-stone-500"}`}>{p.tag}</p>
              <p className="mt-6 text-sm line-through opacity-50">{formatNumber(livePlans[pi]?.oldPrice ?? 0)} تومان</p>
              <p className="text-3xl font-black">{formatNumber(livePlans[pi]?.price ?? 0)} <span className="text-sm font-medium opacity-70">تومان / سال</span></p>
              <ul className="mt-6 space-y-3 text-sm">
                {p.items.map((i) => (
                  <li key={i} className="flex items-start gap-2.5"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] text-white">✓</span>{i}</li>
                ))}
              </ul>
              <Link href={cta.href} className={`mt-8 block rounded-xl py-3 text-center text-sm font-bold ${p.popular ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-stone-900 text-white hover:bg-stone-800"}`}>{cta.label}</Link>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-5 pb-20">
        <h2 className="mb-8 text-center text-3xl font-black">سوالات متداول</h2>
        <div className="space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl bg-stone-50 p-5 ring-1 ring-stone-100 open:bg-white open:shadow-md">
              <summary className="flex list-none items-center justify-between font-bold">{q}<span className="text-brand-500 transition group-open:rotate-45">＋</span></summary>
              <p className="mt-3 text-sm leading-8 text-stone-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl rounded-[2rem] bg-gradient-to-br from-brand-500 to-brand-700 p-10 text-center text-white shadow-2xl shadow-brand-500/30 sm:p-14">
          <h2 className="text-3xl font-black">آماده‌اید منوی خود را آنلاین کنید؟</h2>
          <p className="mx-auto mt-4 max-w-xl leading-8 text-white/90">همین حالا با حساب دمو داشبورد را با داده‌های واقعی ببینید یا حساب خودتان را بسازید.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={cta.href} className="rounded-2xl bg-white px-7 py-3.5 font-bold text-brand-700 hover:bg-brand-50">{cta.label}</Link>
            {!auth && <Link href="/login" className="rounded-2xl bg-white/15 px-7 py-3.5 font-bold text-white ring-1 ring-white/40 hover:bg-white/25">ورود با حساب دمو</Link>}
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-100 py-8 text-center text-sm text-stone-500">© منوی دیجیتال — پلتفرم کاتالوگ، منوی QR و سفارش‌گیری گارسون</footer>
    </div>
  );
}
