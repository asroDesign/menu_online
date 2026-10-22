"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpLeft, Menu, UtensilsCrossed, X } from "lucide-react";
import { BrandLogo, usePlatformBranding } from "@/components/brand";
const links = [["/", "خانه"], ["/plans", "تعرفه‌ها و امکانات"], ["/blog", "مجله رستوران"], ["/tutorials", "آموزش"], ["/contact", "ارتباط با ما"]];
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const branding = usePlatformBranding();
  const navigation = path === "/" ? [["/#why-us", "چرا ما؟"], ["/#features", "امکانات"], ["/#buying-guide", "راهنمای خرید"], ["/#pricing", "تعرفه‌ها"], ["/contact", "ارتباط با ما"]] : links;
  return <header className="site-header"><div className="site-nav">
    <Link href="/" className="site-brand" aria-label={`${branding.siteName}، صفحه اصلی`}><span><BrandLogo url={branding.logoUrl} alt="" className="size-8 object-contain" fallback={<UtensilsCrossed size={21}/>} /></span><div>{branding.siteName}<small>همراه هر روز رستوران شما</small></div></Link>
    <nav className="desktop-nav" aria-label="منوی اصلی">{navigation.map(([href,label])=><Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>)}</nav>
    <div className="nav-actions"><Link href="/login" className="login-link">ورود</Link><Link href="/preview" className="btn market-button">دموی تعاملی <ArrowUpLeft size={16}/></Link><button type="button" className="btn btn-ghost mobile-menu-button" aria-label={open ? "بستن منو" : "باز کردن منو"} aria-expanded={open} aria-controls="mobile-site-nav" onClick={()=>setOpen(!open)}>{open ? <X/> : <Menu/>}</button></div>
  </div>{open && <nav id="mobile-site-nav" className="mobile-site-nav" aria-label="منوی موبایل">{navigation.map(([href,label])=><Link key={href} href={href} onClick={()=>setOpen(false)} aria-current={path === href ? "page" : undefined}>{label}</Link>)}<Link href="/register" onClick={()=>setOpen(false)}>ساخت حساب کاربری</Link></nav>}</header>;
}
