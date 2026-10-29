"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpLeft, BarChart3, BookOpen, Bot, CakeSlice, Camera, Check, CheckCheck, Coffee, FileText, ImagePlus, LayoutTemplate, List, Menu as MenuIcon, MoveHorizontal, Pizza, Plus, QrCode, RotateCw, Sparkles, TrendingUp, UtensilsCrossed, WandSparkles } from "lucide-react";
import { toFa } from "@/lib/format";
import styles from "./ai-page.module.css";

const methods = [
  { id: "list", label: "از فهرست غذاها", icon: List, title: "فهرست شما، منوی مرتب", text: "نام غذاها را وارد کنید و پیش‌نویسی از قلم‌ها، قیمت‌ها و دسته‌های پیشنهادی بگیرید؛ بعد هر مورد را مطابق منوی واقعی‌تان اصلاح کنید.", rows: [["قهوه", "اسپرسو · لاته · آمریکانو"], ["صبحانه", "املت · پنکیک · تست آووکادو"], ["دسر", "چیزکیک · براونی"]] },
  { id: "photo", label: "از عکس منوی فعلی", icon: Camera, title: "از روی عکس، به منوی آنلاین", text: "نام، دسته و قیمت‌های خوانای منوی کاغذی را به پیش‌نویس تبدیل کنید؛ نتیجه را پیش از ثبت، خط‌به‌خط بازبینی کنید.", rows: [["خواندن ردیف‌ها", "نام و قیمت قابل تشخیص"], ["دسته‌بندی اولیه", "پیشنهاد برای مرتب‌سازی"], ["بازبینی", "ویرایش پیش از ثبت"]] },
  { id: "description", label: "نوشتن توضیحات غذا", icon: FileText, title: "توضیحی که انتخاب را آسان می‌کند", text: "برای هر محصول یک متن پیشنهادی بسازید، لحنش را انتخاب کنید و پیش از ذخیره، مواد و ادعاهای آن را خودتان بررسی کنید.", rows: [["چیزبرگر دوبل", "گوشت گریل‌شده، پنیر و سس خانگی"], ["لاته وانیلی", "اسپرسوی تازه با شیر و عطر وانیل"], ["سالاد فصل", "سبزی تازه با چاشنی لیمویی"]] },
  { id: "image", label: "ساخت و بهبود عکس", icon: ImagePlus, title: "برای منو عکس یکدست بسازید", text: "برای محصول بی‌عکس تصویر بسازید یا عکس موجود را بهبود دهید؛ تصویر را ببینید و فقط در صورت تأیید نگه دارید.", rows: [["نور و رنگ", "متعادل و خوش‌خوان"], ["کادر", "تمرکز روی غذا"], ["بازبینی", "انتخاب نهایی با شما"]] },
];

const menuChoices = [
  { id: "print", icon: BookOpen, title: "منوی چاپی", tag: "آشنای همیشگی", fit: "مناسب منویی که کم تغییر می‌کند و بیشتر روی میز در دسترس است.", detail: "برای تغییر قیمت یا اقلام، فایل منو باید اصلاح و دوباره چاپ شود؛ سفارش و تغییرات لحظه‌ای در خود برگه ثبت نمی‌شوند.", points: ["خواندن ساده و بدون گوشی", "هزینهٔ بازچاپ هنگام تغییر", "بدون پیوند مستقیم به سفارش آنلاین"] },
  { id: "digital", icon: LayoutTemplate, title: "منوی دیجیتال معمولی", tag: "مدیریت روزمره", fit: "مناسب کسب‌وکاری که می‌خواهد منو را آنلاین و همیشه به‌روز نگه دارد.", detail: "اقلام و قیمت‌ها را از پنل ویرایش کنید و منو را با لینک یا QR در اختیار مشتری بگذارید؛ محتوا را خودتان وارد و مرتب می‌کنید.", points: ["ویرایش آنلاین منو", "دسترسی از QR و لینک", "ورود و نگهداری محتوا با تیم شما"] },
  { id: "ai", icon: Bot, title: "منوی دیجیتال با هوش مصنوعی", tag: "شروع سریع‌تر", fit: "مناسب تیمی که می‌خواهد آماده‌سازی منو و محتوای محصول را سریع‌تر انجام دهد.", detail: "از فهرست یا تصویر منو پیش‌نویس بگیرید، توضیح و تصویر محصول آماده کنید و بعد از بازبینی خودتان منتشر کنید.", points: ["کمک به ساخت پیش‌نویس منو", "پیشنهاد متن و تصویر محصول", "تأیید نهایی و انتشار با شما"] },
];

const businessMenus = {
  cafe: { label: "کافه", icon: Coffee, menu: "منوی کافه آبان", categories: ["قهوهٔ گرم", "نوشیدنی سرد", "شیرینی"], items: [["لاته وانیلی", "۱۵۵ هزار تومان", "قهوهٔ تازه · شیر · وانیل"], ["آیس‌موکا", "۱۷۵ هزار تومان", "اسپرسو · شکلات · یخ"], ["کروسان کره‌ای", "۹۵ هزار تومان", "خمیر لایه‌ای · کره"]] },
  restaurant: { label: "رستوران", icon: UtensilsCrossed, menu: "منوی رستوران نارنج", categories: ["پیش‌غذا", "غذای اصلی", "نوشیدنی"], items: [["چلو جوجه زعفرانی", "۳۴۵ هزار تومان", "مرغ مزه‌دار · برنج ایرانی"], ["کباب لقمه", "۳۹۵ هزار تومان", "گوشت تازه · گوجه کبابی"], ["سالاد فصل", "۱۴۵ هزار تومان", "سبزی روز · چاشنی لیمو"]] },
  fastfood: { label: "فست‌فود", icon: Pizza, menu: "منوی برگرخانهٔ هفت", categories: ["برگر", "پیتزا", "کنار غذا"], items: [["چیزبرگر دوبل", "۲۸۵ هزار تومان", "گوشت گریل · پنیر چدار"], ["پیتزا پپرونی", "۳۵۰ هزار تومان", "خمیر تازه · پنیر · پپرونی"], ["سیب‌زمینی ویژه", "۱۲۵ هزار تومان", "سیب‌زمینی · ادویهٔ دست‌ساز"]] },
} as const;

function MenuPhone() {
  const items = [[Coffee, "لاته وانیلی", "۱۵۵٬۰۰۰"], [UtensilsCrossed, "کروسان کره‌ای", "۹۵٬۰۰۰"], [CakeSlice, "چیزکیک روز", "۱۳۵٬۰۰۰"]] as const;
  return <div className={styles.phone}><div className={styles.phoneNotch}/><div className={styles.phoneTop}><span>منوی کافه آبان</span><QrCode size={15}/></div><div className={styles.phoneCover}><span>منوی امروز</span><i><Sparkles size={22}/></i></div><div className={styles.phoneCategories}><span>همه</span><span>قهوه</span><span>صبحانه</span></div>{items.map(([Icon, name, price]) => <div className={styles.phoneProduct} key={name}><span><Icon size={19}/></span><div><b>{name}</b><small>{price} تومان</small></div><button type="button" aria-label={`افزودن ${name}`}><Plus size={14}/></button></div>)}<div className={styles.phoneOrder}><MenuIcon size={14}/> مشاهده سبد خرید <b>۲ قلم</b></div></div>;
}

export function AiPageInteractions() {
  const [active, setActive] = useState(0);
  const [activeChoice, setActiveChoice] = useState("ai");
  const [business, setBusiness] = useState<keyof typeof businessMenus>("cafe");
  const [studioRun, setStudioRun] = useState(0);
  const [orders, setOrders] = useState(80);
  const [rate, setRate] = useState(10);
  const [price, setPrice] = useState(60);
  const current = methods[active];
  const selectedChoice = menuChoices.find((choice) => choice.id === activeChoice) ?? menuChoices[2];
  const studio = businessMenus[business];
  const BusinessIcon = studio.icon;
  const estimate = useMemo(() => orders * 30 * (rate / 100) * price * 1000, [orders, rate, price]);
  return <>
    <section className={styles.comparison} id="menu-types">
      <div className={styles.container}>
        <div className={styles.sectionIntro}><span className={styles.kicker}>انتخابی متناسب با شیوهٔ کار شما</span><h2>منوی چاپی، منوی دیجیتال معمولی یا منوی دیجیتال با هوش مصنوعی؟</h2><p>هر سه راه می‌توانند بخشی از تجربهٔ مشتری باشند؛ تفاوت در به‌روزرسانی، آماده‌سازی محتوا و مسیر سفارش است. برای دیدن جزئیات هر گزینه، آن را انتخاب کنید.</p></div>
        <div className={styles.choiceGrid} role="tablist" aria-label="مقایسهٔ انواع منو">
          {menuChoices.map(({ id, icon: Icon, title, tag }) => <button key={id} type="button" role="tab" aria-selected={activeChoice === id} aria-controls="menu-choice-detail" onClick={() => setActiveChoice(id)} className={`${styles.choiceCard} ${activeChoice === id ? styles.choiceCardActive : ""}`}>
            <span className={styles.choiceIcon}><Icon size={21}/></span><span className={styles.choiceTitle}>{title}</span><span className={styles.choiceTag}>{tag}</span><span className={styles.choiceSelect}>{activeChoice === id ? <Check size={15}/> : <ArrowUpLeft size={15}/>}</span>
          </button>)}
        </div>
        <div className={styles.choiceDetail} id="menu-choice-detail" role="tabpanel" aria-live="polite" key={selectedChoice.id}>
          <div className={styles.choiceDetailCopy}><span className={styles.detailEyebrow}><Sparkles size={14}/>مناسب برای شما اگر</span><h3>{selectedChoice.fit}</h3><p>{selectedChoice.detail}</p></div>
          <ul>{selectedChoice.points.map((point) => <li key={point}><Check size={15}/>{point}</li>)}</ul>
          {selectedChoice.id === "ai" && <Link className={styles.textCta} href="#builders">دیدن روش‌های طراحی با هوش مصنوعی <ArrowUpLeft size={16}/></Link>}
        </div>
        <p className={styles.choiceNote}>هوش مصنوعی در این صفحه برای آماده‌سازی پیش‌نویس و محتوا معرفی می‌شود؛ قیمت، مواد تشکیل‌دهنده و متن نهایی را پیش از انتشار بررسی کنید.</p>
      </div>
    </section>

    <section className={styles.methods} id="builders">
      <div className={styles.sectionIntro}><span className={styles.kicker}>برای هر منو، یک نقطهٔ شروع</span><h2>طراحی منو با هوش مصنوعی برای کافه، رستوران و فست فود</h2><p>نوع کسب‌وکار را انتخاب کنید و روند آماده‌شدن یک پیش‌نمایش را ببینید؛ از فهرست یا عکس منو تا توضیح محصول. خروجی این صحنه نمونهٔ نمایشی است و در این صفحه به سرویس تولید متصل نیست.</p></div>
      <div className={styles.studio}>
        <div className={styles.studioControls}>
          <span className={styles.studioLabel}><WandSparkles size={15}/>استودیوی نمایشی طراحی منو</span>
          <p>نمونهٔ محتوا و دسته‌ها با تغییر نوع کسب‌وکار عوض می‌شوند. برای دیدن دوبارهٔ حرکت‌ها، پیش‌نمایش را اجرا کنید.</p>
          <div className={styles.businessTabs} role="tablist" aria-label="نوع کسب‌وکار">
            {(Object.keys(businessMenus) as Array<keyof typeof businessMenus>).map((key) => { const Icon = businessMenus[key].icon; return <button key={key} type="button" role="tab" aria-selected={business === key} aria-controls="ai-studio-preview" onClick={() => setBusiness(key)} className={business === key ? styles.businessTabActive : ""}><Icon size={15}/>{businessMenus[key].label}</button>; })}
          </div>
          <button className={styles.replayButton} type="button" onClick={() => setStudioRun((run) => run + 1)}><RotateCw size={15}/>اجرای دوبارهٔ پیش‌نمایش</button>
          <div className={styles.studioStages} aria-live="polite"><span><i>۱</i>دریافت فهرست نمونه</span><span><i>۲</i>مرتب‌سازی دسته‌ها</span><span><i>۳</i>نمایش منو برای بازبینی</span></div>
          <small className={styles.studioDisclaimer}>این صحنه انیمیشن رابط کاربری است؛ محصول، قیمت یا اطلاعاتی را ذخیره یا منتشر نمی‌کند.</small>
        </div>
        <div className={styles.studioCanvas} id="ai-studio-preview" role="tabpanel" aria-label={`پیش‌نمایش منوی ${studio.label}`}>
          <div className={styles.studioGlow}/>
          <div className={styles.studioSource} key={`${business}-${studioRun}`}>
            <span className={styles.sourceBadge}><List size={13}/>فهرست ورودی</span><b>{studio.label}</b><span>{studio.categories.join(" · ")}</span><i><BusinessIcon size={18}/></i>
          </div>
          <div className={styles.studioConnector} aria-hidden="true"><span/><span/><span/></div>
          <div className={styles.studioResult} key={`result-${business}-${studioRun}`}>
            <div className={styles.resultHead}><div><small>پیش‌نمایش قابل ویرایش</small><b>{studio.menu}</b></div><span><Sparkles size={15}/>AI</span></div>
            <div className={styles.resultCategories}>{studio.categories.map((category) => <span key={category}>{category}</span>)}</div>
            <div className={styles.resultItems}>{studio.items.map(([name, amount, detail], index) => <div className={styles.resultItem} key={name} style={{ "--item-index": index } as CSSProperties}><span className={styles.resultFood}><BusinessIcon size={17}/></span><span className={styles.resultItemCopy}><b>{name}</b><small>{detail}</small></span><strong>{amount}</strong><Check size={14}/></div>)}</div>
            <div className={styles.resultFoot}><span><Check size={13}/>پیش‌نویس آمادهٔ بازبینی</span><span>قیمت‌ها را شما تأیید می‌کنید</span></div>
          </div>
          <div className={`${styles.studioSpark} ${styles.studioSparkOne}`}><Sparkles size={15}/></div><div className={`${styles.studioSpark} ${styles.studioSparkTwo}`}><Check size={13}/></div>
        </div>
      </div>
      <div className={styles.builderHeading}><span className={styles.kicker}>چه چیزی را آماده می‌کنید؟</span><p>یکی از مسیرهای طراحی را انتخاب کنید تا جزئیات و پیش‌نمایش آن را ببینید.</p></div>
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

    <section className={styles.how} id="how-it-works"><div className={styles.sectionIntro}><span className={styles.kicker}>شما همیشه تصمیم‌گیرنده‌اید</span><h2>از پیش‌نویس تا اولین سفارش، با کنترل خودتان</h2><p>هوش مصنوعی کار آماده‌سازی را سبک می‌کند؛ انتشار و تجربهٔ مشتری همچنان دست شماست.</p></div><div className={styles.steps}><article><span>۰۱</span><List size={22}/><h3>از هر ورودی شروع کنید</h3><p>نام غذاها را بنویسید، عکس منو را انتخاب کنید یا سراغ توضیح و تصویر یک محصول بروید.</p></article><article><span>۰۲</span><WandSparkles size={22}/><h3>پیشنهاد را دقیق کنید</h3><p>نام، دسته، قیمت، شرح و تصویر را با اطلاعات واقعی کسب‌وکارتان تطبیق دهید.</p></article><article><span>۰۳</span><QrCode size={22}/><h3>با تأیید خودتان منتشر کنید</h3><p>محصول را فعال کنید و لینک یا QR منو را به مشتری بدهید؛ چیزی بی‌اجازه منتشر نمی‌شود.</p></article></div></section>

    <section className={styles.capabilities} id="after-publish"><div className={styles.sectionIntro}><span className={styles.kicker}>همراه هوشمند، در تمام مسیر منو</span><h2>چه کارهایی را برایتان سبک‌تر می‌کند؟</h2><p>قابلیت‌های AI و ابزارهای داده‌محور را کنار هم ببینید؛ هر کدام روشن و با نقش مشخص.</p></div><div className={styles.capabilityGrid}>
      <article><span><List size={19}/></span><small className={styles.capabilityType}>ساخت منو</small><h3>فهرست غذا را به پیش‌نویس تبدیل کنید</h3><p>نام‌ها و قیمت‌های ورودی را مرتب کنید و یک نقطهٔ شروع برای منوی دیجیتال بسازید؛ جزئیات نهایی را خودتان کامل کنید.</p></article>
      <article><span><Camera size={19}/></span><small className={styles.capabilityType}>خواندن منو</small><h3>از عکس منوی فعلی شروع کنید</h3><p>اقلام قابل‌خواندن را از تصویر بیرون بکشید و قبل از ثبت، نام و قیمت هر مورد را کنترل کنید.</p></article>
      <article><span><FileText size={19}/></span><small className={styles.capabilityType}>محتوای محصول</small><h3>برای غذا توضیح آماده کنید</h3><p>متن پیشنهادی بسازید، با لحن برندتان هماهنگ کنید و بعد از بازبینی در صفحهٔ محصول ذخیره کنید.</p></article>
      <article><span><ImagePlus size={19}/></span><small className={styles.capabilityType}>تصویر محصول</small><h3>تصویر بسازید یا بهبود دهید</h3><p>برای آیتم منو تصویر تازه آماده کنید یا عکس موجود را اصلاح کنید؛ انتخاب و تأیید نهایی با شماست.</p></article>
      <article><span><BarChart3 size={19}/></span><small className={styles.capabilityType}>بینش داده‌ای</small><h3>نبض فروش را در پنل ببینید</h3><p>مرور فروش اخیر، میانگین سفارش، زمان‌های پرتردد، اقلام پرفروش و موارد نیازمند توجه به تصمیم‌گیری کمک می‌کند.</p></article>
      <article><span><TrendingUp size={19}/></span><small className={styles.capabilityType}>پیشنهاد داده‌محور</small><h3>آیتم‌های مکمل را بهتر بچینید</h3><p>ترکیب خریدهای ثبت‌شده و قواعد انتخابی شما برای پیشنهاد آیتم همراه به کار می‌آیند؛ این بخش دستیار مولد متن نیست.</p></article>
    </div><div className={styles.capabilityNote}><Sparkles size={17}/><p><b>روشن و قابل اعتماد:</b> محتوای ساخته‌شده پیش‌نویس است؛ تحلیل فروش و پیشنهادهای مکمل از داده و تنظیمات شما کمک می‌گیرند.</p></div></section>

    <section className={styles.calculator} id="estimate"><div className={styles.container}><div className={styles.calculatorGrid}><div className={styles.calculatorIntro}><span className={styles.kicker}>یک تخمین ساده، با عددهای خودتان</span><h2>پیشنهاد مکمل چقدر فروش اضافه می‌سازد؟</h2><p>این محاسبهٔ نمونه بر پایهٔ تعداد پذیرش پیشنهادی است؛ نتیجهٔ واقعی به منو، قیمت و رفتار مشتری وابسته است.</p><div className={styles.calculatorDisclaimer}>تخمین فروش ناخالص است؛ سود خالص یا تضمین درآمد محسوب نمی‌شود.</div></div><div className={styles.calculatorPanel}>
      {[["سفارش در روز", orders, setOrders, 10, 400, 10], ["نرخ پذیرش پیشنهاد", rate, setRate, 1, 50, 1], ["میانگین قیمت پیشنهاد (هزار تومان)", price, setPrice, 10, 300, 5]].map(([label, value, setter, min, max, step]) => <label className={styles.sliderRow} key={String(label)}><span><b>{String(label)}</b><strong>{toFa(Number(value))}{label === "نرخ پذیرش پیشنهاد" ? "٪" : ""}</strong></span><input aria-label={String(label)} type="range" min={Number(min)} max={Number(max)} step={Number(step)} value={Number(value)} onChange={(event) => (setter as (v: number) => void)(Number(event.target.value))}/></label>)}
      <div className={styles.estimate}><small>فروش اضافهٔ ماهانهٔ تخمینی</small><strong>{formatToman(estimate)}</strong><span>{toFa(orders)} سفارش × ۳۰ روز × {toFa(rate)}٪ × {toFa(price)} هزار تومان</span></div><Link className={styles.textCta} href="/dashboard/cross-sell">تنظیم پیشنهاد مکمل <ArrowUpLeft size={16}/></Link>
    </div></div></div></section>
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
