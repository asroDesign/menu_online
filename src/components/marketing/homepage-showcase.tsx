"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { ArrowDownUp, Banknote, BellRing, CalendarDays, ChartNoAxesCombined, Check, ChefHat, ChevronLeft, CircleCheck, Coffee, Gift, Heart, Landmark, Pizza, QrCode, ReceiptText, ShoppingBag, Sparkles, Star, TrendingUp, UsersRound, WalletCards } from "lucide-react";
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

const customNumberStyle = (properties: Record<`--${string}`, string | number>) => properties as CSSProperties;

function IngredientPricingScene() {
  return <div className="hp-cost-scene" role="img" aria-label="گردش نمونهٔ سفارش، محاسبهٔ دستور تهیه و کاهش موجودی انبار">
    <div className="hm-flow is-pre is-live" data-live="" aria-hidden="true">
      <div className="hm-flow__card hm-flow__order">
        <span className="hm-flow__label"><b>۱</b>سفارش می‌رسد</span>
        <div className="hm-ord">
          <div className="hm-ord__top"><b>میز ۴</b><span className="hm-ord__src"><svg className="hm-svgi"><use href="#hm-i-qr"/></svg>منوی QR</span></div>
          <div className="hm-ord__item"><span className="hm-ord__ico hm-tone-amber"><svg className="hm-svgi"><use href="#hm-i-pizza"/></svg></span><span>پیتزا پپرونی</span><em>×۲</em></div>
          <div className="hm-ord__item"><span className="hm-ord__ico hm-tone-sky"><svg className="hm-svgi"><use href="#hm-i-cup"/></svg></span><span>لیموناد</span><em>×۲</em></div>
          <div className="hm-ord__status"><span className="hm-ord__s1">در صف</span><span className="hm-ord__s2"><i/>در حال آماده‌سازی</span></div>
        </div>
      </div>

      <div className="hm-flow__link"><svg viewBox="0 0 80 24"><path className="hm-flow__track" d="M78 12H2"/><path className="hm-flow__dash" d="M78 12H2"/><circle className="hm-flow__dot" cx="78" cy="12" r="3.5"/><circle className="hm-flow__dot hm-flow__dot--2" cx="78" cy="12" r="2.5"/></svg></div>

      <div className="hm-flow__card hm-flow__recipe">
        <span className="hm-flow__label"><b>۲</b>طبق دستور تهیه</span>
        <div className="hm-rcp">
          <div className="hm-rcp__head"><b>پیتزا پپرونی</b><small>برای هر عدد</small></div>
          <ul className="hm-rcp__lines">
            <li style={customNumberStyle({"--i": 0})}><span>خمیر پیتزا<small>نیمه‌آماده</small></span><b>۲۵۰ گرم</b></li>
            <li style={customNumberStyle({"--i": 1})}><span>پنیر موزارلا</span><b>۱۲۰ گرم</b></li>
            <li style={customNumberStyle({"--i": 2})}><span>پپرونی</span><b>۶۰ گرم</b></li>
            <li style={customNumberStyle({"--i": 3})}><span>سس گوجه<small>نیمه‌آماده</small></span><b>۴۰ گرم</b></li>
            <li style={customNumberStyle({"--i": 4})}><span>جعبه پیتزا<small>بسته‌بندی</small></span><b>۱ عدد</b></li>
          </ul>
          <div className="hm-rcp__cost">
            <svg className="hm-ring" viewBox="0 0 44 44"><circle className="hm-ring__bg" cx="22" cy="22" r="18"/><circle className="hm-ring__fg" cx="22" cy="22" r="18" pathLength="100"/><text x="22" y="22">۳۱٪</text></svg>
            <div><small>بهای تمام‌شده هر عدد</small><b>۱۰۸ هزار تومان</b><span>از قیمت فروش ۳۵۰ هزار</span></div>
          </div>
        </div>
      </div>

      <div className="hm-flow__link"><svg viewBox="0 0 80 24"><path className="hm-flow__track" d="M78 12H2"/><path className="hm-flow__dash" d="M78 12H2"/><circle className="hm-flow__dot hm-flow__dot--b" cx="78" cy="12" r="3.5"/><circle className="hm-flow__dot hm-flow__dot--b2" cx="78" cy="12" r="2.5"/></svg></div>

      <div className="hm-flow__card hm-flow__stock">
        <span className="hm-flow__label"><b>۳</b>از انبار کم می‌شود</span>
        <div className="hm-stk">
          <div className="hm-stk__head"><b>انبار آشپزخانه</b><small>موجودی لحظه‌ای</small></div>
          <ul>
            <li style={customNumberStyle({"--from": .82, "--to": .77})}><span>خمیر پیتزا</span><b><i>۸٫۲۰</i><i>۷٫۷۰</i><small>کیلو</small></b><em><s/></em></li>
            <li className="hm-stk__low" style={customNumberStyle({"--from": .29, "--to": .255, "--rop": .27})}><span>پنیر موزارلا</span><b><i>۲٫۶۰</i><i>۲٫۳۶</i><small>کیلو</small></b><em><s/><u/></em></li>
            <li style={customNumberStyle({"--from": .6, "--to": .56})}><span>پپرونی</span><b><i>۱٫۸۰</i><i>۱٫۶۸</i><small>کیلو</small></b><em><s/></em></li>
            <li style={customNumberStyle({"--from": .7, "--to": .69})}><span>جعبه پیتزا</span><b><i>۱۴۰</i><i>۱۳۸</i><small>عدد</small></b><em><s/></em></li>
          </ul>
          <div className="hm-stk__alert"><span className="hm-stk__alert-ico"><svg className="hm-svgi"><use href="#hm-i-alert"/></svg></span><span><b>پنیر موزارلا زیر نقطه سفارش</b><small>رسید خرید را از همین‌جا بسازید</small></span></div>
        </div>
      </div>
    </div>
    <svg className="hm-flow__sprite" aria-hidden="true" focusable="false">
      <symbol id="hm-i-qr" viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM18 14h2v2h-2zM14 18.5h2v1.5h-2zM17.5 17.5H20V20h-2.5z"/></symbol>
      <symbol id="hm-i-pizza" viewBox="0 0 24 24"><path d="M12 21.5 3.2 6.6a15 15 0 0 1 17.6 0z"/><path d="M5 9.6a12 12 0 0 1 14 0"/><circle cx="10.2" cy="12" r="1.2"/><circle cx="13.6" cy="14.6" r="1.2"/></symbol>
      <symbol id="hm-i-cup" viewBox="0 0 24 24"><path d="M5.5 8.5h11v5.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16.5 10h1.5a2.5 2.5 0 0 1 0 5h-1.5M9 3.5c0 1.5 1 1.5 1 3M13 3.5c0 1.5 1 1.5 1 3"/></symbol>
      <symbol id="hm-i-alert" viewBox="0 0 24 24"><path d="M12 3.8 2.6 19.8h18.8z"/><path d="M12 10v4.6M12 17.2h.01"/></symbol>
    </svg>
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
  payment: "جریان‌های مالی به هم متصل‌اند",
  routing: "فروش و دریافت در یک مسیر",
  journal: "ثبت جزئیات در سند حسابداری",
  balanced: "سند فروش متوازن شد",
};

function AccountingScene({ phase }: { phase: AccountingPhase }) {
  return <div className="hp-accounting-scene" data-phase={phase}>
    <div className="hp-accounting-heading"><span className="hp-accounting-kicker"><ReceiptText size={13}/> حسابداری متصل به عملیات رستوران</span><span className="hp-accounting-phase"><i/>{accountingPhaseLabels[phase]}</span></div>
    <div className="hp-accounting-layout">
      <div className="hp-accounting-copy">
        <h2>حساب‌هایتان خودشان ثبت می‌شوند</h2>
        <p>صندوق، منوی QR، باشگاه مشتریان و انبار حالا مستقیم به حسابداری MenuPeak وصل‌اند. هر فروش، هر تخفیف و هر کالایی که از انبار می‌رود، خودکار سند می‌شود. شما فقط نگاه می‌کنید: امروز چقدر سود کردید؟</p>
        <div className="hp-accounting-points">
          <span><CircleCheck size={13}/> فروش، انبار و تسویه در یک مسیر</span>
          <span><CircleCheck size={13}/> تفکیک وجه نقد، کارتخوان و بانک</span>
          <span><CircleCheck size={13}/> بهای غذا از دستور تهیه و موجودی</span>
        </div>
      </div>
      <div className="hp-accounting-network" role="img" aria-label="اتصال نمایشی صندوق، سفارش آنلاین، باشگاه مشتریان، انبار، بانک و حسابداری MenuPeak">
        <svg className="hp-accounting-connections" viewBox="0 0 560 300" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="hpAccountingLine" x1="0" x2="1"><stop stopColor="#54a8ff" stopOpacity=".15"/><stop offset=".5" stopColor="#84aaff" stopOpacity=".8"/><stop offset="1" stopColor="#57d7b1" stopOpacity=".18"/></linearGradient></defs>
          <path d="M48 52 C145 52 170 112 242 145 M48 150 C138 150 165 150 242 150 M48 248 C145 248 170 188 242 155 M512 52 C415 52 390 112 318 145 M512 150 C422 150 395 150 318 150 M512 248 C415 248 390 188 318 155" fill="none" stroke="url(#hpAccountingLine)" strokeWidth="1.5"/>
          <path className="hp-accounting-dash" d="M48 52 C145 52 170 112 242 145 M48 150 C138 150 165 150 242 150 M48 248 C145 248 170 188 242 155 M512 52 C415 52 390 112 318 145 M512 150 C422 150 395 150 318 150 M512 248 C415 248 390 188 318 155" fill="none" stroke="#a8c6ff" strokeWidth="1.5" strokeDasharray="4 8"/>
          <circle className="hp-accounting-dot" cx="48" cy="52" r="3"/><circle className="hp-accounting-dot hp-accounting-dot-alt" cx="512" cy="248" r="3"/>
        </svg>
        <div className="hp-accounting-node hp-accounting-node-pos"><i><ShoppingBag size={19}/></i><b>صندوق</b><small>فروش و دریافت</small></div>
        <div className="hp-accounting-node hp-accounting-node-qr"><i><QrCode size={19}/></i><b>منوی QR</b><small>سفارش آنلاین</small></div>
        <div className="hp-accounting-node hp-accounting-node-club"><i><Heart size={19}/></i><b>باشگاه</b><small>تخفیف مشتری</small></div>
        <div className="hp-accounting-node hp-accounting-node-stock"><i><ChefHat size={19}/></i><b>انبار</b><small>بهای غذا</small></div>
        <div className="hp-accounting-node hp-accounting-node-bank"><i><Landmark size={19}/></i><b>بانک و چک</b><small>تسویه‌ها</small></div>
        <div className="hp-accounting-node hp-accounting-node-books"><i><WalletCards size={19}/></i><b>دفتر حساب</b><small>گزارش مالی</small></div>
        <div className="hp-accounting-ledger">
          <div className="hp-accounting-ledger-head"><span><ReceiptText size={12}/> سند حسابداری · #۱۰۲۴</span><b><i/> متوازن</b></div>
          <div className="hp-accounting-ledger-total"><small>فروش نمونه</small><strong>۶۳۵٬۰۰۰ <em>تومان</em></strong></div>
          <div className="hp-accounting-ledger-row"><span><i className="is-bank"><Landmark size={10}/></i><b>بانک · کارتخوان</b></span><strong>۴۵۰٬۰۰۰</strong></div>
          <div className="hp-accounting-ledger-row"><span><i className="is-cash"><Banknote size={10}/></i><b>صندوق · نقدی</b></span><strong>۱۸۵٬۰۰۰</strong></div>
          <div className="hp-accounting-ledger-row is-income"><span><i className="is-income"><ArrowDownUp size={10}/></i><b>درآمد فروش</b></span><strong>۶۳۵٬۰۰۰</strong></div>
          <div className="hp-accounting-ledger-foot"><span>بدهکار <b>۶۳۵٬۰۰۰</b></span><i/><span>بستانکار <b>۶۳۵٬۰۰۰</b></span></div>
        </div>
      </div>
    </div>
    <div className="hp-accounting-foot"><span><i/> یک نمای روشن از ثبت‌های مالی روز</span><span>ارقام نمونهٔ نمایشی</span></div>
  </div>;
}

export function HomepageShowcase() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(1);
  const [salesTotal, setSalesTotal] = useState(18_420_000);
  const [orders, setOrders] = useState(128);
  const [salesPulse, setSalesPulse] = useState(0);
  const [saleToast, setSaleToast] = useState<{ id: number; amount: number; number: number; name: string } | null>(null);
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
    <div id="hp-showcase-panel" role="tabpanel" aria-labelledby={`hp-tab-${scene.id}`} className={cn("hp-dashboard", active === 1 && "is-costing", active === 3 && "is-accounting")} key={scene.id}>
      <div className="hp-dashboard-top"><span className="hp-dashboard-brand"><span><ShoppingBag size={15}/></span> محیط مدیریت MenuPeak</span><span className="hp-connection"><i/> دادهٔ نمونه · اجرای زنده</span></div>
      {active === 0 ? <LiveSalesScene total={salesTotal} orders={orders} pulse={salesPulse} toast={saleToast}/> : active === 1 ? <IngredientPricingScene/> : active === 2 ? <LoyaltyScene phase={prefersReducedMotion ? "reward" : loyaltyPhase}/> : active === 3 ? <AccountingScene phase={prefersReducedMotion ? "balanced" : accountingPhase}/> : active === 4 ? <DigitalMenuScene phase={prefersReducedMotion ? "delivered" : menuPhase} onOrder={playOrderAnimation}/> : <ReservationScene/>}
    </div>
    <div className="hp-showcase-caption"><span><QrCode size={16}/> منوی مشتری</span><i/><span><ReceiptText size={16}/> حسابداری و صندوق</span><i/><span><Heart size={16}/> باشگاه مشتریان</span><i/><span><CalendarDays size={16}/> رزرو و سالن</span><i/><span><ChartNoAxesCombined size={16}/> گزارش مدیریت</span></div>
  </section>;
}
