"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChartNoAxesCombined, ChefHat, ChevronLeft, CircleCheck, ClipboardList, Coffee, QrCode, ReceiptText, ShoppingBag, Users } from "lucide-react";
import { cn } from "@/components/ui";

const scenes = [
  { id: "menu", label: "منوی دیجیتال", icon: Coffee, title: "منوی کافه", subtitle: "به‌روزرسانی شد · همین حالا", items: [["آیس لاته", "۱۲۸٬۰۰۰"], ["چیزکیک سن‌سباستین", "۱۹۵٬۰۰۰"], ["قهوه دمی روز", "۱۱۰٬۰۰۰"]], badge: "QR میز ۱۲", stat: "۳۴ بازدید امروز" },
  { id: "orders", label: "سفارش‌ها", icon: ReceiptText, title: "سفارش تازه رسید", subtitle: "میز ۱۲ · ثبت چند لحظه پیش", items: [["آیس لاته × ۲", "۲۵۶٬۰۰۰"], ["چیزکیک سن‌سباستین", "۱۹۵٬۰۰۰"], ["یادداشت مشتری", "بدون یخ"]], badge: "در انتظار آماده‌سازی", stat: "شماره ۱۰۲۴" },
  { id: "reservation", label: "رزرو میز", icon: CalendarDays, title: "رزرو امشب", subtitle: "امروز · ساعت ۲۰:۳۰", items: [["مهمان‌ها", "۴ نفر"], ["نوع رزرو", "قرار ویژه"], ["وضعیت", "میز ۶ آماده"]], badge: "تأیید رزرو", stat: "زمان‌بندی سالن" },
  { id: "reports", label: "گزارش فروش", icon: ChartNoAxesCombined, title: "نمای روزانه فروش", subtitle: "خلاصه فروش و سفارش‌ها", items: [["فروش امروز", "۱۸٫۴ م"], ["سفارش‌ها", "۱۲۸"], ["پرفروش‌ترین", "آیس لاته"]], badge: "به‌روز", stat: "گزارش مدیریت" },
];

export function HomepageShowcase() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % scenes.length), 4200);
    return () => window.clearInterval(timer);
  }, []);
  const scene = scenes[active];
  const ActiveIcon = scene.icon;
  return <section className="hp-showcase" aria-label="پیش‌نمایش امکانات MenuPeak">
    <div className="hp-showcase-tabs" role="tablist" aria-label="مشاهدهٔ بخش‌های مختلف">
      {scenes.map(({ id, label, icon: Icon }, index) => <button key={id} id={`hp-tab-${id}`} type="button" role="tab" aria-selected={active === index} aria-controls="hp-showcase-panel" onClick={() => setActive(index)} className={cn(active === index && "is-active")}><Icon size={16}/><span>{label}</span></button>)}
    </div>
    <div id="hp-showcase-panel" role="tabpanel" aria-labelledby={`hp-tab-${scene.id}`} className="hp-dashboard" key={scene.id}>
      <div className="hp-dashboard-top"><span className="hp-dashboard-brand"><span><ShoppingBag size={15}/></span> محیط مدیریت MenuPeak</span><span className="hp-connection"><i/> پیش‌نمایش نمایشی</span></div>
      <div className="hp-dashboard-body">
        <aside className="hp-dashboard-rail" aria-hidden="true"><QrCode/><ReceiptText/><CalendarDays/><ClipboardList/><Users/></aside>
        <div className="hp-dashboard-content">
          <div className="hp-dashboard-title"><div><small>{scene.stat}</small><h2>{scene.title}</h2></div><span className="hp-dashboard-tag"><ActiveIcon size={14}/>{scene.badge}</span></div>
          <p className="hp-dashboard-subtitle">{scene.subtitle}</p>
          <div className="hp-dashboard-list">{scene.items.map(([title, value], index) => <div key={title} className="hp-dashboard-row" style={{ animationDelay: `${index * 100}ms` }}><span className="hp-row-icon">{index === 0 ? <Coffee size={16}/> : index === 1 ? <ChefHat size={16}/> : <CircleCheck size={16}/>}</span><b>{title}</b><strong>{value}</strong></div>)}</div>
          <div className="hp-dashboard-foot"><span><i/>اطلاعات در یک جریان متصل</span><span className="hp-dashboard-link">نمایش جزئیات <ChevronLeft size={15}/></span></div>
        </div>
      </div>
    </div>
    <div className="hp-showcase-caption"><span><QrCode size={16}/> منوی مشتری</span><i/><span><ReceiptText size={16}/> سفارش و صندوق</span><i/><span><CalendarDays size={16}/> رزرو و سالن</span><i/><span><ChartNoAxesCombined size={16}/> گزارش مدیریت</span></div>
  </section>;
}
