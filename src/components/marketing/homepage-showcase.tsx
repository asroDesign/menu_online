"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { ArrowDownUp, Banknote, Beef, BellRing, CalendarDays, ChartNoAxesCombined, Check, ChefHat, ChevronLeft, CircleCheck, Coffee, Gift, Heart, Landmark, Leaf, Milk, Pizza, QrCode, ReceiptText, ShoppingBag, Sparkles, Star, TrendingUp, UsersRound, WalletCards, Weight, Wheat } from "lucide-react";
import { cn } from "@/components/ui";

const scenes = [
  { id: "reports", label: "فروش زنده", icon: ChartNoAxesCombined },
  { id: "costing", label: "انبار و قیمت", icon: ChefHat },
  { id: "loyalty", label: "باشگاه مشتریان", icon: Heart },
  { id: "accounting", label: "حسابداری", icon: ReceiptText },
  { id: "menu", label: "منوی دیجیتال", icon: Coffee },
  { id: "reservation", label: "رزرو میز", icon: CalendarDays },
];

const salesToman = [635_000, 418_000, 724_000, 512_000];
const salesProducts = ["پیتزا چهار فصل", "آیس لاته", "چیزکیک سن‌سباستین", "پاستا آلفردو"];
const numberFa = new Intl.NumberFormat("fa-IR");
const motionPreference = "(prefers-reduced-motion: reduce)";
const subscribeToMotionPreference = (onChange: () => void) => {
  const query = window.matchMedia(motionPreference);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const getMotionPreference = () => window.matchMedia(motionPreference).matches;
const getServerMotionPreference = () => false;
const usePrefersReducedMotion = () => useSyncExternalStore(subscribeToMotionPreference, getMotionPreference, getServerMotionPreference);

function LiveSalesScene({ total, orders, pulse, toast }: { total: number; orders: number; pulse: number; toast: { id: number; amount: number; number: number; name: string } | null }) {
  const bars = [34, 47, 40, 63, 55, 78, 68, 91].map((height, index) => index > 5 ? Math.min(96, height + pulse % 5 * 2) : height);
  const points = bars.map((height, index) => `${34 + index * 56},${149 - height * 1.12}`).join(" ");
  return <div className="hp-live-scene">
    <div className="hp-live-heading"><div><span className="hp-live-kicker"><i/> گزارش لحظه‌ای فروش</span><h2>امروز چه خبر است؟</h2></div>{toast ? <div key={toast.id} role="status" aria-live="polite" className="hp-sale-toast"><span className="hp-sale-toast-icon"><BellRing size={16}/></span><span><b>یک فروش تازه ثبت شد</b><small>سفارش #{numberFa.format(toast.number)} · {toast.name}</small></span><strong>+{numberFa.format(toast.amount)}</strong></div> : <span className="hp-live-window">امروز <ChevronLeft size={13}/></span>}</div>
    <div className="hp-live-stats">
      <article className="hp-live-stat hp-live-stat-primary"><span>فروش امروز</span><strong key={total} className="hp-count-up">{numberFa.format(total)}</strong><small><TrendingUp size={13}/> ۱۸٪ بیشتر از دیروز</small></article>
      <article className="hp-live-stat"><span>سفارش‌های ثبت‌شده</span><strong key={orders} className="hp-count-up">{numberFa.format(orders)}</strong><small>سفارش موفق امروز</small></article>
      <article className="hp-live-stat"><span>میانگین فاکتور</span><strong>{numberFa.format(Math.round(total / Math.max(orders, 1)))}</strong><small>تومان برای هر سفارش</small></article>
    </div>
    <div className="hp-chart-card">
      <div className="hp-chart-head"><div><b>روند فروش امروز</b><span>به‌روزرسانی خودکار</span></div><span className="hp-chart-legend"><i/> فروش <i className="hp-legend-line"/> روند</span></div>
      <div className="hp-chart-wrap" role="img" aria-label="نمودار میله‌ای رنگی روند فروش امروز، با افزایش در ساعات اخیر">
        <svg viewBox="0 0 480 190" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="hpChartBars" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4F80F5"/><stop offset="100%" stopColor="#A7C2FF"/></linearGradient><linearGradient id="hpChartArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#F59E0B" stopOpacity=".22"/><stop offset="100%" stopColor="#F59E0B" stopOpacity="0"/></linearGradient></defs>
          {[22, 58, 94, 130, 166].map((y) => <line key={y} x1="25" x2="465" y1={y} y2={y} stroke="#EAF0FA" strokeWidth="1"/>)}
          <path d={`M34 ${149 - bars[0] * 1.12} ${bars.map((height, index) => `L${34 + index * 56} ${149 - height * 1.12}`).join(" ")} L426 166 L34 166Z`} fill="url(#hpChartArea)"/>
          {bars.map((height, index) => <rect key={index} className="hp-chart-bar" x={19 + index * 56} y={166 - height * 1.12} width="29" height={height * 1.12} rx="7" fill="url(#hpChartBars)" style={{ animationDelay: `${index * 55}ms` }}/>) }
          <polyline points={points} fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          {bars.map((height, index) => <circle key={`dot-${index}`} cx={34 + index * 56} cy={149 - height * 1.12} r="3.5" fill="#fff" stroke="#F59E0B" strokeWidth="2"/>)}
        </svg>
      </div>
      <div className="hp-chart-axis"><span>۱۰</span><span>۱۲</span><span>۱۴</span><span>۱۶</span><span>۱۸</span><span>۲۰</span><span>۲۲</span></div>
    </div>
    <div className="hp-live-footer"><span><i/> فروش‌ها به‌صورت خودکار در گزارش به‌روز می‌شوند</span><span>دادهٔ نمونهٔ نمایشی</span></div>
  </div>;
}

type CostPhase = "weighing" | "dough" | "meat" | "cheese" | "seasoning" | "profit" | "price" | "photo" | "phone";

const ingredients = [
  { key: "dough", name: "خمیر پیتزا", amount: "۲۵۰ گرم", cost: "۱۲٬۰۰۰", icon: Wheat, color: "cream" },
  { key: "meat", name: "گوشت مزه‌دار", amount: "۱۸۰ گرم", cost: "۱۲۶٬۰۰۰", icon: Beef, color: "rose" },
  { key: "cheese", name: "پنیر موزارلا", amount: "۱۲۰ گرم", cost: "۷۵٬۷۰۰", icon: Milk, color: "gold" },
  { key: "seasoning", name: "ادویه و سبزی معطر", amount: "۱۲ گرم", cost: "۸٬۵۰۰", icon: Leaf, color: "mint" },
];

const costPhaseProgress: Record<CostPhase, number> = { weighing: 0, dough: 1, meat: 2, cheese: 3, seasoning: 4, profit: 4, price: 4, photo: 4, phone: 4 };
const costPhaseLabels: Record<CostPhase, string> = {
  weighing: "۱ · وزن‌کشی مواد",
  dough: "۲ · خمیر وارد ظرف می‌شود",
  meat: "۳ · گوشت اضافه می‌شود",
  cheese: "۴ · پنیر روی مواد می‌نشیند",
  seasoning: "۵ · ادویه و سبزی معطر",
  profit: "۶ · جمع هزینه و حاشیه سود",
  price: "۷ · پیشنهاد قیمت فروش",
  photo: "۸ · افزودن عکس پیتزا به منو",
  phone: "۹ · نمایش آیتم در منوی موبایل",
};

const costPipeline = ["مواد و رسپی", "حاشیهٔ سود", "قیمت فروش", "عکس در منو", "نمایش موبایل"];
const costPipelineStep: Record<CostPhase, number> = {
  weighing: 0,
  dough: 0,
  meat: 0,
  cheese: 0,
  seasoning: 0,
  profit: 1,
  price: 2,
  photo: 3,
  phone: 4,
};

function IngredientPricingScene({ phase }: { phase: CostPhase }) {
  const completedCount = costPhaseProgress[phase];
  const activeIngredient = phase === "dough" || phase === "meat" || phase === "cheese" || phase === "seasoning" ? phase : null;
  return <div className={cn("hp-cost-scene", `is-${phase}`)}>
    <div className="hp-cost-heading"><div><span className="hp-cost-kicker"><Weight size={13}/> تحلیل خودکار مواد اولیه</span><h2>از انبار تا قیمت منو</h2></div><span className="hp-cost-step">{costPhaseLabels[phase]}</span></div>
    <ol className="hp-cost-process" aria-label={`فرایند انبار تا منو، مرحلهٔ ${costPipelineStep[phase] + 1} از ${costPipeline.length}`}>
      {costPipeline.map((label, index) => <li key={label} className={cn(index < costPipelineStep[phase] && "is-complete", index === costPipelineStep[phase] && "is-current")} aria-current={index === costPipelineStep[phase] ? "step" : undefined}><span>{numberFa.format(index + 1)}</span><b>{label}</b></li>)}
    </ol>
    <div className="hp-cost-workspace">
      <div className="hp-ingredient-list" aria-label="مواد اولیه در حال وزن‌کشی">
        {ingredients.map(({ key, name, amount, cost, icon: IngredientIcon, color }, index) => {
          const added = index < completedCount;
          const activeIngredientRow = key === activeIngredient;
          return <div key={key} className={cn("hp-ingredient-row", `hp-ingredient-${color}`, added && "is-added", activeIngredientRow && "is-active")}>
            <span className="hp-ingredient-icon"><IngredientIcon size={15}/></span><span className="hp-ingredient-copy"><b>{name}</b><small>بهای سهم · {cost} تومان</small></span><strong>{amount}</strong><span className="hp-weight-check"><Check size={12}/></span>
          </div>;
        })}
        <div className="hp-cost-total"><span>بهای هر پیتزا</span><b>۲۲۲٬۲۰۰ <small>تومان</small></b></div>
      </div>
      <div className="hp-pizza-workbench" data-phase={phase}>
        <span className="hp-workbench-label"><ChefHat size={13}/>{phase === "phone" ? "منوی مشتری" : phase === "photo" ? "تصویر محصول" : "میز آماده‌سازی"}</span>
        {(phase === "weighing" || phase === "dough" || phase === "meat" || phase === "cheese" || phase === "seasoning" || phase === "profit" || phase === "price") && <>
          <div className="hp-pizza-bowl" data-phase={phase} data-progress={completedCount}>
            <div className="hp-pizza-dough"><span className="hp-pizza-sauce"/><span className="hp-pizza-meat-layer"><i/><i/><i/><i/><i/></span><span className="hp-pizza-cheese-layer"><i/><i/><i/><i/><i/><i/><i/></span><span className="hp-pizza-herb-layer"><i/><i/><i/><i/><i/></span></div>
            {(phase === "meat" || phase === "cheese" || phase === "seasoning") && <div key={phase} className={`hp-falling-food hp-falling-${phase}`} aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>}
          </div>
          <span className="hp-pizza-bowl-caption">پیتزا چهار فصل · ۱ عدد</span>
        </>}
        <div className="hp-cost-output">
          {phase === "profit" && <div className="hp-profit-reveal"><div><span>بهای مواد</span><b>۲۲۲٬۲۰۰</b><small>۳۵٪ قیمت فروش</small></div><i><span>+</span></i><div><span>حاشیه سود هدف</span><b>۴۱۲٬۸۰۰</b><small>۶۵٪ قیمت فروش</small></div></div>}
          {phase === "price" && <div className="hp-price-zoom"><span>قیمت پیشنهادی منو</span><strong>۶۳۵٬۰۰۰ <small>تومان</small></strong><small>هزینه مواد + حاشیه سود هدف</small></div>}
          {phase === "photo" && <article className="hp-photo-menu-card"><div className="hp-photo-menu-image"><Image src="/images/marketing/pizza-four-seasons.webp" alt="پیتزای چهار فصل آماده برای منوی رستوران" width={260} height={170} sizes="(max-width: 640px) 35vw, 250px"/></div><div className="hp-photo-menu-copy"><span><CircleCheck size={12}/> عکس محصول ثبت شد</span><b>پیتزا چهار فصل</b><strong>۶۳۵٬۰۰۰ <small>تومان</small></strong></div></article>}
          {phase === "phone" && <div className="hp-cost-phone-wrap" aria-label="پیش‌نمایش آیتم پیتزا در منوی موبایل"><div className="hp-cost-phone"><div className="hp-cost-phone-camera"><i/></div><div className="hp-cost-phone-screen"><div className="hp-cost-phone-header"><span className="hp-cost-phone-logo"><Coffee size={10}/></span><span><b>کافه نارون</b><small>منوی آنلاین</small></span><ShoppingBag size={11}/></div><div className="hp-cost-phone-section"><span>پیشنهاد امروز</span><b>پیتزاها</b></div><article className="hp-cost-phone-product"><Image src="/images/marketing/pizza-four-seasons.webp" alt="پیتزای چهار فصل در منوی موبایل" width={230} height={130} sizes="140px"/><div><b>پیتزا چهار فصل</b><small>گوشت · موزارلا · ادویهٔ معطر</small><span><strong>۶۳۵٬۰۰۰</strong><i>+</i></span></div></article><div className="hp-cost-phone-bottom"><span>منو</span><span>سبد خرید</span><span>پروفایل</span></div></div></div></div>}
          {phase === "weighing" && <span className="hp-cost-hint">ترازو وزن هر ماده را ثبت می‌کند…</span>}
          {activeIngredient && <span className="hp-cost-hint">{activeIngredient === "dough" ? "خمیر داخل ظرف پهن می‌شود…" : activeIngredient === "meat" ? "گوشت روی خمیر پخش می‌شود…" : activeIngredient === "cheese" ? "پنیر روی لایهٔ گوشت می‌نشیند…" : "ادویه و سبزی معطر اضافه می‌شود…"}</span>}
        </div>
      </div>
    </div>
    <div className="hp-cost-foot"><span><i/> موجودی و بهای خرید از انبار خوانده می‌شود</span><span>قیمت با هر خرید تازه به‌روز می‌شود</span></div>
  </div>;
}

function CustomerAtTable({ pizzaServed }: { pizzaServed: boolean }) {
  return <svg className="hp-customer-art" viewBox="0 0 260 240" role="img" aria-label="مشتری خانمی پشت میز کافه">
    <defs><linearGradient id="hpWomanTop" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#FFAE85"/><stop offset="1" stopColor="#F77C72"/></linearGradient><linearGradient id="hpWomanHair" x1="0" x2="1"><stop stopColor="#553627"/><stop offset="1" stopColor="#9D5B37"/></linearGradient></defs>
    <ellipse cx="139" cy="218" rx="112" ry="12" fill="#DDE8FA"/>
    <path d="M71 190c1-39 22-64 55-64h22c32 0 53 25 54 64v22H71z" fill="url(#hpWomanTop)"/>
    <path d="M94 83c-6-25 9-49 37-52 31-4 49 18 43 51l-5 51h-66z" fill="url(#hpWomanHair)"/>
    <ellipse cx="132" cy="85" rx="34" ry="40" fill="#F6C6A5"/>
    <path d="M99 77c2-31 23-46 48-40 17 4 26 18 25 35-8-5-14-14-17-23-10 13-29 20-56 19z" fill="url(#hpWomanHair)"/>
    <path d="M103 103c7 19 20 28 29 28s23-9 30-28c-2 25-12 41-30 41-19 0-28-16-29-41z" fill="#EDAF8D"/>
    <circle cx="120" cy="88" r="2.2" fill="#513C35"/><circle cx="145" cy="88" r="2.2" fill="#513C35"/><path d="M124 106q8 6 16 0" fill="none" stroke="#B65D62" strokeWidth="2" strokeLinecap="round"/>
    <path d="M100 193c-17-12-28-26-37-39-5-7-16-3-14 6 5 22 21 42 44 52" fill="#F6C6A5"/><path d="M164 193c18-12 28-26 37-39 5-7 16-3 14 6-5 22-21 42-44 52" fill="#F6C6A5"/>
    <path d="M31 168h216l-18 17H48z" fill="#B8744A"/><path d="M50 183h178l-8 34H58z" fill="#D79665"/><path d="M54 187h171" stroke="#E9B286" strokeWidth="3"/>
    <ellipse cx="138" cy="163" rx="38" ry="11" fill="#EEF2FA" stroke="#D6DFF0" strokeWidth="2"/>
    {pizzaServed && <g className="hp-plate-pizza"><ellipse cx="138" cy="161" rx="26" ry="7" fill="#F5B643"/><circle cx="127" cy="159" r="3" fill="#D9554A"/><circle cx="144" cy="163" r="3" fill="#D9554A"/><circle cx="152" cy="158" r="2.5" fill="#367B4C"/><circle cx="135" cy="164" r="2.3" fill="#FFF3D0"/></g>}
    <path d="M31 143c-12-7-17-18-14-28" fill="none" stroke="#F3A344" strokeWidth="3" strokeLinecap="round"/><path d="M231 139c10-8 13-17 10-27" fill="none" stroke="#F3A344" strokeWidth="3" strokeLinecap="round"/>
  </svg>;
}

type MenuPhase = "browse" | "scrolling" | "checkout" | "flying" | "delivered";

function DigitalMenuScene({ phase, onOrder }: { phase: MenuPhase; onOrder: () => void }) {
  const phaseLabels: Record<MenuPhase, string> = { browse: "منو را ورق بزنید", scrolling: "انتخاب از منوی گوشی", checkout: "ثبت سفارش آنلاین", flying: "سفارش به‌سمت میز می‌آید", delivered: "پیتزا روی میز آماده است" };
  return <div className="hp-digital-scene" data-phase={phase}>
    <div className="hp-digital-heading"><div><span className="hp-menu-kicker"><QrCode size={13}/> از اسکن QR تا سفارش</span><h2>منو را ببین، سفارش بده، لذت ببر</h2></div><span className="hp-digital-status"><i/>{phaseLabels[phase]}</span></div>
    <div className="hp-digital-stage">
      <div className="hp-table-customer"><CustomerAtTable pizzaServed={phase === "delivered"}/><span className="hp-customer-caption"><span className="hp-customer-caption-dot"/> سفارش مستقیم سر میز</span></div>
      <div className="hp-phone-wrap" aria-label="پیش‌نمایش اسکرول منوی دیجیتال روی موبایل">
        <div className="hp-phone"><div className="hp-phone-frame-top"><span/><i/></div><div className="hp-phone-screen">
          <div className="hp-phone-header"><span className="hp-phone-logo"><Coffee size={12}/></span><span><b>کافه نارون</b><small>منوی امروز</small></span><span className="hp-phone-bag"><ShoppingBag size={13}/></span></div>
          <div className="hp-phone-scroll-area"><div className="hp-phone-scroll-content">
            <div className="hp-phone-welcome"><span>طعم خوب، حال خوب</span><b>چی میل دارید؟</b></div>
            <div className="hp-phone-category"><span>پیشنهاد امروز</span><span>پیتزا</span><span>نوشیدنی</span></div>
            <article className="hp-phone-product"><span className="hp-phone-food-art"><Image src="/images/marketing/pizza-four-seasons.webp" alt="" width={84} height={84} sizes="42px"/></span><span><b>پیتزا چهار فصل</b><small>گوشت · موزارلا · ادویهٔ معطر</small><strong>۶۳۵٬۰۰۰ تومان</strong></span><span className="hp-phone-add">+</span></article>
            <article className="hp-phone-product hp-phone-product-second"><span className="hp-phone-food-art hp-phone-drink"><Coffee size={23}/></span><span><b>آیس لاته</b><small>اسپرسو · شیر · یخ</small><strong>۱۲۸٬۰۰۰ تومان</strong></span><span className="hp-phone-add">+</span></article>
            <button type="button" className="hp-phone-order" onClick={onOrder}><ShoppingBag size={12}/> ثبت سفارش</button>
          </div></div>
          <div className="hp-phone-bottom"><span><Coffee size={13}/> منو</span><span><ShoppingBag size={13}/> سبد</span><span><UsersRound size={13}/> حساب</span></div>
        </div><span className="hp-phone-side-button"/></div>
      </div>
      <div className="hp-flying-pizza" aria-hidden="true"><Pizza size={44}/><Sparkles size={15}/></div>
      <span className="hp-order-trail" aria-hidden="true"><i/><i/><i/></span>
    </div>
    <div className="hp-digital-foot"><span><i/> اسکرول منو روی موبایل</span><span className="hp-order-confirm"><CircleCheck size={13}/>{phase === "delivered" ? "سفارش با موفقیت ثبت شد" : "پرداخت و پیگیری از پروفایل مشتری"}</span></div>
  </div>;
}

function ReservationScene() {
  return <div className="hp-reservation-scene">
    <div className="hp-reservation-heading"><div><span className="hp-reservation-kicker"><CalendarDays size={13}/> برنامهٔ امشب سالن</span><h2>رزروها را یک‌جا مدیریت کنید</h2></div><span className="hp-reservation-day">جمعه · ۲۶ مهر</span></div>
    <div className="hp-reservation-summary"><div><span>رزروهای امروز</span><b>۱۲ <small>میز</small></b></div><div><span>مهمان‌ها</span><b>۴۶ <small>نفر</small></b></div><div><span>ظرفیت باقی‌مانده</span><b>۳ <small>میز</small></b></div></div>
    <div className="hp-reservation-timeline">
      <div className="hp-time-label">۱۹:۰۰</div><div className="hp-reservation-line"><article className="hp-reservation-booking hp-booking-violet"><span className="hp-booking-time">۱۹:۰۰ · میز ۲</span><b>سارا محمدی</b><small>۲ مهمان · قرار دوستانه</small></article></div>
      <div className="hp-time-label">۲۰:۳۰</div><div className="hp-reservation-line"><article className="hp-reservation-booking hp-booking-blue"><span className="hp-booking-time">۲۰:۳۰ · میز ۶</span><b>مریم رضایی</b><small>۴ مهمان · پیش‌پرداخت ثبت شد</small><span className="hp-booking-confirm"><CircleCheck size={12}/> تأییدشده</span></article></div>
      <div className="hp-time-label">۲۲:۰۰</div><div className="hp-reservation-line"><article className="hp-reservation-booking hp-booking-mint"><span className="hp-booking-time">۲۲:۰۰ · میز ۴</span><b>امیر نادری</b><small>۳ مهمان · در انتظار تأیید</small></article></div>
    </div>
    <div className="hp-reservation-foot"><span><i/> زمان‌بندی سالن و ظرفیت میزها</span><span>اطلاع‌رسانی خودکار به مشتری</span></div>
  </div>;
}

type LoyaltyPhase = "purchase" | "points" | "return" | "reward";

const loyaltyPhaseLabels: Record<LoyaltyPhase, string> = {
  purchase: "ثبت خرید مشتری",
  points: "افزودن امتیاز به کیف پول",
  return: "بازگشت مشتری",
  reward: "استفاده از جایزه",
};

function LoyaltyScene({ phase }: { phase: LoyaltyPhase }) {
  const progress = phase === "purchase" ? 98 : phase === "points" ? 100 : phase === "return" ? 87 : 67;
  return <div className="hp-loyalty-scene" data-phase={phase}>
    <div className="hp-loyalty-heading"><div><span className="hp-loyalty-kicker"><Heart size={13}/> باشگاه مشتریان</span><h2>هر خرید، دلیلی برای بازگشت</h2></div><span className="hp-loyalty-phase"><i/>{loyaltyPhaseLabels[phase]}</span></div>
    <div className="hp-loyalty-stats">
      <article><span>مشتری جدید این ماه</span><b>۱۲۸ <small>نفر</small></b><i className="hp-loyalty-stat-icon hp-stat-blue"><UsersRound size={13}/></i></article>
      <article><span>مشتری برگشتی</span><b>۶۴٪ <small>از مشتریان</small></b><i className="hp-loyalty-stat-icon hp-stat-green"><TrendingUp size={13}/></i></article>
      <article><span>مشتری معرفی‌شده</span><b>۳۴ <small>نفر</small></b><i className="hp-loyalty-stat-icon hp-stat-gold"><Gift size={13}/></i></article>
    </div>
    <div className="hp-loyalty-workspace">
      <article className="hp-member-card">
        <div className="hp-member-top"><span className="hp-member-avatar">م</span><span><b>مریم رضایی</b><small>مشتری وفادار · ۸ خرید</small></span><span className="hp-member-tier"><Star size={10}/> طلایی</span></div>
        <div className="hp-member-order"><span className="hp-member-order-icon"><ShoppingBag size={13}/></span><span><b>{phase === "return" || phase === "reward" ? "مریم دوباره برگشت" : "پیتزا چهار فصل"}</b><small>{phase === "return" || phase === "reward" ? "سفارش تازه · همین الان" : "سفارش #۱۰۲۴ · ۶۳۵٬۰۰۰ تومان"}</small></span><span className="hp-member-order-check"><CircleCheck size={13}/></span></div>
        <div className="hp-points-wallet"><div className="hp-points-wallet-head"><span><WalletCards size={12}/> کیف پول امتیاز</span><b key={phase} className={phase === "points" ? "hp-points-pop" : ""}>{phase === "purchase" ? "۱٬۱۸۰" : phase === "points" ? "۱٬۲۴۳" : phase === "return" ? "۱٬۳۰۶" : "۱٬۰۰۶"} <small>امتیاز</small></b></div><div className="hp-points-progress"><i style={{ width: `${progress}%` }}/></div><div className="hp-points-caption"><span>{phase === "purchase" ? "۲۰ امتیاز تا جایزه" : phase === "points" ? "جایزهٔ تخفیف آزاد شد" : phase === "return" ? "۱۹۴ امتیاز تا جایزهٔ بعدی" : "۴۹۴ امتیاز تا جایزهٔ بعدی"}</span><span>{phase === "reward" ? "۳۰۰ امتیاز کسر شد" : phase === "points" ? "تخفیف ۱۰۰٬۰۰۰ تومان" : phase === "return" ? "هدف بعدی: ۱٬۵۰۰" : "هدف: ۱٬۲۰۰ امتیاز"}</span></div></div>
      </article>
      <div className="hp-loyalty-journey">
        <span className="hp-loyalty-journey-title">مسیر وفاداری مشتری</span>
        <div className="hp-loyalty-steps">
          <div className={phase !== "purchase" ? "is-complete" : "is-current"}><i><ShoppingBag size={12}/></i><span>خرید</span></div><span className="hp-loyalty-connector"/><div className={phase === "points" ? "is-current" : phase === "purchase" ? "" : "is-complete"}><i><Star size={12}/></i><span>امتیاز</span></div><span className="hp-loyalty-connector"/><div className={phase === "return" ? "is-current" : phase === "reward" ? "is-complete" : ""}><i><UsersRound size={12}/></i><span>بازگشت</span></div><span className="hp-loyalty-connector"/><div className={phase === "reward" ? "is-current" : ""}><i><Gift size={12}/></i><span>جایزه</span></div>
        </div>
        {phase === "purchase" && <div className="hp-loyalty-event"><span className="hp-loyalty-event-icon"><ShoppingBag size={14}/></span><span><b>سفارش مشتری ثبت شد</b><small>امتیاز خرید پس از تسویه محاسبه می‌شود</small></span></div>}
        {phase === "points" && <div key={phase} className="hp-loyalty-event is-points"><span className="hp-loyalty-event-icon"><Star size={14}/></span><span><b>+۶۳ امتیاز به کیف پول</b><small>بر اساس مبلغ خرید · ثبت خودکار</small></span><Sparkles size={15}/></div>}
        {phase === "return" && <div key={phase} className="hp-loyalty-event is-return"><span className="hp-loyalty-event-icon"><Heart size={14}/></span><span><b>مشتری برگشتی شناسایی شد</b><small>خرید نهم مریم در باشگاه ثبت شد</small></span><CircleCheck size={15}/></div>}
        {phase === "reward" && <div key={phase} className="hp-loyalty-event is-reward"><span className="hp-loyalty-event-icon"><Gift size={14}/></span><span><b>جایزه روی سفارش اعمال شد</b><small>تخفیف ۱۰۰٬۰۰۰ تومان · کسر ۳۰۰ امتیاز</small></span><Gift size={15}/></div>}
      </div>
    </div>
    <div className="hp-loyalty-foot"><span><i/> خرید، امتیاز، بازگشت و جایزه در یک مسیر</span><span>دادهٔ نمونهٔ نمایشی</span></div>
  </div>;
}

type AccountingPhase = "payment" | "routing" | "journal" | "balanced";

const accountingPhaseLabels: Record<AccountingPhase, string> = {
  payment: "دریافت مبلغ سفارش",
  routing: "تفکیک کارت و نقد",
  journal: "ثبت خودکار سند",
  balanced: "سند متوازن و نهایی",
};

function AccountingScene({ phase }: { phase: AccountingPhase }) {
  return <div className="hp-accounting-scene" data-phase={phase}>
    <div className="hp-accounting-heading"><div><span className="hp-accounting-kicker"><ReceiptText size={13}/> حسابداری متصل به فروش</span><h2>هر دریافت، سند خودش را دارد</h2></div><span className="hp-accounting-phase"><i/>{accountingPhaseLabels[phase]}</span></div>
    <div className="hp-accounting-payment"><div className="hp-accounting-sale"><span className="hp-accounting-sale-icon"><ShoppingBag size={14}/></span><span><b>فاکتور #۱۰۲۴</b><small>پیتزا چهار فصل · یک سفارش</small></span><strong>۶۳۵٬۰۰۰ <small>تومان</small></strong></div><div className="hp-payment-split"><div className="hp-payment-method hp-payment-pos"><span><Landmark size={13}/> کارتخوان POS-02</span><b>۴۵۰٬۰۰۰ <small>تومان</small></b></div><ArrowDownUp className="hp-payment-flow" size={15}/><div className="hp-payment-method hp-payment-cash"><span><Banknote size={13}/> صندوق نقدی</span><b>۱۸۵٬۰۰۰ <small>تومان</small></b></div><div className="hp-payment-total"><span>جمع دریافت</span><b>۶۳۵٬۰۰۰ <small>تومان</small></b></div></div></div>
    <div className="hp-journal-card">
      <div className="hp-journal-head"><span><ReceiptText size={13}/> سند حسابداری خودکار</span><b>سند شماره ۰۰۸۴</b></div>
      <div className="hp-journal-columns"><span>حساب / شرح</span><span>بدهکار</span><span>بستانکار</span></div>
      <div className="hp-journal-row is-debit"><span><i><Landmark size={11}/></i><span><b>بانک · کارتخوان POS-02</b><small>واریز به حساب تسویهٔ دستگاه</small></span></span><b>۴۵۰٬۰۰۰</b><em>—</em></div>
      <div className="hp-journal-row is-debit"><span><i><Banknote size={11}/></i><span><b>صندوق · دریافت نقدی</b><small>فروش سفارش #۱۰۲۴</small></span></span><b>۱۸۵٬۰۰۰</b><em>—</em></div>
      <div className="hp-journal-row is-credit"><span><i><ArrowDownUp size={11}/></i><span><b>درآمد فروش غذا</b><small>ثبت خودکار درآمد سفارش</small></span></span><em>—</em><b>۶۳۵٬۰۰۰</b></div>
      <div className="hp-journal-foot"><span className={phase === "balanced" || phase === "journal" ? "is-balanced" : ""}><CircleCheck size={13}/>{phase === "payment" || phase === "routing" ? "در انتظار تکمیل دریافت" : "سند متوازن شد"}</span><b>بدهکار ۶۳۵٬۰۰۰ <i/> بستانکار ۶۳۵٬۰۰۰</b></div>
    </div>
    <div className="hp-accounting-foot"><span><i/> تفکیک بانک، صندوق و شمارهٔ کارتخوان در سند</span><span>ثبت نمونهٔ نمایشی</span></div>
  </div>;
}

export function HomepageShowcase() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(1);
  const [salesTotal, setSalesTotal] = useState(18_420_000);
  const [orders, setOrders] = useState(128);
  const [salesPulse, setSalesPulse] = useState(0);
  const [saleToast, setSaleToast] = useState<{ id: number; amount: number; number: number; name: string } | null>(null);
  const [costPhase, setCostPhase] = useState<CostPhase>("weighing");
  const [loyaltyPhase, setLoyaltyPhase] = useState<LoyaltyPhase>("purchase");
  const [accountingPhase, setAccountingPhase] = useState<AccountingPhase>("payment");
  const [menuPhase, setMenuPhase] = useState<MenuPhase>("browse");
  const saleSequence = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const timer = window.setTimeout(() => setActive((current) => (current + 1) % scenes.length), 22_000);
    return () => window.clearTimeout(timer);
  }, [active, prefersReducedMotion]);

  useEffect(() => {
    if (active !== 0 || prefersReducedMotion) return;
    const timer = window.setInterval(() => {
      const index = saleSequence.current++ % salesToman.length;
      const amount = salesToman[index];
      const number = 1024 + saleSequence.current;
      setSalesTotal((value) => value + amount);
      setOrders((value) => value + 1);
      setSalesPulse((value) => value + 1);
      setSaleToast({ id: Date.now(), amount, number, name: salesProducts[index] });
    }, 4_800);
    return () => window.clearInterval(timer);
  }, [active, prefersReducedMotion]);

  useEffect(() => {
    if (!saleToast) return;
    const timer = window.setTimeout(() => setSaleToast(null), 3_400);
    return () => window.clearTimeout(timer);
  }, [saleToast]);

  useEffect(() => {
    if (active !== 1) return;
    if (prefersReducedMotion) return;
    const cycle = () => {
      setCostPhase("weighing");
      const timers = [
        window.setTimeout(() => setCostPhase("dough"), 1_200),
        window.setTimeout(() => setCostPhase("meat"), 3_000),
        window.setTimeout(() => setCostPhase("cheese"), 4_800),
        window.setTimeout(() => setCostPhase("seasoning"), 6_600),
        window.setTimeout(() => setCostPhase("profit"), 8_400),
        window.setTimeout(() => setCostPhase("price"), 10_000),
        window.setTimeout(() => setCostPhase("photo"), 11_600),
        window.setTimeout(() => setCostPhase("phone"), 13_200),
      ];
      return timers;
    };
    let timers = cycle();
    const loop = window.setInterval(() => { timers.forEach((timer) => window.clearTimeout(timer)); timers = cycle(); }, 18_000);
    return () => { window.clearInterval(loop); timers.forEach((timer) => window.clearTimeout(timer)); };
  }, [active, prefersReducedMotion]);

  useEffect(() => {
    if (active !== 2) return;
    if (prefersReducedMotion) return;
    const cycle = () => {
      setLoyaltyPhase("purchase");
      const timers = [
        window.setTimeout(() => setLoyaltyPhase("points"), 2_400),
        window.setTimeout(() => setLoyaltyPhase("return"), 5_000),
        window.setTimeout(() => setLoyaltyPhase("reward"), 7_600),
      ];
      return timers;
    };
    let timers = cycle();
    const loop = window.setInterval(() => { timers.forEach((timer) => window.clearTimeout(timer)); timers = cycle(); }, 11_000);
    return () => { window.clearInterval(loop); timers.forEach((timer) => window.clearTimeout(timer)); };
  }, [active, prefersReducedMotion]);

  useEffect(() => {
    if (active !== 3) return;
    if (prefersReducedMotion) return;
    const cycle = () => {
      setAccountingPhase("payment");
      const timers = [
        window.setTimeout(() => setAccountingPhase("routing"), 2_000),
        window.setTimeout(() => setAccountingPhase("journal"), 4_300),
        window.setTimeout(() => setAccountingPhase("balanced"), 6_500),
      ];
      return timers;
    };
    let timers = cycle();
    const loop = window.setInterval(() => { timers.forEach((timer) => window.clearTimeout(timer)); timers = cycle(); }, 10_000);
    return () => { window.clearInterval(loop); timers.forEach((timer) => window.clearTimeout(timer)); };
  }, [active, prefersReducedMotion]);

  useEffect(() => {
    if (active !== 4) return;
    if (prefersReducedMotion) return;
    const cycle = () => {
      setMenuPhase("browse");
      const timers = [
        window.setTimeout(() => setMenuPhase("scrolling"), 1_300),
        window.setTimeout(() => setMenuPhase("checkout"), 3_150),
        window.setTimeout(() => setMenuPhase("flying"), 4_500),
        window.setTimeout(() => setMenuPhase("delivered"), 5_850),
        window.setTimeout(() => setMenuPhase("browse"), 8_100),
      ];
      return timers;
    };
    let timers = cycle();
    const loop = window.setInterval(() => { timers.forEach((timer) => window.clearTimeout(timer)); timers = cycle(); }, 9_500);
    return () => { window.clearInterval(loop); timers.forEach((timer) => window.clearTimeout(timer)); };
  }, [active, prefersReducedMotion]);

  function playOrderAnimation() {
    if (prefersReducedMotion) { setMenuPhase("delivered"); return; }
    setMenuPhase("checkout");
    window.setTimeout(() => setMenuPhase("flying"), 350);
    window.setTimeout(() => setMenuPhase("delivered"), 1_650);
  }

  const scene = scenes[active];
  return <section className="hp-showcase" aria-label="پیش‌نمایش امکانات MenuPeak">
    <div className="hp-showcase-intro"><div><span className="hp-showcase-eyebrow"><Sparkles size={14}/> محصول را در عمل ببینید</span><h2>پیش‌نمایش امکانات MenuPeak</h2><p>از ثبت سفارش تا حسابداری و وفاداری مشتری؛ یک تجربهٔ زنده از کار روزانهٔ رستوران</p></div><span className="hp-preview-pill"><i/> محیط آزمایشی تعاملی</span></div>
    <div className="hp-showcase-tabs" role="tablist" aria-label="مشاهدهٔ بخش‌های مختلف">
      {scenes.map(({ id, label, icon: SceneIcon }, index) => <button key={id} id={`hp-tab-${id}`} type="button" role="tab" aria-selected={active === index} aria-controls="hp-showcase-panel" onClick={() => setActive(index)} className={cn(active === index && "is-active")}><SceneIcon size={16}/><span>{label}</span></button>)}
    </div>
    <div id="hp-showcase-panel" role="tabpanel" aria-labelledby={`hp-tab-${scene.id}`} className="hp-dashboard" key={scene.id}>
      <div className="hp-dashboard-top"><span className="hp-dashboard-brand"><span><ShoppingBag size={15}/></span> محیط مدیریت MenuPeak</span><span className="hp-connection"><i/> دادهٔ نمونه · اجرای زنده</span></div>
      {active === 0 ? <LiveSalesScene total={salesTotal} orders={orders} pulse={salesPulse} toast={saleToast}/> : active === 1 ? <IngredientPricingScene phase={prefersReducedMotion ? "phone" : costPhase}/> : active === 2 ? <LoyaltyScene phase={prefersReducedMotion ? "reward" : loyaltyPhase}/> : active === 3 ? <AccountingScene phase={prefersReducedMotion ? "balanced" : accountingPhase}/> : active === 4 ? <DigitalMenuScene phase={prefersReducedMotion ? "delivered" : menuPhase} onOrder={playOrderAnimation}/> : <ReservationScene/>}
    </div>
    <div className="hp-showcase-caption"><span><QrCode size={16}/> منوی مشتری</span><i/><span><ReceiptText size={16}/> حسابداری و صندوق</span><i/><span><Heart size={16}/> باشگاه مشتریان</span><i/><span><CalendarDays size={16}/> رزرو و سالن</span><i/><span><ChartNoAxesCombined size={16}/> گزارش مدیریت</span></div>
  </section>;
}
