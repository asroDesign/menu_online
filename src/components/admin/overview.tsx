"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatCompact, formatNumber, formatPrice, formatShortDate, toFa } from "@/lib/format";
import { fmtJ } from "@/lib/jalali";
import { PLANS, planName } from "@/lib/plans";
import { TICKET_DEPTS } from "@/lib/admin-meta";
import { Badge, Button, Card, ErrorState, Skeleton } from "@/components/ui";
import { Bars, PLAN_COLOR, Stat, useGet, type Nav } from "@/components/admin/common";

export function Overview({ go }: { go: Nav }) {
  const { data: d, error, reload } = useGet<any>("/api/admin/stats", 30000);
  if (error) return <ErrorState message={error} onRetry={() => reload()} />;
  if (!d) return <div className="space-y-4"><Skeleton className="h-10 w-60" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div><Skeleton className="h-72 rounded-2xl" /></div>;
  const openTk = (d.tickets as any[]).filter((t) => t.status === "open");
  const openN = openTk.reduce((s, t) => s + t.n, 0), unassigned = openTk.filter((t) => t.unassigned).reduce((s, t) => s + t.n, 0);
  const alerts = ([
    d.upgradeRequests.length > 0 && { tone: "bg-sky-50 text-sky-900 ring-sky-200", text: `${toFa(d.upgradeRequests.length)} درخواست ارتقای پلن در انتظار بررسی`, tab: "businesses", p: { filter: "upgrade" } },
    d.expired.length > 0 && { tone: "bg-rose-50 text-rose-900 ring-rose-200", text: `${toFa(d.expired.length)} اشتراک منقضی‌شده (به پلن پایه برگشته‌اند)`, tab: "businesses", p: { filter: "expired" } },
    d.expiring.length > 0 && { tone: "bg-amber-50 text-amber-900 ring-amber-200", text: `${toFa(d.expiring.length)} اشتراک تا ۱۴ روز آینده تمام می‌شود`, tab: "businesses", p: { filter: "expiring" } },
    d.revenue.unpaidCount > 0 && { tone: "bg-violet-50 text-violet-900 ring-violet-200", text: `${toFa(d.revenue.unpaidCount)} فاکتور پرداخت‌نشده به مبلغ ${formatPrice(d.revenue.unpaid)}`, tab: "accounting", p: { sub: "invoices", status: "unpaid" } },
    unassigned > 0 && { tone: "bg-amber-50 text-amber-900 ring-amber-200", text: `${toFa(unassigned)} تیکت باز بدون کارشناس`, tab: "tickets", p: { assigned: "none", status: "open" } },
  ].filter(Boolean) as unknown) as { tone: string; text: string; tab: string; p: Record<string, string> }[];

  return (
    <div className="animate-fade-in space-y-5">
      <div><h1 className="text-xl font-extrabold sm:text-2xl">نمای کلی سامانه</h1><p className="mt-1 text-sm text-stone-500">وضعیت لحظه‌ای کسب‌وکارها، فروش، اشتراک‌ها و پشتیبانی</p></div>

      {alerts.length > 0 && <div className="grid gap-2.5 md:grid-cols-2">{alerts.map((a, i) => <button key={i} onClick={() => go(a.tab, a.p)} className={`flex items-center justify-between rounded-2xl px-4 py-3 text-start text-sm font-semibold ring-1 transition hover:shadow ${a.tone}`}><span>{a.text}</span><span>←</span></button>)}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="🏪" label="کسب‌وکارها" value={formatNumber(d.tenants.total)} sub={`${toFa(d.tenants.active)} فعال · ${toFa(d.tenants.suspended)} مسدود · ${toFa(d.tenants.newThisMonth)} جدید در این ماه`} />
        <Stat icon="🧾" label="فروش ثبت‌شده (۳۰ روز)" value={formatPrice(d.orders.gmv30)} tone="text-emerald-600" sub={`${toFa(d.orders.n30)} سفارش پرداخت‌شده · کل: ${formatCompact(d.orders.gmvTotal)}`} />
        <Stat icon="💰" label="درآمد اشتراک (این ماه)" value={formatPrice(d.revenue.month)} tone="text-brand-600" sub={`از ابتدای سال: ${formatPrice(d.revenue.year)}`} />
        <Stat icon="🎧" label="تیکت‌های باز" value={formatNumber(openN)} tone={openN ? "text-amber-600" : "text-stone-900"} sub={`${toFa(unassigned)} بدون کارشناس`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2"><h3 className="mb-4 font-bold">فروش روزانه‌ی کل کسب‌وکارها (۱۴ روز)</h3>
          <Bars data={(d.daily as any[]).map((x) => ({ label: toFa(formatShortDate(x.d).replace(/\D+/g, " ").trim().split(" ").pop() ?? ""), value: x.gmv }))} fmt={formatPrice} />
          {d.daily.length === 0 && <p className="text-center text-sm text-stone-400">سفارشی ثبت نشده</p>}
        </Card>
        <Card className="p-5"><h3 className="mb-4 font-bold">توزیع پلن‌ها</h3>
          <ul className="space-y-3">{PLANS.map((p) => { const n = d.byPlan[p.key] ?? 0; const pct = d.tenants.total ? (n / d.tenants.total) * 100 : 0; return <li key={p.key}><div className="flex justify-between text-sm"><span className="font-semibold">{p.name}</span><b>{toFa(n)}</b></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-gradient-to-l from-brand-400 to-brand-600" style={{ width: `${pct}%` }} /></div></li>; })}</ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5"><h3 className="mb-4 font-bold">ثبت‌نام جدید (۳۰ روز)</h3><Bars color="bg-sky-400" data={(d.signups as any[]).map((x, i) => ({ label: i % 5 === 0 ? toFa(formatShortDate(x.d).replace(/\D+/g, " ").trim().split(" ").pop() ?? "") : "", value: x.n }))} /></Card>
        <Card className="p-5"><h3 className="mb-3 font-bold">پرفروش‌ترین کسب‌وکارها (۳۰ روز)</h3>
          <ul className="space-y-2.5">{(d.top as any[]).map((t, i) => <li key={t.id} className="flex items-center gap-2.5 text-sm"><span className="flex size-6 items-center justify-center rounded-md bg-stone-100 text-[11px] font-bold">{toFa(i + 1)}</span><span className="min-w-0 flex-1 truncate font-medium">{t.name}</span><Badge color={PLAN_COLOR[t.plan]}>{planName(t.plan)}</Badge><b className="w-24 text-end text-xs">{formatCompact(t.gmv)}</b></li>)}</ul>
        </Card>
        <Card className="p-5"><h3 className="mb-3 font-bold">تیکت‌های باز به تفکیک بخش</h3>
          <ul className="space-y-2.5">{Object.entries(TICKET_DEPTS).map(([k, v]) => { const n = openTk.filter((t) => t.dept === k).reduce((s, t) => s + t.n, 0); return <li key={k} className="flex items-center justify-between text-sm"><span>{v.emoji} {v.label}</span><Badge color={n ? "amber" : "stone"}>{toFa(n)}</Badge></li>; })}</ul>
          <Button size="sm" variant="secondary" className="mt-4 w-full" onClick={() => go("tickets")}>مشاهده تیکت‌ها</Button>
        </Card>
      </div>

      {(d.expiring.length > 0 || d.expired.length > 0 || d.upgradeRequests.length > 0) && (
        <Card className="overflow-hidden">
          <div className="border-b border-stone-100 p-4 font-bold">نیازمند اقدام</div>
          <ul className="divide-y divide-stone-100 text-sm">
            {(d.upgradeRequests as any[]).map((t) => <li key={`u${t.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3"><b className="min-w-40">{t.name}</b><Badge color="blue">درخواست ارتقا به {planName(t.to)}</Badge><Button size="sm" variant="secondary" className="ms-auto" onClick={() => go("accounting", { sub: "invoices", create: String(t.id), plan: t.to })}>صدور فاکتور</Button><Button size="sm" variant="ghost" onClick={() => go("businesses", { open: String(t.id) })}>مشاهده</Button></li>)}
            {([...d.expired.map((t: any) => ({ ...t, k: "x" })), ...d.expiring.map((t: any) => ({ ...t, k: "e" }))] as any[]).map((t) => <li key={`${t.k}${t.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3"><b className="min-w-40">{t.name}</b><Badge color={PLAN_COLOR[t.plan]}>{planName(t.plan)}</Badge><Badge color={t.k === "x" ? "rose" : "amber"}>{t.k === "x" ? "منقضی شد" : "رو به پایان"} · {fmtJ(t.endsAt)}</Badge><Button size="sm" variant="secondary" className="ms-auto" onClick={() => go("accounting", { sub: "invoices", create: String(t.id), plan: t.plan })}>صدور فاکتور تمدید</Button></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
