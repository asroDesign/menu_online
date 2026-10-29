"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpLeft, CakeSlice, Camera, Check, CheckCheck, Clock3, Coffee, FileText, ImagePlus, List, Menu as MenuIcon, MoveHorizontal, Pizza, Plus, QrCode, Sparkles, TrendingUp, UtensilsCrossed, WandSparkles } from "lucide-react";
import { toFa } from "@/lib/format";
import styles from "./ai-page.module.css";

const methods = [
  { id: "list", label: "از فهرست غذاها", icon: List, title: "فهرست شما، منوی مرتب", text: "اسم و قیمت‌ها را وارد کنید؛ دسته‌بندی اولیه و جایگاه هر قلم را در پیش‌نویس ببینید.", rows: [["قهوه", "اسپرسو · لاته · آمریکانو"], ["صبحانه", "املت · پنکیک · تست آووکادو"], ["دسر", "چیزکیک · براونی"]] },
  { id: "photo", label: "از عکس منوی فعلی", icon: Camera, title: "از روی عکس، به منوی آنلاین", text: "متن و قیمت‌های خوانای منوی کاغذی را استخراج کنید و نتیجه را پیش از ثبت اصلاح کنید.", rows: [["خواندن ردیف‌ها", "نام و قیمت قابل تشخیص"], ["مرتب‌سازی", "دسته‌های پیشنهادی"], ["بازبینی", "ویرایش پیش از ثبت"]] },
  { id: "description", label: "نوشتن توضیحات غذا", icon: FileText, title: "توضیحی که انتخاب را آسان می‌کند", text: "برای محصول، توضیح کوتاه بسازید و مواد و طعم را پیش از انتشار بررسی و ویرایش کنید.", rows: [["چیزبرگر دوبل", "گوشت گریل‌شده، پنیر و سس خانگی"], ["لاته وانیلی", "اسپرسوی تازه با شیر و عطر وانیل"], ["سالاد فصل", "سبزی تازه با چاشنی لیمویی"]] },
  { id: "image", label: "ساخت و بهبود عکس", icon: ImagePlus, title: "برای منو عکس یکدست بسازید", text: "برای قلم بی‌عکس، تصویر پیشنهادی بسازید یا روشنایی و ظاهر عکس موجود را بهبود دهید.", rows: [["نور", "متعادل و طبیعی"], ["کادر", "تمرکز روی غذا"], ["سبک", "یکدست با هویت منو"]] },
];

function MenuPhone() {
  const items = [[Coffee, "لاته وانیلی", "۱۵۵٬۰۰۰"], [UtensilsCrossed, "کروسان کره‌ای", "۹۵٬۰۰۰"], [CakeSlice, "چیزکیک روز", "۱۳۵٬۰۰۰"]] as const;
  return <div className={styles.phone}><div className={styles.phoneNotch}/><div className={styles.phoneTop}><span>منوی کافه آبان</span><QrCode size={15}/></div><div className={styles.phoneCover}><span>منوی امروز</span><i><Sparkles size={22}/></i></div><div className={styles.phoneCategories}><span>همه</span><span>قهوه</span><span>صبحانه</span></div>{items.map(([Icon, name, price]) => <div className={styles.phoneProduct} key={name}><span><Icon size={19}/></span><div><b>{name}</b><small>{price} تومان</small></div><button type="button" aria-label={`افزودن ${name}`}><Plus size={14}/></button></div>)}<div className={styles.phoneOrder}><MenuIcon size={14}/> مشاهده سبد خرید <b>۲ قلم</b></div></div>;
}

export function AiPageInteractions() {
  const [active, setActive] = useState(0);
  const [orders, setOrders] = useState(80);
  const [rate, setRate] = useState(10);
  const [price, setPrice] = useState(60);
  const current = methods[active];
  const estimate = useMemo(() => orders * 30 * (rate / 100) * price * 1000, [orders, rate, price]);
  return <>
    <section className={styles.methods} id="builders">
      <div className={styles.sectionIntro}><span className={styles.kicker}>از هر جا شروع کنید</span><h2>۴ روش برای ساخت منوی دیجیتال</h2><p>فهرست ساده یا عکس منوی فعلی؛ خروجی را پیش از ثبت، خودتان بازبینی می‌کنید.</p></div>
      <div className={styles.builderTabs} role="tablist" aria-label="روش‌های ساخت منو با هوش مصنوعی">{methods.map(({ label, icon: Icon }, index) => <button key={label} type="button" role="tab" id={`ai-method-tab-${index}`} aria-selected={active === index} aria-controls="ai-method-panel" onClick={() => setActive(index)} className={active === index ? styles.activeTab : ""}><Icon size={16}/>{label}</button>)}</div>
      <div className={styles.builderPanel} id="ai-method-panel" role="tabpanel" aria-labelledby={`ai-method-tab-${active}`} key={current.id}>
        <div className={styles.panelCopy}><span className={styles.panelIndex}>{["۰۱", "۰۲", "۰۳", "۰۴"][active]} / ۰۴</span><h3>{current.title}</h3><p>{current.text}</p><ul>{current.rows.map(([title, detail]) => <li key={title}><Check size={15}/><span><b>{title}</b><small>{detail}</small></span></li>)}</ul><Link className={styles.textCta} href="/dashboard/ai">شروع در پنل <ArrowUpLeft size={16}/></Link></div>
        <div className={styles.panelVisual} aria-label={`پیش‌نمایش ${current.label}`}>
          {active === 0 && <div className={styles.listPreview}><div className={styles.previewToolbar}><span>پیش‌نویس منو</span><span>۳ دسته · ۸ قلم</span></div>{current.rows.map(([title, detail], index) => { const CategoryIcon = [Coffee, UtensilsCrossed, CakeSlice][index]; return <div className={styles.listCategory} key={title}><span className={styles.categoryIcon}><CategoryIcon size={18}/></span><div><b>{title}</b><small>{detail}</small></div><CheckCheck size={16}/></div>; })}<div className={styles.previewReady}><Check size={14}/> آمادهٔ بازبینی و ویرایش</div></div>}
          {active === 1 && <div className={styles.photoPreview}><div className={styles.paperMenu}><small>کافه آبان</small><b>منوی نوشیدنی</b><span>لاته ............. ۱۵۵</span><span>اسپرسو .......... ۹۵</span><span>آیس‌موکا ........ ۱۷۵</span><span>چای سبز .......... ۸۰</span></div><div className={styles.scanBeam}><Sparkles size={16}/></div><div className={styles.extractedMenu}><b>آیتم‌های شناسایی‌شده</b>{current.rows.map(([title, detail]) => <span key={title}><Check size={13}/>{title}<small>{detail}</small></span>)}</div></div>}
          {active === 2 && <div className={styles.descriptionPreview}><div className={styles.foodCard}><div className={styles.foodArt}><UtensilsCrossed size={36}/></div><div><small>غذای ویژه</small><b>چیزبرگر دوبل</b><strong>۲۸۵٬۰۰۰ تومان</strong></div></div><div className={styles.generatedCopy}><span><Sparkles size={13}/> توضیح پیشنهادی</span><p>دو لایه گوشت گریل‌شده، پنیر چدار و سس مخصوص در نان برشته؛ انتخابی سیرکننده با طعمی آشنا.</p><small>قابل ویرایش · هنوز منتشر نشده</small></div></div>}
          {active === 3 && <div className={styles.imagePreview}><div className={styles.imageCompare}><div className={styles.imageBefore}><span>قبل</span><i><Pizza size={76}/></i></div><div className={styles.imageAfter}><span>بعد از بهبود</span><i><Pizza size={76}/></i></div><div className={styles.compareDivider}><MoveHorizontal size={18}/></div></div><div className={styles.imageCaption}><Sparkles size={15}/><span>نور، رنگ و کادر آمادهٔ بازبینی</span></div></div>}
        </div>
      </div>
    </section>

    <section className={styles.how} id="how-it-works"><div className={styles.sectionIntro}><span className={styles.kicker}>از ثبت‌نام تا اولین سفارش</span><h2>سه قدم تا منوی آماده</h2><p>محتوا را وارد کنید، اصلاح کنید و بعد از آماده‌شدن منتشر کنید.</p></div><div className={styles.steps}><article><span>۰۱</span><List size={22}/><h3>فهرست یا عکس را بدهید</h3><p>فهرست غذاها را بنویسید یا تصویر واضح منوی فعلی را انتخاب کنید.</p></article><article><span>۰۲</span><WandSparkles size={22}/><h3>خروجی را بازبینی کنید</h3><p>دسته، توضیح و قیمت را پیش از ثبت اصلاح کنید؛ نتیجه خودکار منتشر نمی‌شود.</p></article><article><span>۰۳</span><QrCode size={22}/><h3>منو را آمادهٔ مشتری کنید</h3><p>محصول‌ها را تأیید و فعال کنید؛ لینک و QR منوی آنلاین را در اختیار مشتری بگذارید.</p></article></div></section>

    <section className={styles.capabilities} id="after-publish"><div className={styles.sectionIntro}><span className={styles.kicker}>بعد از ساخت منو</span><h2>ابزارهای متصل برای فروش روزانه</h2><p>پیشنهاد مکمل، تحلیل و سفارش در ادامهٔ مسیر منوی شما قرار می‌گیرند.</p></div><div className={styles.capabilityGrid}>
      <article><span><Sparkles size={19}/></span><h3>پیشنهاد آیتم مکمل</h3><p>محصولات همراه را با قواعد مدیر و خریدهای ثبت‌شده پیشنهاد کنید؛ انتخاب نهایی و ثبت سفارش دست مشتری است.</p></article>
      <article><span><Clock3 size={19}/></span><h3>موجودی و وضعیت منو</h3><p>دسترسی محصول را از پنل مدیریت کنید؛ قلم ناموجود را غیرفعال کنید تا مشتری نتواند سفارش دهد.</p></article>
      <article><span><TrendingUp size={19}/></span><h3>بینش فروش و انبار</h3><p>پرفروش‌ها، اقلام کم‌فروش، میانگین سفارش و هشدار موجودی را در پنل ببینید.</p></article>
      <article><span><CheckCheck size={19}/></span><h3>شناخت مشتریان</h3><p>مشتری تازه، مشتری بازگشته و معرفی‌های ثبت‌شده را در گزارش باشگاه دنبال کنید.</p></article>
      <article><span><FileText size={19}/></span><h3>پیشنهاد متن محصول</h3><p>توضیح محصول را تولید کنید، بازبینی کنید و فقط با اقدام مدیر روی محصول ذخیره کنید.</p></article>
      <article><span><QrCode size={19}/></span><h3>سفارش آنلاین و QR</h3><p>مشتری از منوی آنلاین سفارش ثبت می‌کند؛ سفارش طبق تنظیمات به صندوق و مسیر آماده‌سازی می‌رسد.</p></article>
    </div></section>

    <section className={styles.calculator} id="estimate"><div className={styles.calculatorIntro}><span className={styles.kicker}>یک تخمین ساده، با عددهای خودتان</span><h2>پیشنهاد مکمل چقدر فروش اضافه می‌سازد؟</h2><p>این محاسبهٔ نمونه بر پایهٔ تعداد پذیرش پیشنهادی است؛ نتیجهٔ واقعی به منو، قیمت و رفتار مشتری وابسته است.</p><div className={styles.calculatorDisclaimer}>تخمین فروش ناخالص است؛ سود خالص یا تضمین درآمد محسوب نمی‌شود.</div></div><div className={styles.calculatorPanel}>
      {[["سفارش در روز", orders, setOrders, 10, 400, 10], ["نرخ پذیرش پیشنهاد", rate, setRate, 1, 50, 1], ["میانگین قیمت پیشنهاد (هزار تومان)", price, setPrice, 10, 300, 5]].map(([label, value, setter, min, max, step]) => <label className={styles.sliderRow} key={String(label)}><span><b>{String(label)}</b><strong>{toFa(Number(value))}{label === "نرخ پذیرش پیشنهاد" ? "٪" : ""}</strong></span><input aria-label={String(label)} type="range" min={Number(min)} max={Number(max)} step={Number(step)} value={Number(value)} onChange={(event) => (setter as (v: number) => void)(Number(event.target.value))}/></label>)}
      <div className={styles.estimate}><small>فروش اضافهٔ ماهانهٔ تخمینی</small><strong>{formatToman(estimate)}</strong><span>{toFa(orders)} سفارش × ۳۰ روز × {toFa(rate)}٪ × {toFa(price)} هزار تومان</span></div><Link className={styles.textCta} href="/dashboard/cross-sell">تنظیم پیشنهاد مکمل <ArrowUpLeft size={16}/></Link>
    </div></section>
  </>;
}

function formatToman(value: number) {
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value)} تومان`;
}

export function AiMenuHeroVisual() {
  return <div className={styles.heroVisual}>
    <div className={styles.heroVisualTop}><span><i/> پیش‌نمایش منوی آماده</span><span>MenuPeak AI</span></div>
    <div className={styles.heroOrbit} aria-hidden="true"><span className={styles.orbitNode}><List size={15}/></span><span className={styles.orbitNode}><Sparkles size={15}/></span><span className={styles.orbitNode}><ImagePlus size={15}/></span><span className={styles.orbitLine}/><span className={styles.orbitLineTwo}/><div className={styles.orbitCore}><WandSparkles size={23}/><b>AI</b></div></div>
    <MenuPhone/>
    <div className={styles.heroToast}><Check size={15}/>پیش‌نویس آماده شد <small>۶ قلم · قابل ویرایش</small></div>
  </div>;
}
