"use client";

import Link from "next/link";
import { ArrowUpLeft, UtensilsCrossed } from "lucide-react";
import { BrandLogo, usePlatformBranding } from "@/components/brand";

export function SiteFooter(){
  const branding = usePlatformBranding();
  return <footer className="market-footer"><div className="market-container footer-grid"><div><Link href="/" className="footer-brand"><span className="grid size-8 place-items-center"><BrandLogo url={branding.logoUrl} alt="" className="size-7 object-contain" fallback={<UtensilsCrossed size={28}/>} /></span>{branding.siteName}</Link><p>از اولین اسکن منو تا آخرین سفارش شب؛<br/>همه‌چیز برای یک تجربهٔ بهتر، سر یک میز.</p><Link href="/demo" className="footer-demo">درخواست نمایش همراه کارشناس <ArrowUpLeft size={18}/></Link></div><div><h2>کشف سامانه</h2><Link href="/plans">تعرفه‌ها و مقایسه امکانات</Link><Link href="/pos-system">صندوق آفلاین ویندوز</Link><Link href="/preview">نمونه منوها</Link><Link href="/restaurants">رستوران‌ها</Link><Link href="/tutorials">مرکز آموزش</Link><Link href="/blog">مجله رستوران</Link></div><div><h2>کنار شما هستیم</h2><Link href="/consultation">درخواست مشاوره</Link><Link href="/faq">سوالات متداول</Link><Link href="/testimonials">تجربه کاربران</Link><Link href="/affiliate/apply">همکاری در فروش</Link></div><div><h2>بیشتر آشنا شویم</h2><Link href="/about">درباره ما</Link><Link href="/contact">تماس با ما</Link><Link href="/terms">قوانین و مقررات</Link><Link href="/demo">درخواست نمایش</Link></div></div><div className="market-container footer-bottom"><span>{branding.siteName} · برای کافه‌ها و رستوران‌های فردا</span><span>ساخته شده برای تجربه‌ای خوش‌طعم</span></div></footer>;
}
