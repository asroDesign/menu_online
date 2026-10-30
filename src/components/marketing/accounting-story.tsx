"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { ArrowUpLeft, BadgeCheck, Check, Cloud, Coffee, Database, FileCheck2, LockKeyhole, Monitor, PackageCheck, Pause, Play, ReceiptText, RefreshCw, ShieldCheck, ShoppingBag, Store, TrendingUp, Users, UtensilsCrossed, Wifi, WifiOff } from "lucide-react";
import s from "@/app/accounting-software/accounting-story.module.css";

const fa = (n: number) => n.toLocaleString("fa-IR");
const OFFLINE_DEMO_HISTORY_KEY="menupeak-accounting-offline-demo-history";
const OFFLINE_DEMO_HISTORY_EVENT="menupeak-accounting-offline-demo-history-change";
const subscribeOfflineDemoHistory=(callback:()=>void)=>{window.addEventListener(OFFLINE_DEMO_HISTORY_EVENT,callback);window.addEventListener("storage",callback);return()=>{window.removeEventListener(OFFLINE_DEMO_HISTORY_EVENT,callback);window.removeEventListener("storage",callback);};};
const getOfflineDemoHistory=()=>window.localStorage.getItem(OFFLINE_DEMO_HISTORY_KEY)==="saved";

export function ProfitStory() {
  const [period, setPeriod] = useState(0);
  const [extra, setExtra] = useState(0);
  const sales = period === 0 ? 480 : 540;
  const materials = period === 0 ? 168 : 189;
  const expenses = (period === 0 ? 192 : 205) + extra;
  const profit = sales - materials - expenses;
  return <div className={s.profitLayout}>
    <div className={s.storyCopy}><span className={s.overline}>فروش بالا، همیشه به معنی سود بالا نیست</span><h2>این ماه واقعاً<br/><em>چقدر سود کردیم؟</em></h2><p>از شلوغی سالن خوشحالید؛ اما بعد از خرید مواد، حقوق و هزینه‌ها، چقدر برای مجموعه مانده؟ فروش، بهای مواد و هزینه‌های ثبت‌شده را کنار هم ببینید تا جواب در میان چند دفتر گم نشود.</p><ul className={s.checks}><li><Check/> فروش را از سود جدا ببینید</li><li><Check/> سهم مواد و هزینه‌های مجموعه را بشناسید</li><li><Check/> از گزارش خلاصه به ریز هزینه‌ها برسید</li></ul><Link href="/dashboard/profit-loss" className={s.textLink}>گزارش سود و زیان را ببینید <ArrowUpLeft size={18}/></Link></div>
    <div className={s.profitBoard}><header><span><TrendingUp size={18}/> نمای سود و زیان</span><small>مثال آموزشی · میلیون تومان</small></header><div className={s.switches} aria-label="دوره نمونه">{["ماه اول", "ماه دوم"].map((v,i)=><button type="button" key={v} aria-pressed={period===i} onClick={()=>setPeriod(i)}>{v}</button>)}</div><div className={s.profitSummary}><span>پس از کسر مواد و هزینه‌های مثال</span><strong key={`${period}-${extra}`}>{fa(profit)} <small>میلیون تومان</small></strong><b>{fa(Math.round(profit/sales*100))}٪ از فروش</b></div><div className={s.waterfall}>{[["فروش خالص",sales,"sale"],["بهای مواد",materials,"material"],["سایر هزینه‌ها",expenses,"expense"],["سود مثال",profit,"profit"]].map(([label,value,tone])=><div className={s.barColumn} key={String(label)}><b>{fa(Number(value))}</b><div className={s.barTrack}><i data-tone={tone} style={{height:`${Number(value)/600*100}%`}}/></div><span>{label}</span></div>)}</div><label className={s.costSlider}>اگر هزینه‌ها بیشتر شوند، سود چه می‌شود؟<span>هزینهٔ اضافه: <b>{fa(extra)} میلیون</b></span><input aria-label="هزینه اضافه در مثال سود و زیان" type="range" min={0} max={60} step={5} value={extra} onChange={e=>setExtra(Number(e.target.value))}/></label><p className={s.caption}>اعداد نمایشی‌اند. کامل‌بودن گزارش واقعی به ثبت صحیح همهٔ هزینه‌ها و بهای مواد وابسته است.</p></div>
  </div>;
}

const steps = [
  {icon:ShoppingBag,title:"سفارش و دریافت",copy:"۶۵۰ هزار تومان فروش؛ ۶۵ هزار تومان تخفیف و ۵۸۵ هزار تومان دریافت."},
  {icon:PackageCheck,title:"مصرف مواد",copy:"مواد دستور تهیه از موجودی خارج می‌شوند؛ بهای نمونه: ۲۱۰ هزار تومان."},
  {icon:ReceiptText,title:"سند متوازن",copy:"ردیف‌های فروش و مصرف مواد ثبت می‌شوند؛ بدهکار و بستانکار برابرند."},
  {icon:TrendingUp,title:"نتیجهٔ قابل بررسی",copy:"۳۷۵ هزار تومان پس از کسر مواد؛ هزینه‌های دیگر هنوز باید لحاظ شوند."},
];
const rows = [["بانک / صندوق",585,0],["تخفیف فروش",65,0],["فروش غذا و نوشیدنی",0,650],["بهای مواد مصرف‌شده",210,0],["موجودی مواد اولیه",0,210]] as const;
export function SaleStory() {
  const [step,setStep]=useState(0);
  const [playing,setPlaying]=useState(true);
  const [visible,setVisible]=useState(false);
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{const el=host.current;if(!el)return;const o=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.25});o.observe(el);return ()=>o.disconnect();},[]);
  useEffect(()=>{if(!playing||!visible||step===3||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const timer=setTimeout(()=>setStep(v=>Math.min(3,v+1)),2400);return ()=>clearTimeout(timer);},[playing,visible,step]);
  return <div className={s.saleScene} ref={host}>
    <div className={s.sceneToolbar}><span><span className={s.liveDot}/> داستان یک سفارش · مثال آموزشی</span><button type="button" onClick={()=>{if(step===3){setStep(0);setPlaying(true);}else setPlaying(v=>!v);}}>{step===3?<RefreshCw size={15}/>:playing?<Pause size={15}/>:<Play size={15}/>} {step===3?"پخش دوباره":playing?"توقف انیمیشن":"ادامه"}</button></div>
    <div className={s.saleGrid}><div className={s.stepRail}>{steps.map(({icon:Icon,title,copy},i)=><button type="button" key={title} aria-pressed={step===i} className={i<=step?s.reached:undefined} onClick={()=>{setStep(i);setPlaying(false);}}><span className={s.stepIcon}><Icon size={23}/></span><span><small>مرحلهٔ {fa(i+1)}</small><b>{title}</b><em>{copy}</em></span><span className={s.stepTick}>{i<=step?<Check size={16}/>:fa(i+1)}</span></button>)}</div><div className={s.documentStage}>
    <div className={s.receiptBadge}><ReceiptText size={20}/><span>میز ۷ · سفارش نمونه<b>پرداخت: ۵۸۵٬۰۰۰ تومان</b></span><BadgeCheck size={20}/></div>
    <div className={s.document}><div className={s.documentTop}><div><small>دفتر حسابداری · نمونه</small><h3>{step<2?"از رویداد تا ثبت مالی":"سند فروش و مصرف مواد"}</h3></div><FileCheck2 size={30}/></div><table><caption>مبالغ نمونه به هزار تومان؛ جدول نهایی در مرحلهٔ سوم کامل می‌شود</caption><thead><tr><th>حساب</th><th>بدهکار</th><th>بستانکار</th></tr></thead><tbody>{rows.map(([name,debit,credit],i)=><tr key={name} data-ready={step>=2||(step===1&&i>=3)}><td>{name}</td><td>{debit?fa(debit):"—"}</td><td>{credit?fa(credit):"—"}</td></tr>)}</tbody><tfoot><tr><th>جمع سند نهایی</th><th>۸۶۰</th><th>۸۶۰</th></tr></tfoot></table><div className={s.documentSeal} data-ready={step>=2}><ShieldCheck size={17}/> بدهکار = بستانکار</div></div>
    <div className={s.saleResult} data-ready={step===3}><TrendingUp size={22}/><span><small>فروش خالص − بهای مواد</small><b>۳۷۵٬۰۰۰ تومان</b></span><span>پیش از سایر<br/>هزینه‌های مجموعه</span></div>
    </div></div><p className={s.caption}>روی هر مرحله بزنید و اثر آن را ببینید. این نمایش به حساب، سفارش یا دادهٔ واقعی شما متصل نیست.</p>
  </div>;
}

export function OfflineStory() {
  const [phase,setPhase]=useState<"online"|"offline"|"syncing"|"synced">("online");
  const added=useSyncExternalStore(subscribeOfflineDemoHistory,getOfflineDemoHistory,()=>false);
  useEffect(()=>{if(phase!=="syncing")return;const t=setTimeout(()=>setPhase("synced"),1700);return ()=>clearTimeout(t);},[phase]);
  const offline=phase==="offline";
  return <div className={s.offlineLayout}>
    <div className={s.storyCopy}><span className={s.overline}>قطعی اینترنت نباید سابقهٔ کارتان را از دسترس خارج کند</span><h2>اینترنت رفت؟<br/><em>دفترتان همین‌جاست.</em></h2><p>صندوق ویندوز، اطلاعاتی را که قبلاً دریافت کرده روی همان دستگاه نگه می‌دارد. تاریخچهٔ ذخیره‌شده را ببینید و عملیات پشتیبانی‌شده را در صف ارسال ثبت کنید؛ با برگشت اتصال، نتیجهٔ همگام‌سازی را پیگیری کنید.</p><ol className={s.offlineSteps}><li><b>۱</b><span><strong>قبل از قطعی، آماده باشید</strong>برنامه را نصب و اطلاعات اولیه را هنگام اتصال دریافت کنید.</span></li><li><b>۲</b><span><strong>در قطعی، سابقه کنار شماست</strong>داده‌های ذخیره‌شده و ثبت‌های مجاز محلی روی دستگاه باقی می‌مانند.</span></li><li><b>۳</b><span><strong>اتصال برگشت؛ ادامهٔ کار</strong>صف ارسال و موارد نیازمند بررسی را در برنامه دنبال کنید.</span></li></ol><Link className={s.textLink} href="/pos-system">آشنایی با صندوق ویندوز <ArrowUpLeft size={18}/></Link><p className={s.caption}>همهٔ گزارش‌ها و عملیات مالی آفلاین نیستند. ثبت سند محلی به اطلاعات اولیهٔ معتبر و مجوز مدیر نیاز دارد.</p></div>
    <div className={s.offlineDemo} data-phase={phase}><header><span>خودتان قطعی را امتحان کنید</span><span className={s.connectionStatus}>{offline?<WifiOff size={15}/>:<Wifi size={15}/>} {offline?"آفلاین":phase==="syncing"?"در حال ارسال":"متصل"}</span></header><div className={s.network}><div className={s.localNode}><Monitor/><b>صندوق ویندوز</b><small>روی دستگاه شما</small></div><div className={s.networkWire}><i/><i/><span>{offline?"اتصال قطع است":"ارسال پس از اتصال"}</span></div><div className={s.cloudNode}><Cloud/><b>پنل آنلاین</b><small>{offline?"منتظر اتصال":"دریافت اطلاعات"}</small></div></div><div className={s.localLedger}><div><Database size={18}/><b>سابقهٔ ذخیره‌شده روی دستگاه</b><ShieldCheck size={17}/></div>{["سفارش میز ۴ · پرداخت ثبت‌شده","سفارش بیرون‌بر · جزئیات محفوظ"].map(text=><p key={text}><Check size={15}/>{text}<span>ذخیره‌شده</span></p>)}{added&&<p className={s.newLocalRow}><ReceiptText size={15}/>ثبت نمونهٔ جدید<span>{phase==="synced"?"همگام شد":offline||phase==="syncing"?"در صف ارسال":"ذخیره‌شده"}</span></p>}</div><div className={s.offlineFeedback} role="status">{offline?"سابقه هنوز اینجاست؛ یک ثبت نمونه هم اضافه کنید.":phase==="syncing"?"ثبت نمونه از صف محلی ارسال می‌شود…":phase==="synced"?"اتصال برگشت؛ سابقه محفوظ و صف نمونه همگام شد.":"این نمایش آزمایشی است؛ اینترنت واقعی شما قطع نمی‌شود."}</div><div className={s.demoButtons}><button type="button" disabled={phase==="syncing"} onClick={()=>{if(offline)setPhase("syncing");else setPhase("offline");}}>{offline?<Wifi size={17}/>:<WifiOff size={17}/>} {offline?"اتصال دوباره":"شبیه‌سازی قطع اینترنت"}</button>{offline&&<button type="button" disabled={added} onClick={()=>{window.localStorage.setItem(OFFLINE_DEMO_HISTORY_KEY,"saved");window.dispatchEvent(new Event(OFFLINE_DEMO_HISTORY_EVENT));}}><ReceiptText size={17}/>{added?"در صف ذخیره شد":"افزودن ثبت نمونه"}</button>}</div></div>
  </div>;
}

type FeatureGroup = { title:string; items:string[][] };
const featureQuestions=["فروش داشتیم؛ سودش کجاست؟","برای یک مانده، چند دفتر را می‌گردید؟","پول‌ها کجا هستند و چه کسی بدهکار است؟","گرانی مواد، سود غذا را کم کرده؟","هزینهٔ تیم و تجهیزات را دقیق می‌دانید؟"];
const featureIcons=[TrendingUp,ReceiptText,Store,PackageCheck,Users];
export function FeatureExplorer({groups}:{groups:FeatureGroup[]}) {
 const [selected,setSelected]=useState(0);const current=groups[selected];const Icon=featureIcons[selected];
 return <div className={s.featureExplorer}><div className={s.featureNav} aria-label="گروه امکانات حسابداری">{groups.map((g,i)=>{const ItemIcon=featureIcons[i];return <button type="button" key={g.title} aria-pressed={i===selected} onClick={()=>setSelected(i)}><ItemIcon size={21}/><span>{g.title}</span><ArrowUpLeft size={17}/></button>;})}</div><div className={s.featureBody} key={selected}><div className={s.featureHeadline}><span className={s.bigIcon}><Icon size={32}/></span><div><small>از سؤال روزمره تا ابزار رسیدگی</small><h3>{featureQuestions[selected]}</h3></div></div><div className={s.featureCards}>{current.items.map(([name,copy,href,link],i)=><Link href={href} key={name} style={{"--delay":`${i*80}ms`} as CSSProperties}><span className={s.featureIndex}>۰{i+1}</span><h4>{name}</h4><p>{copy}</p><span className={s.featureLink}>{link}<ArrowUpLeft size={17}/></span></Link>)}</div><p className={s.caption}>با انتخاب هر ابزار وارد بخش مربوط در پنل می‌شوید؛ دسترسی به پلن و نقش شما بستگی دارد.</p></div></div>;
}

const businesses=[
 {icon:UtensilsCrossed,title:"رستوران",problem:"فروش سالن و بیرون‌بر قاطی شده؟",copy:"سفارش، روش دریافت و بهای مواد را در کنار دفتر مالی دنبال کنید.",tags:["فروش و تسویه","بهای غذا","حقوق کارکنان"]},
 {icon:Coffee,title:"کافه و کافی‌شاپ",problem:"فروش خوب است؛ حاشیهٔ سود نوشیدنی چطور؟",copy:"با دستور تهیه، مصرف قهوه و شیر را به تحلیل بهای محصول وصل کنید.",tags:["دستور تهیه","هزینه مواد","شیفت صندوق"]},
 {icon:ShoppingBag,title:"فست‌فود و بیرون‌بر",problem:"سفارش زیاد است؛ هزینه‌ها دیده می‌شوند؟",copy:"مواد، بسته‌بندی و تخفیف‌های ثبت‌شده را در رسیدگی به هزینه و فروش ببینید.",tags:["بسته‌بندی","گردش انبار","تخفیف فروش"]},
 {icon:Store,title:"فروشگاه و خدمات",problem:"ماندهٔ مشتری و هزینه‌ها پراکنده است؟",copy:"ثبت درآمد و هزینه، حساب‌های بانکی و مطالبات را در همان سامانه پیگیری کنید.",tags:["طرف‌حساب","درآمد و هزینه","بانک و صندوق"]},
];
export function BusinessStory(){const [active,setActive]=useState(0);const b=businesses[active];const Icon=b.icon;return <div className={s.businessScene}><div className={s.businessOptions} aria-label="نوع کسب‌وکار">{businesses.map(({icon:I,title},i)=><button type="button" key={title} aria-pressed={active===i} onClick={()=>setActive(i)}><I size={29}/><b>حسابداری {title}</b><ArrowUpLeft size={18}/></button>)}</div><div className={s.businessDetail} key={active}><div className={s.businessArt} aria-hidden="true"><i/><i/><span><Icon size={54}/></span><b><ReceiptText size={18}/> فروش</b><b><PackageCheck size={18}/> هزینه</b><b><TrendingUp size={18}/> نتیجه</b></div><div><span className={s.overline}>برای روز کاری یک {b.title}</span><h3>{b.problem}</h3><p>{b.copy}</p><div className={s.tags}>{b.tags.map(t=><span key={t}><Check size={13}/>{t}</span>)}</div></div></div></div>;}

export function SecurityStory(){return <div className={s.securityScene}><div className={s.vault} aria-hidden="true"><div className={s.vaultOrbit}/><span><LockKeyhole size={44}/></span><b>دسترسی مشخص<br/>سابقهٔ قابل پیگیری</b><small><ShieldCheck size={15}/> کنترل در سطح سرور</small></div><div className={s.securityCards}>{[
 [ShieldCheck,"اطلاعات هر مجموعه جداست","درخواست‌های حسابداری در محدودهٔ کسب‌وکار همان کاربر بررسی می‌شوند."],
 [Users,"هر نقش، دسترسی خودش","مشاهده و ثبت اطلاعات مالی به مجوز کاربر وابسته است."],
 [LockKeyhole,"سند قطعی بی‌ردپا تغییر نمی‌کند","اصلاح سند قطعی با سند برگشتی انجام می‌شود تا سابقه بماند."],
 [FileCheck2,"دو طرف سند باید برابر باشند","کنترل تراز از ثبت سند نامتوازن جلوگیری می‌کند."],
 [Database,"حفاظت از اطلاعات محلی ویندوز","نسخهٔ دریافت‌شدهٔ حسابداری در فضای محلی برنامه با DPAPI محافظت می‌شود."],
 [RefreshCw,"ارسال دوباره، ثبت دوباره نیست","فرمان سند آفلاین شناسهٔ یکتا دارد؛ تکرار ارسال همان فرمان، سند دوم نمی‌سازد."],
 ].map(([I,title,copy])=>{const Icon=I as typeof ShieldCheck;return <article key={String(title)}><Icon size={22}/><div><h3>{String(title)}</h3><p>{String(copy)}</p></div></article>;})}</div></div>;}

export function ComparisonStory({siteName}:{siteName:string}){return <div className={s.comparison}><div className={s.compareScroll} tabIndex={0} role="region" aria-label="جدول مقایسه روش‌های حسابداری"><table><caption>مقایسهٔ شیوهٔ کار؛ امکانات نرم‌افزارهای مستقل بسته به محصول متفاوت است.</caption><thead><tr><th>کار روزانه</th><th>دفتر و اکسل</th><th>حسابداری جدا از صندوق</th><th><BadgeCheck size={19}/> {siteName}</th></tr></thead><tbody>{[
 ["ثبت فروش","ورود دستی","ورود دستی یا انتقال فایل","سند مرتبط در جریان تسویهٔ پشتیبانی‌شده"],
 ["بهای مواد هر غذا","محاسبه با فرمول و فایل","نیازمند اتصال یا ورود مواد","تحلیل با دستور تهیه و موجودی"],
 ["رسیدگی به مانده‌ها","جست‌وجو در فایل‌ها","در دفتر مالی مستقل","دفتر، بانک، چک و مطالبات در یک پنل"],
 ["قطعی اینترنت","فایل محلی در دسترس است","بسته به نرم‌افزار","سابقهٔ محلی و صف عملیات مجاز در ویندوز"],
 ["کنترل سند","وابسته به روش ثبت","بسته به نرم‌افزار","کنترل تراز و اصلاح سند قطعی با برگشت"],
 ].map(([a,b,c,d])=><tr key={a}><th>{a}</th><td>{b}</td><td>{c}</td><td><Check size={16}/>{d}</td></tr>)}</tbody></table></div></div>;}
