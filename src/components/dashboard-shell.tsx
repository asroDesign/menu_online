"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { FeaturesProvider } from "@/components/features";
import { cn, Icon, IconButton, ToastProvider } from "@/components/ui";
import { hasAny, planName, type FeatureMap } from "@/lib/plans";
import { MODULE_ONLY, STAFF_ROLE_LABELS } from "@/lib/roles";
import { DashboardBanners } from "@/components/dashboard-banners";

type Item = { href: string; label: string; emoji: string; feature?: string | string[] };
const NAV: { title?: string; items: Item[] }[] = [
  { items: [{ href: "/dashboard", label: "نمای کلی", emoji: "🏠" }] },
  {
    title: "سفارش و فروش",
    items: [
      { href: "/dashboard/orders", label: "سفارش‌ها", emoji: "🧾", feature: "cashier_pos" },
      { href: "/dashboard/waiter", label: "پنل گارسون", emoji: "🧑‍🍳", feature: "cashier_pos" },
      { href: "/dashboard/cashier", label: "سفارش‌گیر صندوق", emoji: "💳", feature: "cashier_pos" },
      { href: "/dashboard/kiosk", label: "سفارش‌گیر کیوسک", emoji: "🖥️", feature: "kiosk" },
      { href: "/dashboard/tables", label: "میزها و QR", emoji: "🪑", feature: ["self_order", "cashier_pos"] },
      { href: "/dashboard/discounts", label: "کد تخفیف", emoji: "🎟️", feature: "discount" },
      { href: "/dashboard/payments", label: "درگاه پرداخت", emoji: "🏦", feature: ["ipg", "installment"] },
      { href: "/dashboard/staff", label: "کارمندان", emoji: "👥", feature: "cashier_pos" },
    ],
  },
  {
    title: "منو و وب‌سایت",
    items: [
      { href: "/dashboard/products", label: "منو و محصولات", emoji: "🍽️" },
      { href: "/dashboard/categories", label: "دسته‌بندی‌ها", emoji: "🏷️" },
      { href: "/dashboard/cross-sell", label: "پیشنهاد مکمل", emoji: "🧩", feature: "cross_sell" },
      { href: "/dashboard/translations", label: "ترجمه منو", emoji: "🌐", feature: "translation" },
      { href: "/dashboard/ar", label: "واقعیت افزوده", emoji: "🕶️", feature: "ar" },
      { href: "/dashboard/mini-site", label: "مینی وبسایت", emoji: "🌍", feature: "mini_site" },
      { href: "/dashboard/domain", label: "دامنه اختصاصی", emoji: "🔗", feature: "custom_domain" },
    ],
  },
  {
    title: "مشتریان و بازاریابی",
    items: [
      { href: "/dashboard/customers", label: "باشگاه مشتریان", emoji: "💎", feature: "loyalty" },
      { href: "/dashboard/cashback", label: "کش‌بک", emoji: "🪙", feature: "cashback" },
      { href: "/dashboard/surveys", label: "نظرسنجی", emoji: "📝", feature: "surveys" },
      { href: "/dashboard/sms", label: "پنل پیامک", emoji: "✉️", feature: "sms" },
      { href: "/dashboard/bale", label: "پیام‌رسان بله", emoji: "💬", feature: "bale" },
      { href: "/dashboard/ai", label: "هوش مصنوعی", emoji: "🤖", feature: "ai" },
    ],
  },
  {
    title: "مالی و حسابداری",
    items: [
      { href: "/dashboard/accounting", label: "حسابداری (دوطرفه)", emoji: "📒", feature: "accounting" },
      { href: "/dashboard/income-expense", label: "درآمد و هزینه", emoji: "💸", feature: "income_expense" },
      { href: "/dashboard/reports", label: "گزارش فروش", emoji: "📊", feature: "sales_reports" },
      { href: "/dashboard/profit-loss", label: "سود و زیان", emoji: "📈", feature: "profit_loss" },
      { href: "/dashboard/bank", label: "گزارش بانک", emoji: "🏛️", feature: "bank_report" },
      { href: "/dashboard/assets", label: "اموال و استهلاک", emoji: "🏗️", feature: "assets" },
    ],
  },
  {
    title: "انبار و تولید",
    items: [
      { href: "/dashboard/inventory", label: "انبارداری", emoji: "📦", feature: "inventory" },
      { href: "/dashboard/stock-movements", label: "گردش انبار", emoji: "🔄", feature: "stock_movements" },
      { href: "/dashboard/stock-control", label: "کنترل انبار", emoji: "🔍", feature: "stock_control" },
      { href: "/dashboard/suppliers", label: "تأمین‌کنندگان و بدهی", emoji: "🏷️", feature: ["inventory", "accounting"] },
      { href: "/dashboard/recipes", label: "فرمول ساخت", emoji: "🧪", feature: "recipes" },
      { href: "/dashboard/costing", label: "بهای تمام‌شده", emoji: "🧮", feature: "costing" },
    ],
  },
  {
    title: "سخت‌افزار و ارسال",
    items: [
      { href: "/dashboard/couriers", label: "مدیریت پیک", emoji: "🛵", feature: "courier" },
      { href: "/dashboard/zones", label: "محدوده‌های ارسال", emoji: "🗺️", feature: "zones" },
      { href: "/dashboard/devices", label: "تبلت و پوز", emoji: "📱", feature: "tablet_pos" },
      { href: "/dashboard/printers", label: "پرینتر ابری", emoji: "🖨️", feature: "cloud_printer" },
      { href: "/dashboard/caller-id", label: "کالر آیدی", emoji: "☎️", feature: "caller_id" },
      { href: "/dashboard/scale", label: "ترازوی دیجیتال", emoji: "⚖️", feature: "scale" },
      { href: "/dashboard/voice-pager", label: "پیجر صوتی", emoji: "📢", feature: "pager_voice" },
      { href: "/dashboard/food-court-pager", label: "پیجر فودکورت", emoji: "🔔", feature: "foodcourt_pager" },
    ],
  },
  {
    title: "حساب",
    items: [
      { href: "/dashboard/tickets", label: "پشتیبانی و تیکت", emoji: "🎧", feature: "support" },
      { href: "/dashboard/plan", label: "پلن و امکانات", emoji: "⭐" },
      { href: "/dashboard/settings", label: "تنظیمات", emoji: "⚙️" },
    ],
  },
];
const ALL = NAV.flatMap((g) => g.items);

export function DashboardShell({
  business,
  user,
  features,
  planFeatures,
  role,
  plan,
  isAdmin,
  impersonating,
  children,
}: {
  business: { name: string; slug: string; logoEmoji: string };
  user: { name: string; email: string };
  features: FeatureMap;
  planFeatures: FeatureMap;
  role: string;
  plan: string;
  isAdmin: boolean;
  impersonating?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const isMgr = role === "owner" || role === "manager";

  async function logout() {
    setLoggingOut(true);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  const current = [...ALL].sort((a, b) => b.href.length - a.href.length).find((n) => (n.href === "/dashboard" ? pathname === n.href : pathname.startsWith(n.href)));

  const sidebar = (
    <div className="flex h-full flex-col bg-stone-900 text-stone-300">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-500 text-xl shadow-lg shadow-brand-500/30">{business.logoEmoji}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{business.name}</p>
          {role === "owner" ? <Link href="/dashboard/plan" onClick={() => setOpen(false)} className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold text-brand-300">⭐ پلن {planName(plan)}</Link> : <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">👤 {STAFF_ROLE_LABELS[role] ?? role}</span>}
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {isAdmin && (
          <Link href="/admin" className="flex items-center gap-3 rounded-xl bg-rose-500/15 px-3.5 py-2.5 text-sm font-bold text-rose-300 hover:bg-rose-500/25">🛡️ پنل مدیر سامانه</Link>
        )}
        {NAV.map((g, gi) => {
          const vis = g.items.map((n) => {
            const slug = n.href.split("/").pop() ?? "";
            const only = MODULE_ONLY[slug];
            if (only && !only.includes(role)) return null;
            if (!n.feature) return { n, locked: false };
            if (hasAny(features, n.feature)) return { n, locked: false };
            if (isMgr && !hasAny(planFeatures, n.feature)) return { n, locked: true };
            return null;
          }).filter(Boolean) as { n: Item; locked: boolean }[];
          if (!vis.length) return null;
          return (
            <div key={gi}>
              {g.title && <p className="mb-1.5 px-3.5 text-[10px] font-bold tracking-wide text-stone-500">{g.title}</p>}
              <div className="space-y-0.5">
                {vis.map(({ n, locked }) => {
                  const active = n === current;
                  const href = locked ? `/dashboard/plan?locked=${Array.isArray(n.feature) ? n.feature[0] : n.feature}` : n.href;
                  return (
                    <Link key={n.href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3.5 py-2 text-[13px] font-medium transition", active ? "bg-brand-500 text-white shadow-md shadow-brand-500/20" : locked ? "text-stone-500 hover:bg-white/5" : "hover:bg-white/5 hover:text-white")}>
                      <span className={cn("w-5 text-center text-base", locked && "opacity-50 grayscale")}>{n.emoji}</span>
                      <span className="flex-1">{n.label}</span>
                      {locked && <Icon name="lock" className="size-3.5" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="m-3 rounded-2xl bg-white/5 p-3">
        <Link
          href={`/m/${business.slug}`}
          target="_blank"
          className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15"
        >
          مشاهده منوی مشتری
          <Icon name="external" className="size-4" />
        </Link>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-stone-700 text-sm font-bold text-white">{user.name.trim()[0]}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{user.name}</p>
            <p className="truncate text-[11px] text-stone-400" dir="ltr">{user.email}</p>
          </div>
          <button onClick={logout} disabled={loggingOut} aria-label="خروج" title="خروج" className="rounded-lg p-2 text-stone-400 transition hover:bg-white/10 hover:text-white">
            <Icon name="logout" className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <FeaturesProvider features={features} role={role}>
        <div className="min-h-dvh">
          <aside className="no-print fixed inset-y-0 start-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
          {open && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 animate-fade-in bg-stone-900/50" onClick={() => setOpen(false)} />
              <aside className="absolute inset-y-0 start-0 w-72 max-w-[85%] animate-slide-up">{sidebar}</aside>
            </div>
          )}
          <div className="lg:ps-64 print:ps-0">
            <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-stone-200/70 bg-white/80 px-4 backdrop-blur lg:hidden">
              <IconButton icon="menuBurger" label="منو" onClick={() => setOpen(true)} />
              <h2 className="text-sm font-bold">{current?.label ?? "داشبورد"}</h2>
              <span className="ms-auto text-lg">{business.logoEmoji}</span>
            </header>
            <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8"><div className="mb-5 empty:hidden"><DashboardBanners impersonating={impersonating} canManage={role === "owner" || role === "manager"} /></div>{children}</main>
          </div>
        </div>
      </FeaturesProvider>
    </ToastProvider>
  );
}
