"use client";

import "@/components/panel-sidebar.css";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { BrandLogo } from "@/components/brand";
import { FeaturesProvider } from "@/components/features";
import { cn, Icon, ToastProvider, EmojiIcon } from "@/components/ui";
import { hasAny, planName, type FeatureMap } from "@/lib/plans";
import { MODULE_ONLY, STAFF_ROLE_LABELS } from "@/lib/roles";
import { DashboardBanners } from "@/components/dashboard-banners";
import { brandThemeStyle } from "@/lib/brand-color";
import { RestaurantSetupTour } from "@/components/restaurant-setup-tour";

type Item = { href: string; label: string; icon: string; feature?: string | string[] };
const NAV: { title?: string; items: Item[] }[] = [
  { items: [{ href: "/dashboard", label: "نمای کلی", icon: "home" }] },
  { title: "سفارش و فروش", items: [
    { href: "/dashboard/orders", label: "سفارش‌ها", icon: "orders", feature: "cashier_pos" },
    { href: "/dashboard/waiter", label: "پنل گارسون", icon: "waiter", feature: "cashier_pos" },
    { href: "/dashboard/cashier", label: "سفارش‌گیر صندوق", icon: "pay", feature: "cashier_pos" },
    { href: "/dashboard/kiosk", label: "سفارش‌گیر کیوسک", icon: "desktop", feature: "kiosk" },
    { href: "/dashboard/tables", label: "میزها و QR", icon: "table", feature: ["self_order", "cashier_pos"] },
    { href: "/dashboard/discounts", label: "کد تخفیف", icon: "ticket", feature: "discount" },
    { href: "/dashboard/reservations", label: "رزرو میز", icon: "calendar", feature: "reservations" },
    { href: "/dashboard/payments", label: "درگاه پرداخت", icon: "bank", feature: ["ipg", "installment"] },
    { href: "/dashboard/staff", label: "کارمندان", icon: "users", feature: "cashier_pos" },
    { href: "/dashboard/staff-schedule", label: "شیفت و مرخصی", icon: "calendar", feature: "staff_scheduling" },
  ] },
  { title: "منو و وب‌سایت", items: [
    { href: "/dashboard/products", label: "منو و محصولات", icon: "utensils" },
    { href: "/dashboard/categories", label: "دسته‌بندی‌ها", icon: "layers" },
    { href: "/dashboard/cross-sell", label: "پیشنهاد مکمل", icon: "sparkle", feature: "cross_sell" },
    { href: "/dashboard/translations", label: "ترجمه منو", icon: "globe", feature: "translation" },
    { href: "/dashboard/ar", label: "واقعیت افزوده", icon: "glasses", feature: "ar" },
    { href: "/dashboard/mini-site", label: "مینی وبسایت", icon: "globe", feature: "mini_site" },
    { href: "/dashboard/domain", label: "دامنه اختصاصی", icon: "link", feature: "custom_domain" },
  ] },
  { title: "مشتریان و بازاریابی", items: [
    { href: "/dashboard/customers", label: "باشگاه مشتریان", icon: "users", feature: "loyalty" },
    { href: "/dashboard/cashback", label: "کش‌بک", icon: "coins", feature: "cashback" },
    { href: "/dashboard/surveys", label: "نظرسنجی", icon: "clipboard", feature: "surveys" },
    { href: "/dashboard/sms", label: "پنل پیامک", icon: "envelope", feature: "sms" },
    { href: "/dashboard/bale", label: "پیام‌رسان بله", icon: "message", feature: "bale" },
    { href: "/dashboard/ai", label: "هوش مصنوعی", icon: "robot", feature: "ai" },
  ] },
  { title: "مالی و حسابداری", items: [
    { href: "/dashboard/accounting", label: "حسابداری (دوطرفه)", icon: "book", feature: "accounting" },
    { href: "/dashboard/receivables", label: "مطالبات مشتریان", icon: "wallet", feature: "accounting" },
    { href: "/dashboard/income-expense", label: "درآمد و هزینه", icon: "wallet", feature: "income_expense" },
    { href: "/dashboard/reports", label: "گزارش فروش", icon: "chart", feature: "sales_reports" },
    { href: "/dashboard/profit-loss", label: "سود و زیان", icon: "trend", feature: "profit_loss" },
    { href: "/dashboard/bank", label: "گزارش بانک", icon: "bank", feature: "bank_report" },
    { href: "/dashboard/assets", label: "اموال و استهلاک", icon: "building", feature: "assets" },
    { href: "/dashboard/cheques", label: "دفتر چک", icon: "file", feature: "cheque_register" },
  ] },
  { title: "انبار و تولید", items: [
    { href: "/dashboard/inventory", label: "انبارداری", icon: "box", feature: "inventory" },
    { href: "/dashboard/stock-movements", label: "گردش انبار", icon: "refresh", feature: "stock_movements" },
    { href: "/dashboard/stock-control", label: "کنترل انبار", icon: "search", feature: "stock_control" },
    { href: "/dashboard/purchase-suggestions", label: "پیشنهاد خرید", icon: "chart", feature: "purchase_suggestions" },
    { href: "/dashboard/suppliers", label: "تأمین‌کنندگان و بدهی", icon: "truck", feature: ["inventory", "accounting"] },
    { href: "/dashboard/recipes", label: "فرمول ساخت", icon: "book", feature: "recipes" },
    { href: "/dashboard/pricing", label: "قیمت‌گذاری هوشمند", icon: "calculator", feature: "costing" },
  ] },
  { title: "سخت‌افزار و ارسال", items: [
    { href: "/dashboard/couriers", label: "مدیریت پیک", icon: "motorcycle", feature: "courier" },
    { href: "/dashboard/zones", label: "محدوده‌های ارسال", icon: "map", feature: "zones" },
    { href: "/dashboard/devices", label: "تبلت و پوز", icon: "mobile", feature: "tablet_pos" },
    { href: "/dashboard/settings/printers/devices", label: "پرینترها و چاپ خودکار", icon: "print", feature: "cloud_printer" },
    { href: "/dashboard/caller-id", label: "کالر آیدی", icon: "phone", feature: "caller_id" },
    { href: "/dashboard/scale", label: "ترازوی دیجیتال", icon: "scale", feature: "scale" },
    { href: "/dashboard/voice-pager", label: "پیجر صوتی", icon: "bell", feature: "pager_voice" },
    { href: "/dashboard/food-court-pager", label: "پیجر فودکورت", icon: "bell", feature: "foodcourt_pager" },
  ] },
  { title: "حساب", items: [
    { href: "/dashboard/tickets", label: "پشتیبانی و تیکت", icon: "headset", feature: "support" },
    { href: "/dashboard/plan", label: "پلن و امکانات", icon: "star" },
    { href: "/dashboard/settings", label: "تنظیمات", icon: "settings" },
  ] },
];
const ALL = NAV.flatMap((g) => g.items);

export function DashboardShell({ business, user, features, planFeatures, role, plan, isAdmin, impersonating, setupTourAutoStart, children }: {
  business: { name: string; slug: string; logoEmoji: string; logoUrl: string; accentColor: string; type: string; phone: string; address: string; description: string; instagram: string };
  user: { name: string; email: string };
  features: FeatureMap; planFeatures: FeatureMap; role: string; plan: string;
  isAdmin: boolean; impersonating?: string; setupTourAutoStart: boolean; children: ReactNode;
}) {
  const pathname = usePathname();
  const cashierWorkspace = pathname === "/dashboard/cashier";
  const orderWorkspace = cashierWorkspace || pathname === "/dashboard/waiter";
  const showInvoiceShortcut = (role === "waiter" || role === "cashier") && !orderWorkspace;
  const invoiceShortcutHref = role === "waiter" ? "/dashboard/waiter" : "/dashboard/cashier";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<{ pathname: string; title: string } | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const isMgr = role === "owner" || role === "manager";
  async function logout() {
    setLoggingOut(true);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }
  const current = [...ALL].sort((a, b) => b.href.length - a.href.length).find((n) => (n.href === "/dashboard" ? pathname === n.href : pathname.startsWith(n.href)));
  const activeGroup = NAV.find((g) => g.title && g.items.includes(current as Item))?.title;
  const defaultExpandedGroup = activeGroup ?? NAV.find((g) => g.title)?.title;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuTriggerRef.current;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])');
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus());
    };
  }, [open]);

  const sidebar = (
    <div className="panel-sidebar flex h-full flex-col border-e border-base-300 bg-base-100 text-base-content">
      <div className="border-b border-base-200 px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center overflow-hidden rounded-2xl bg-primary text-white shadow-lg shadow-primary/20"><BrandLogo url={business.logoUrl} alt="" className="size-full bg-white object-contain p-1.5" fallback={<EmojiIcon emoji={business.logoEmoji} className="text-xl" />} /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-extrabold">{business.name}</span><span className="mt-1 inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">{role === "owner" ? "پلن " + planName(plan) : STAFF_ROLE_LABELS[role] ?? role}</span></span>
        </Link>
      </div>
      <div className="px-3 pb-1 pt-3">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-base-content/45" />
          <input
            ref={searchRef}
            type="search"
            value={menuSearch}
            onChange={(event) => setMenuSearch(event.target.value)}
            aria-label="جست‌وجو در منوی پنل"
            placeholder="جست‌وجوی بخش‌ها..."
            autoComplete="off"
            className="input input-bordered h-10 w-full rounded-xl bg-base-200/60 pe-9 ps-10 text-sm"
          />
          {menuSearch && <button type="button" onClick={() => setMenuSearch("")} aria-label="پاک کردن جست‌وجو" className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-base-content/50 hover:text-base-content"><Icon name="x" className="size-3.5" /></button>}
        </div>
      </div>
      <nav aria-label="منوی پنل رستوران" className="menu flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-3">
        {isAdmin && <Link href="/admin" onClick={() => { setOpen(false); setMenuSearch(""); }} className="flex min-h-10 shrink-0 items-center gap-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100"><Icon name="shield" className="size-4" />پنل مدیر سامانه</Link>}
        {NAV.map((g, gi) => {
          const available = g.items.map((n) => {
            const slug = n.href.split("/").pop() ?? "";
            const only = MODULE_ONLY[slug];
            if (only && !only.includes(role)) return null;
            if (!n.feature) return { n, locked: false };
            if (hasAny(features, n.feature)) return { n, locked: false };
            if (isMgr && !hasAny(planFeatures, n.feature)) return { n, locked: true };
            return null;
          }).filter(Boolean) as { n: Item; locked: boolean }[];
          const groupMatches = !!menuSearch && !!g.title && g.title.toLowerCase().includes(menuSearch.trim().toLowerCase());
          const visible = available.filter(({ n }) => !menuSearch.trim() || groupMatches || n.label.toLowerCase().includes(menuSearch.trim().toLowerCase()));
          if (!visible.length) return null;
          const expanded = !!menuSearch.trim() || (expandedGroup?.pathname === pathname ? expandedGroup.title === g.title : g.title === defaultExpandedGroup);
          return <div key={gi} className="w-full shrink-0 space-y-1 border-b border-base-200/80 pb-2 last:border-0">
            {g.title && <button type="button" aria-expanded={expanded} onClick={() => setExpandedGroup({ pathname, title: expanded ? "" : g.title ?? "" })} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3.5 py-2 text-start text-[11px] font-extrabold text-base-content/55 transition hover:bg-base-200 hover:text-base-content">
              <span className="flex-1">{g.title}</span>
              <span className="rounded-full bg-base-200 px-2 py-0.5 text-[10px] tabular-nums">{visible.length.toLocaleString("fa-IR")}</span>
              <Icon name="chevronDown" className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
            </button>}
            {(!g.title || expanded) && <div className="flex w-full shrink-0 flex-col gap-1">
              {visible.map(({ n, locked }) => {
                const active = n === current;
                const href = locked ? "/dashboard/plan?locked=" + (Array.isArray(n.feature) ? n.feature[0] : n.feature) : n.href;
                return <Link key={n.href} href={href} aria-current={active ? "page" : undefined} aria-label={locked ? n.label + " (قفل؛ مشاهده‌ی پلن)" : undefined} onClick={() => { setOpen(false); setMenuSearch(""); }} className={cn("group flex min-h-11 w-full min-w-0 shrink-0 items-center gap-3 rounded-2xl px-2.5 py-1.5 text-[13px] font-semibold transition", active ? "bg-primary text-primary-content shadow-md shadow-primary/15" : locked ? "text-base-content/40 hover:bg-base-200" : "text-base-content/70 hover:bg-base-200 hover:text-base-content")}>
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl transition", active ? "bg-white/15" : "bg-base-200/80 group-hover:bg-base-300/70")}><Icon name={n.icon} className={cn("size-4", locked && "opacity-50")} /></span>
                  <span className="flex-1">{n.label}</span>
                  {locked && <Icon name="lock" className="size-3.5" />}
                </Link>;
              })}
            </div>}
          </div>;
        })}
        {menuSearch && !NAV.some((g) => g.items.some((n) => n.label.toLowerCase().includes(menuSearch.trim().toLowerCase()) || g.title?.toLowerCase().includes(menuSearch.trim().toLowerCase()))) && <p className="rounded-xl bg-base-200 px-3.5 py-3 text-xs text-base-content/60">بخشی با این نام پیدا نشد.</p>}
      </nav>
      <div className="m-3 rounded-2xl bg-base-200/75 p-3">
        <Link href={"/m/" + business.slug} target="_blank" className="flex items-center justify-between rounded-xl bg-base-100 px-3 py-2.5 text-xs font-bold text-base-content shadow-sm transition hover:text-primary">نمایش منوی مشتری<Icon name="external" className="size-4" /></Link>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">{user.name.trim()[0]}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{user.name}</p><p className="truncate text-[11px] text-base-content/55" dir="ltr">{user.email}</p></div>
          <button onClick={logout} disabled={loggingOut} aria-label="خروج" title="خروج" className="btn btn-ghost btn-square btn-sm text-base-content/55 hover:text-error"><Icon name="logout" className="size-[18px]" /></button>
        </div>
      </div>
    </div>
  );
  return <ToastProvider><FeaturesProvider features={features} role={role}>
    <div className={cn("min-h-dvh bg-base-200/70", cashierWorkspace && "cashier-shell")} style={brandThemeStyle(business.accentColor)}>
      <aside className="no-print fixed inset-y-0 start-0 z-30 hidden w-72 lg:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden">
        <button type="button" aria-label="بستن منو" onClick={() => setOpen(false)} className="absolute inset-0 animate-fade-in bg-base-content/45 backdrop-blur-sm" />
        <aside ref={drawerRef} id="restaurant-navigation-drawer" role="dialog" aria-modal="true" aria-label="منوی پنل رستوران" tabIndex={-1} className="absolute inset-y-0 start-0 w-80 max-w-[90vw] animate-slide-up outline-none">{sidebar}</aside>
      </div>}
      <div className="lg:ps-72 print:ps-0">
        <header className="no-print sticky top-0 z-20 flex h-[4.5rem] items-center gap-3 border-b border-base-300/70 bg-base-100/90 px-4 shadow-sm shadow-slate-900/[0.02] backdrop-blur-xl sm:px-6">
          <button ref={menuTriggerRef} type="button" aria-label="منو" aria-expanded={open} aria-controls="restaurant-navigation-drawer" onClick={() => setOpen(true)} className="btn btn-ghost btn-square btn-sm inline-flex size-9 items-center justify-center rounded-xl text-base-content/65 transition hover:bg-base-200 hover:text-base-content lg:hidden"><Icon name="menuBurger" className="size-[18px]" /></button>
          <div className="min-w-0"><p className="text-[10px] font-bold text-base-content/45">پنل مدیریت کسب‌وکار</p><h2 className="truncate text-sm font-extrabold sm:text-base">{current?.label ?? "داشبورد"}</h2></div>
          <div className="ms-auto flex items-center gap-1.5 sm:gap-2"><span className="hidden items-center gap-2 rounded-full bg-success/10 px-3 py-2 text-xs font-bold text-success xl:inline-flex"><span className="size-1.5 rounded-full bg-success" />سامانه فعال</span>{role === "owner" && !isAdmin && !impersonating && <RestaurantSetupTour features={planFeatures} plan={plan} autoStart={setupTourAutoStart} />}<Link href={"/m/" + business.slug} target="_blank" className="btn btn-primary btn-sm rounded-xl px-3"><Icon name="external" className="size-4" /><span className="hidden sm:inline">نمایش منو</span></Link></div>
        </header>
        <main className={cashierWorkspace ? "cashier-main" : "mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8"}>
          {cashierWorkspace ? <details className="cashier-notices"><summary>اعلان‌های سامانه</summary><DashboardBanners impersonating={impersonating} canManage={role === "owner" || role === "manager"} /></details> : <div className="mb-5 empty:hidden"><DashboardBanners impersonating={impersonating} canManage={role === "owner" || role === "manager"} /></div>}{children}</main>
      </div>
      {showInvoiceShortcut && <Link href={invoiceShortcutHref} aria-label="ثبت فاکتور جدید" title="ثبت فاکتور جدید" className="no-print fixed end-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-extrabold text-primary-content shadow-xl shadow-primary/25 transition hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:end-6 sm:px-5"><Icon name="orders" className="size-5"/><span>ثبت فاکتور</span><span className="flex size-6 items-center justify-center rounded-full bg-white/20"><Icon name="plus" className="size-3.5"/></span></Link>}
    </div>
  </FeaturesProvider></ToastProvider>;
}
