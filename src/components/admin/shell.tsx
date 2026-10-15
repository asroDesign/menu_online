"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { ADMIN_DEPTS, type AdminPerm } from "@/lib/admin-meta";
import { Badge, cn, Icon, IconButton, ToastProvider } from "@/components/ui";
import type { Me } from "@/components/admin/common";
import { Overview } from "@/components/admin/overview";
import { Businesses } from "@/components/admin/businesses";
import { AdminAccounting } from "@/components/admin/accounting";
import { AdminTickets } from "@/components/admin/tickets";
import { UsersTab } from "@/components/admin/users";
import { PlansTab } from "@/components/admin/plans";
import { AnnouncementsTab, AuditTab, SettingsTab } from "@/components/admin/misc";

type Tab = { key: string; label: string; emoji: string; perm: AdminPerm };
const TABS: Tab[] = [
  { key: "overview", label: "نمای کلی", emoji: "🏠", perm: "overview" },
  { key: "businesses", label: "کسب‌وکارها", emoji: "🏪", perm: "businesses" },
  { key: "accounting", label: "اشتراک‌ها و حسابداری", emoji: "💰", perm: "accounting" },
  { key: "tickets", label: "تیکت‌ها", emoji: "🎧", perm: "tickets" },
  { key: "plans", label: "پلن‌ها و قیمت‌ها", emoji: "🧩", perm: "plans" },
  { key: "users", label: "کاربران و تیم", emoji: "👥", perm: "users" },
  { key: "announcements", label: "اطلاعیه‌ها", emoji: "📢", perm: "announcements" },
  { key: "settings", label: "تنظیمات سامانه", emoji: "⚙️", perm: "settings" },
  { key: "audit", label: "گزارش فعالیت", emoji: "📜", perm: "audit" },
];

export function AdminShell({ me }: { me: Me }) {
  return <ToastProvider><Inner me={me} /></ToastProvider>;
}

function Inner({ me }: { me: Me }) {
  const router = useRouter();
  const allowed = useMemo(() => TABS.filter((t) => me.perms.includes(t.perm)), [me.perms]);
  const [tab, setTab] = useState<string>(allowed[0]?.key ?? "overview");
  const [params, setParams] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [openTickets, setOpenTickets] = useState<number | null>(null);

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

  async function logout() { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); router.push("/login"); router.refresh(); }
  const dept = ADMIN_DEPTS[me.dept] ?? ADMIN_DEPTS.super;
  const current = allowed.find((t) => t.key === tab);

  const sidebar = (
    <div className="flex h-full flex-col bg-stone-950 text-stone-300">
      <div className="flex items-center gap-3 px-5 py-5"><span className="flex size-10 items-center justify-center rounded-xl bg-rose-500 text-xl shadow-lg shadow-rose-500/30">🛡️</span><div><p className="text-sm font-bold text-white">پنل مدیر سامانه</p><p className="text-[11px] text-stone-400">منوی دیجیتال</p></div></div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {allowed.map((t) => (
          <button key={t.key} onClick={() => go(t.key)} className={cn("flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-start text-sm font-medium transition", tab === t.key ? "bg-rose-500 text-white shadow-md shadow-rose-500/20" : "hover:bg-white/5 hover:text-white")}>
            <span className="w-5 text-center text-base">{t.emoji}</span><span className="flex-1">{t.label}</span>
            {t.key === "tickets" && !!openTickets && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-stone-900">{openTickets.toLocaleString("fa-IR")}</span>}
          </button>
        ))}
      </nav>
      <div className="m-3 rounded-2xl bg-white/5 p-3">
        <Link href="/dashboard" className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/15">داشبورد رستوران من <Icon name="external" className="size-4" /></Link>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-stone-700 text-sm font-bold text-white">{me.name.trim()[0]}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{me.name}</p><p className="text-[11px] text-stone-400">{dept.emoji} {dept.label}</p></div>
          <button onClick={logout} aria-label="خروج" title="خروج" className="rounded-lg p-2 text-stone-400 hover:bg-white/10 hover:text-white"><Icon name="logout" className="size-[18px]" /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[#f6f5f3]">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 animate-fade-in bg-stone-900/50" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 start-0 w-72 max-w-[85%] animate-slide-up">{sidebar}</aside></div>}
      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-stone-200/70 bg-white/80 px-4 backdrop-blur lg:hidden"><IconButton icon="menuBurger" label="منو" onClick={() => setOpen(true)} /><h2 className="text-sm font-bold">{current?.label}</h2><Badge color="rose" className="ms-auto">{dept.label}</Badge></header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
          {tab === "overview" && <Overview go={go} />}
          {tab === "businesses" && <Businesses me={me} params={params} />}
          {tab === "accounting" && <AdminAccounting me={me} params={params} />}
          {tab === "tickets" && <AdminTickets me={me} params={params} />}
          {tab === "plans" && <PlansTab />}
          {tab === "users" && <UsersTab me={me} />}
          {tab === "announcements" && <AnnouncementsTab />}
          {tab === "settings" && <SettingsTab me={me} />}
          {tab === "audit" && <AuditTab />}
        </main>
      </div>
    </div>
  );
}
