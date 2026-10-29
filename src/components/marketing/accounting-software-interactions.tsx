"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownLeft, Banknote, Boxes, Check, ChevronLeft, CircleDollarSign, Heart, PackageCheck, ShoppingBag, WalletCards } from "lucide-react";
import styles from "@/app/accounting-software/accounting-software.module.css";

type ModuleKey = "pos" | "online" | "loyalty" | "inventory" | "reports" | "branches";

const modules: { key: ModuleKey; title: string; icon: typeof ShoppingBag; heading: string; copy: string; points: string[]; href: string; link: string }[] = [
  { key: "pos", title: "صندوق و سفارش", icon: ShoppingBag, heading: "فروش و دریافت صندوق → حسابداری", copy: "فاکتور، روش تسویه و جزئیات پرداخت در مسیر سفارش به سند مالی وصل می‌شود.", points: ["ثبت خودکار فروش‌های پرداخت‌شده", "تفکیک پرداخت نقد، بانک و مطالبات", "سند بهای مواد مصرف‌شده در فروش"], href: "/dashboard/orders", link: "رفتن به سفارش‌ها" },
  { key: "online", title: "منوی QR", icon: CircleDollarSign, heading: "سفارش آنلاین → حسابداری", copy: "سفارش مشتری وارد همان جریان تسویه، انبار و گزارش‌های فروش می‌شود.", points: ["منبع سفارش در سابقه باقی می‌ماند", "تخفیف و مبلغ نهایی در فروش لحاظ می‌شود", "رسیدگی به وضعیت سفارش از پنل سفارش‌ها"], href: "/dashboard/orders", link: "مشاهدهٔ سفارش‌ها" },
  { key: "loyalty", title: "باشگاه مشتریان", icon: Heart, heading: "تخفیف و اعتبار → ثبت مالی", copy: "تخفیف و اعتبارهای پشتیبانی‌شده در محاسبهٔ فروش و سند خودکار اثر می‌گذارند.", points: ["ثبت تخفیف در فروش", "اثر کش‌بک در اسناد فروش", "مانده و سوابق از پروندهٔ مشتری"], href: "/dashboard/customers", link: "رفتن به مشتریان" },
  { key: "inventory", title: "انبار و دستور تهیه", icon: Boxes, heading: "رسید و مصرف کالا → حسابداری", copy: "رسید خرید و گردش کالای انبار، موجودی و حساب‌های مربوط را هم‌زمان به‌روز می‌کند.", points: ["رسید خرید چندقلمی", "هزینهٔ مواد از روی دستور تهیه", "ضایعات، مصرف و کنترل موجودی"], href: "/dashboard/inventory", link: "رفتن به انبار" },
  { key: "reports", title: "دفتر و گزارش", icon: WalletCards, heading: "ثبت → دفتر روزنامه و صورت مالی", copy: "اسناد قطعی‌شده در دفاتر و گزارش‌های حسابداری نمایش داده می‌شوند.", points: ["دفتر روزنامه و کل/معین/تفصیلی", "تراز آزمایشی دو و چهارستونی", "صورت سود و زیان و ترازنامه"], href: "/dashboard/accounting", link: "بازکردن دفتر حسابداری" },
  { key: "branches", title: "بانک، چک و هزینه", icon: Banknote, heading: "تسویه و تعهد → خزانه و دفتر", copy: "حساب‌های بانکی، ثبت چک و ماندهٔ دریافتنی از ابزارهای مالی پنل قابل دسترسی‌اند.", points: ["دفتر داخلی چک و سررسید", "مانده و تراکنش حساب‌های بانکی", "ثبت دریافت و برگشت مطالبات"], href: "/dashboard/bank", link: "رفتن به بانک و صندوق" },
];

export function AccountingConnections({ mode = "journal" }: { mode?: "journal" | "modules" }) {
  const [selected, setSelected] = useState<ModuleKey>("pos");
  const active = modules.find((module) => module.key === selected)!;
  if (mode === "journal") {
    return <div className={styles.saleFlow} aria-label="مراحل نمونهٔ ثبت حسابداری فروش">
      {[
        [ShoppingBag, "۱", "ثبت سفارش", "فروش و پرداخت"],
        [PackageCheck, "۲", "ثبت گردش کالا", "مواد مصرف‌شده"],
        [WalletCards, "۳", "صدور سند", "بدهکار و بستانکار"],
        [Check, "۴", "گزارش مالی", "دفتر و سود"],
      ].map(([IconComponent, number, title, caption], index) => { const Icon = IconComponent as typeof ShoppingBag; return <article key={String(number)} className={styles.saleStep} style={{ animationDelay: `${index * 180}ms` }}><span className={styles.stepNumber}>{String(number)}</span><span className={styles.stepIcon}><Icon size={19}/></span><b>{String(title)}</b><small>{String(caption)}</small>{index < 3 && <ChevronLeft className={styles.stepArrow} size={16}/>}</article>; })}
    </div>;
  }
  return <div className={styles.integrationDemo}>
    <div className={styles.integrationTabs} role="tablist" aria-label="بخش متصل به حسابداری">{modules.map((module) => { const Icon = module.icon; return <button key={module.key} type="button" role="tab" aria-selected={selected === module.key} onClick={() => setSelected(module.key)}><Icon size={15}/>{module.title}</button>; })}</div>
    <article className={styles.integrationPanel} role="tabpanel" key={active.key}>
      <div className={styles.integrationCopy}><span className={styles.kicker}>اتصال فعال MenuPeak</span><h3>{active.heading}</h3><p>{active.copy}</p><ul>{active.points.map((point) => <li key={point}><Check size={14}/>{point}</li>)}</ul><Link href={active.href}>{active.link}<ArrowDownLeft size={14}/></Link></div>
      <div className={styles.integrationVisual}><div className={styles.integrationSource}><active.icon size={19}/><span>{active.title}</span><small>رویداد ثبت‌شده</small></div><span className={styles.integrationWire}><i/></span><div className={styles.integrationDestination}><WalletCards size={21}/><b>دفتر حسابداری</b><small>منبع: {active.title}</small><span><Check size={12}/> قابل پیگیری</span></div></div>
    </article>
    <p className={styles.integrationNote}>این پنل به حساب واردشده منتقل می‌شود؛ ورود و entitlement ماژول در مقصد بررسی می‌شود.</p>
  </div>;
}
