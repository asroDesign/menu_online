"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BellRing, CalendarDays, ChartNoAxesCombined, Check, ChefHat, ChevronLeft, CircleCheck, Coffee, Leaf, Pizza, QrCode, ReceiptText, ShoppingBag, Sparkles, TrendingUp, UsersRound, Weight } from "lucide-react";
import { cn } from "@/components/ui";

const scenes = [
  { id: "reports", label: "فروش زنده", icon: ChartNoAxesCombined },
  { id: "costing", label: "انبار و قیمت", icon: ChefHat },
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

const ingredients = [
  { name: "سبزی تازه", amount: "۸۰ گرم", cost: "۲۴٬۰۰۰", icon: Leaf, color: "mint" },
  { name: "گوشت", amount: "۱۸۰ گرم", cost: "۱۲۶٬۰۰۰", icon: ChefHat, color: "rose" },
  { name: "ادویه", amount: "۱۲ گرم", cost: "۸٬۵۰۰", icon: Sparkles, color: "amber" },
  { name: "پنیر", amount: "۱۲۰ گرم", cost: "۶۳٬۷۰۰", icon: Coffee, color: "cream" },
];

function IngredientPricingScene({ phase }: { phase: string }) {
  const phaseLabel = phase === "weighing" ? "۱ · وزن‌کشی دقیق مواد" : phase === "pouring" ? "۲ · افزودن مواد به پیتزا" : phase === "ratio" ? "۳ · محاسبهٔ بهای تمام‌شده" : "۴ · ثبت قیمت در منو";
  return <div className={cn("hp-cost-scene", `is-${phase}`)}>
    <div className="hp-cost-heading"><div><span className="hp-cost-kicker"><Weight size={13}/> تحلیل خودکار مواد اولیه</span><h2>از انبار تا قیمت منو</h2></div><span className="hp-cost-step">{phaseLabel}</span></div>
    <div className="hp-cost-workspace">
      <div className="hp-ingredient-list" aria-label="مواد اولیه در حال وزن‌کشی">
        {ingredients.map(({ name, amount, cost, icon: IngredientIcon, color }, index) => <div key={name} className={`hp-ingredient-row hp-ingredient-${color}`} style={{ animationDelay: `${index * 170}ms` }}>
          <span className="hp-ingredient-icon"><IngredientIcon size={15}/></span><span className="hp-ingredient-copy"><b>{name}</b><small>بهای سهم · {cost} تومان</small></span><strong>{amount}</strong><span className="hp-weight-check"><Check size={12}/></span>
        </div>)}
        <div className="hp-cost-total"><span>بهای هر پیتزا</span><b>۲۲۲٬۲۰۰ <small>تومان</small></b></div>
      </div>
      <div className="hp-pizza-workbench">
        <span className="hp-workbench-label"><ChefHat size={13}/> میز آماده‌سازی</span>
        <div className="hp-pizza-bowl"><div className="hp-pizza-crust"><div className="hp-pizza-sauce"/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="hp-pour-particles"><i/><i/><i/><i/><i/><i/><i/><i/></div><span className="hp-pizza-steam"><i/><i/><i/></span></div>
        <span className="hp-pizza-bowl-caption">پیتزا چهار فصل · ۱ عدد</span>
        <div className="hp-cost-output">
          {phase === "ratio" && <div className="hp-ratio-reveal"><strong>۳۵٪</strong><span>سهم بهای مواد از قیمت فروش</span><small>حاشیهٔ سود هدف: ۶۵٪</small></div>}
          {phase === "menu" && <div className="hp-menu-price-reveal"><span className="hp-menu-mini-pizza"><Pizza size={18}/></span><span className="hp-menu-price-name"><b>پیتزا چهار فصل</b><small>قیمت پیشنهادی با بهای روز مواد</small></span><strong>۶۳۵٬۰۰۰ <small>تومان</small></strong><CircleCheck size={16}/></div>}
          {(phase === "weighing" || phase === "pouring") && <span className="hp-cost-hint">{phase === "weighing" ? "ترازو مواد را دقیق ثبت می‌کند…" : "مواد با دستور تهیه ترکیب می‌شوند…"}</span>}
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
            <article className="hp-phone-product"><span className="hp-phone-food-art"><Pizza size={27}/></span><span><b>پیتزا چهار فصل</b><small>سبزی تازه · پنیر · گوشت</small><strong>۶۳۵٬۰۰۰ تومان</strong></span><span className="hp-phone-add">+</span></article>
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

export function HomepageShowcase() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [salesTotal, setSalesTotal] = useState(18_420_000);
  const [orders, setOrders] = useState(128);
  const [salesPulse, setSalesPulse] = useState(0);
  const [saleToast, setSaleToast] = useState<{ id: number; amount: number; number: number; name: string } | null>(null);
  const [costPhase, setCostPhase] = useState("weighing");
  const [menuPhase, setMenuPhase] = useState<MenuPhase>("browse");
  const saleSequence = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const timer = window.setTimeout(() => setActive((current) => (current + 1) % scenes.length), 10_000);
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
        window.setTimeout(() => setCostPhase("pouring"), 2_100),
        window.setTimeout(() => setCostPhase("ratio"), 4_250),
        window.setTimeout(() => setCostPhase("menu"), 6_350),
      ];
      return timers;
    };
    let timers = cycle();
    const loop = window.setInterval(() => { timers.forEach((timer) => window.clearTimeout(timer)); timers = cycle(); }, 9_200);
    return () => { window.clearInterval(loop); timers.forEach((timer) => window.clearTimeout(timer)); };
  }, [active, prefersReducedMotion]);

  useEffect(() => {
    if (active !== 2) return;
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
    <div className="hp-showcase-intro"><div><span className="hp-showcase-eyebrow"><Sparkles size={14}/> محصول را در عمل ببینید</span><h2>پیش‌نمایش امکانات MenuPeak</h2><p>از ثبت سفارش تا تحلیل سود؛ یک تجربهٔ زنده از کار روزانهٔ رستوران</p></div><span className="hp-preview-pill"><i/> محیط آزمایشی تعاملی</span></div>
    <div className="hp-showcase-tabs" role="tablist" aria-label="مشاهدهٔ بخش‌های مختلف">
      {scenes.map(({ id, label, icon: SceneIcon }, index) => <button key={id} id={`hp-tab-${id}`} type="button" role="tab" aria-selected={active === index} aria-controls="hp-showcase-panel" onClick={() => setActive(index)} className={cn(active === index && "is-active")}><SceneIcon size={16}/><span>{label}</span></button>)}
    </div>
    <div id="hp-showcase-panel" role="tabpanel" aria-labelledby={`hp-tab-${scene.id}`} className="hp-dashboard" key={scene.id}>
      <div className="hp-dashboard-top"><span className="hp-dashboard-brand"><span><ShoppingBag size={15}/></span> محیط مدیریت MenuPeak</span><span className="hp-connection"><i/> دادهٔ نمونه · اجرای زنده</span></div>
      {active === 0 ? <LiveSalesScene total={salesTotal} orders={orders} pulse={salesPulse} toast={saleToast}/> : active === 1 ? <IngredientPricingScene phase={prefersReducedMotion ? "menu" : costPhase}/> : active === 2 ? <DigitalMenuScene phase={prefersReducedMotion ? "delivered" : menuPhase} onOrder={playOrderAnimation}/> : <ReservationScene/>}
    </div>
    <div className="hp-showcase-caption"><span><QrCode size={16}/> منوی مشتری</span><i/><span><ReceiptText size={16}/> سفارش و صندوق</span><i/><span><CalendarDays size={16}/> رزرو و سالن</span><i/><span><ChartNoAxesCombined size={16}/> گزارش مدیریت</span></div>
  </section>;
}
