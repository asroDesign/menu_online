"use client";

import "@/components/panel-sidebar.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { BrandLogo, usePlatformBranding } from "@/components/brand";
import { ADMIN_DEPTS, type AdminPerm } from "@/lib/admin-meta";
import { Badge, cn, EmojiIcon, Icon, ToastProvider} from "@/components/ui";
import type { Me } from "@/components/admin/common";
import { Overview } from "@/components/admin/overview";
import { Businesses } from "@/components/admin/businesses";
import { AdminAccounting } from "@/components/admin/accounting";
import { AdminTickets } from "@/components/admin/tickets";
import { UsersTab } from "@/components/admin/users";
import { PlansTab } from "@/components/admin/plans";
import { AnnouncementsTab, AuditTab, PlatformChannelsTab, SettingsTab } from "@/components/admin/misc";
import { AffiliatesTab, ContentTab, LeadsTab } from "@/components/admin/marketing";

type Tab = { key: string; label: string; emoji: string; perm: AdminPerm };
const TABS: Tab[] = [
  { key: "overview", label: "نمای کلی", emoji: "", perm: "overview" },
  { key: "businesses", label: "کسب‌وکارها", emoji: "", perm: "businesses" },
  { key: "accounting", label: "اشتراک‌ها و حسابداری", emoji: "", perm: "accounting" },
  { key: "tickets", label: "تیکت‌ها", emoji: "", perm: "tickets" },
  { key: "leads", label: "درخواست‌های سایت", emoji: "", perm: "tickets" },
  { key: "content", label: "محتوای سایت و سئو", emoji: "", perm: "content" },
  { key: "affiliates", label: "همکاری در فروش", emoji: "", perm: "affiliates" },
  { key: "plans", label: "پلن‌ها و قیمت‌ها", emoji: "", perm: "plans" },
  { key: "users", label: "کاربران و تیم", emoji: "", perm: "users" },
  { key: "announcements", label: "اطلاعیه‌ها", emoji: "", perm: "announcements" },
  { key: "settings", label: "تنظیمات سامانه", emoji: "", perm: "settings" },
  { key: "integrations", label: "درگاه پرداخت و پیامک", emoji: "", perm: "settings" },
  { key: "audit", label: "گزارش فعالیت", emoji: "", perm: "audit" },
];
const ADMIN_GROUPS = [
  { title: "مدیریت", keys: ["overview", "businesses", "users"] },
  { title: "اشتراک و مالی", keys: ["accounting", "plans", "affiliates"] },
  { title: "وب‌سایت و پشتیبانی", keys: ["content", "leads", "tickets"] },
  { title: "سامانه", keys: ["announcements", "settings", "integrations", "audit"] },
];

export function AdminShell({ me }: { me: Me }) {
  return <ToastProvider><Inner me={me} /></ToastProvider>;
}

function Inner({ me }: { me: Me }) {
  const branding = usePlatformBranding();
  const router = useRouter();
  const allowed = useMemo(() => TABS.filter((t) => me.perms.includes(t.perm)), [me.perms]);
  const [tab, setTab] = useState<string>(allowed[0]?.key ?? "overview");
  const [params, setParams] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [openTickets, setOpenTickets] = useState<number | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const h = location.hash.replace("#", "");
    if (h && allowed.some((t) => t.key === h)) setTab(h); // eslint-disable-line react-hooks/set-state-in-effect
  }, [allowed]);
  const go = (t: string, p: Record<string, string> = {}) => { setTab(t); setParams(p); setOpen(false); history.replaceState(null, "", `#${t}`); window.scrollTo({ top: 0 }); };

  useEffect(() => {
    if (!me.perms.includes("tickets")) return;
    const load = () => api<{ counts: { st: string; n: number }[] }>("/api/admin/tickets?status=open").then((r) => setOpenTickets(r.counts.filter((c) => c.st === "open").reduce((s, c) => s + c.n, 0))).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [me.perms]);

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
      const elements = drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
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
    requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>('nav button')?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus());
    };
  }, [open]);

  async function logout() { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); router.push("/login"); router.refresh(); }
  const dept = ADMIN_DEPTS[me.dept] ?? ADMIN_DEPTS.super;
  const current = allowed.find((t) => t.key === tab);

  const sidebar = (
    <div className="panel-sidebar flex h-full flex-col border-e border-base-300 bg-base-100 text-base-content">
      <div className="flex items-center gap-3 px-5 py-5"><span className="flex size-11 items-center justify-center overflow-hidden rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-600/20"><BrandLogo url={branding.logoUrl} alt="" className="size-full bg-white object-contain p-1.5" fallback={<Icon name="shield" className="size-5" />} /></span><div><p className="text-sm font-bold text-base-content">پنل مدیر سامانه</p><p className="text-[11px] text-base-content/50">{branding.siteName}</p></div></div>
      <nav aria-label="منوی مدیریت سامانه" className="menu flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-4">
        {ADMIN_GROUPS.map((group) => {
          const items = allowed.filter((item) => group.keys.includes(item.key));
          if (!items.length) return null;
          return <section key={group.title} className="w-full shrink-0 space-y-1 border-b border-base-200/80 pb-2 last:border-0">
            <h3 className="px-3.5 pb-1 text-[10px] font-extrabold tracking-wide text-base-content/40">{group.title}</h3>
            {items.map((t) => (
              <button key={t.key} type="button" aria-current={tab === t.key ? "page" : undefined} onClick={() => go(t.key)} className={cn("group flex min-h-11 w-full min-w-0 shrink-0 items-center gap-3 rounded-2xl px-2.5 py-1.5 text-start text-sm font-semibold transition", tab === t.key ? "bg-primary text-primary-content shadow-md shadow-primary/15" : "text-base-content/70 hover:bg-base-200 hover:text-base-content")}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl transition", tab === t.key ? "bg-white/15" : "bg-base-200/80 group-hover:bg-base-300/70")}><Icon name={t.key === "overview" ? "home" : t.key === "businesses" ? "building" : t.key === "accounting" ? "wallet" : t.key === "tickets" || t.key === "leads" ? "headset" : t.key === "plans" ? "layers" : t.key === "users" || t.key === "affiliates" ? "users" : t.key === "content" ? "book" : t.key === "announcements" ? "bell" : t.key === "settings" ? "settings" : "file"} className="size-4 shrink-0" /></span><span className="min-w-0 flex-1">{t.label}</span>
                {t.key === "tickets" && !!openTickets && <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-stone-900">{openTickets.toLocaleString("fa-IR")}</span>}
              </button>
            ))}
          </section>;
        })}
      </nav>
      <div className="m-3 rounded-2xl bg-base-200 p-3">
        <Link href="/dashboard" className="flex items-center justify-between rounded-xl bg-base-200 px-3 py-2.5 text-xs font-semibold text-base-content hover:bg-white/15">داشبورد رستوران من <Icon name="external" className="size-4" /></Link>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-stone-700 text-sm font-bold text-base-content">{me.name.trim()[0]}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-base-content">{me.name}</p><p className="flex items-center gap-1.5 text-[11px] text-base-content/50"><EmojiIcon emoji={dept.emoji} className="size-3.5" />{dept.label}</p></div>
          <button onClick={logout} aria-label="خروج" title="خروج" className="rounded-lg p-2 text-base-content/50 hover:bg-base-200 hover:text-base-content"><Icon name="logout" className="size-[18px]" /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-base-200/70">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-72 lg:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden">
        <button type="button" aria-label="بستن منو" onClick={() => setOpen(false)} className="absolute inset-0 animate-fade-in bg-stone-900/50 backdrop-blur-sm" />
        <aside ref={drawerRef} id="admin-navigation-drawer" role="dialog" aria-modal="true" aria-label="منوی مدیریت سامانه" tabIndex={-1} className="absolute inset-y-0 start-0 w-72 max-w-[90vw] animate-slide-up outline-none">{sidebar}</aside>
      </div>}
      <div className="lg:ps-72">
        <header className="sticky top-0 z-20 flex h-[4.25rem] items-center gap-2 border-b border-base-300 bg-base-100/90 px-3 backdrop-blur-xl sm:gap-3 sm:px-4">
          <button ref={menuTriggerRef} type="button" aria-label="منو" aria-expanded={open} aria-controls="admin-navigation-drawer" onClick={() => setOpen(true)} className="btn btn-ghost btn-square btn-sm inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-base-content/65 transition hover:bg-base-200 hover:text-base-content lg:hidden"><Icon name="menuBurger" className="size-[18px]" /></button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold">{current?.label}</h2>
          <Badge color="rose" className="ms-auto shrink-0">{dept.label}</Badge>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
          {tab === "overview" && <Overview go={go} />}
          {tab === "businesses" && <Businesses me={me} params={params} />}
          {tab === "accounting" && <AdminAccounting me={me} params={params} />}
          {tab === "tickets" && <AdminTickets me={me} params={params} />}
          {tab === "leads" && <LeadsTab />}
          {tab === "content" && <ContentTab />}
          {tab === "affiliates" && <AffiliatesTab />}
          {tab === "plans" && <PlansTab />}
          {tab === "users" && <UsersTab me={me} />}
          {tab === "announcements" && <AnnouncementsTab />}
          {tab === "settings" && <SettingsTab me={me} />}
          {tab === "integrations" && <PlatformChannelsTab />}
          {tab === "audit" && <AuditTab />}
        </main>
      </div>
    </div>
  );
}
