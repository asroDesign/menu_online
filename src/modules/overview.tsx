"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useFeatures } from "@/components/features";
import { Button, Card, EmptyState, ErrorState, Icon, PageHeader, Skeleton, iconGlyph, EmojiIcon, IconText} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { formatCompact, formatNumber, formatPrice, formatTime, formatWeekday, ORDER_STATUSES, timeAgo, toFa } from "@/lib/format";
import type { Order } from "@/lib/types";

type Stats = {
  today: { revenue: number; orders: number; avgTicket: number; revenueDelta: number | null };
  week: { revenue: number; orders: number; revenueDelta: number | null };
  series: { date: string; revenue: number; orders: number }[];
  top: { name: string; emoji: string; qty: number; revenue: number }[];
  statusCounts: Record<string, number>;
  activeCount: number;
  tables: { total: number; occupied: number };
  productCount: number;
  recent: Order[];
};

function Delta({ v }: { v: number | null }) {
  if (v === null) return null;
  const up = v >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`} dir="ltr">
      {up ? "▲" : "▼"} {toFa(Math.abs(Math.round(v)))}٪
    </span>
  );
}

function StatCard({ label, value, sub, icon, tone }: { label: string; value: string; sub?: React.ReactNode; icon: string; tone: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-stone-500">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
        </div>
        <span className={`flex size-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon name={icon} className="size-5" />
        </span>
      </div>
      <div className="mt-3 min-h-5 text-xs text-stone-500">{sub}</div>
    </Card>
  );
}

export default function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const feat = useFeatures();

  const load = () => {
    setError("");
    api<Stats>("/api/stats")
      .then(setStats)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(() => !document.hidden && api<Stats>("/api/stats").then(setStats).catch(() => {}), 15000);
    return () => clearInterval(t);
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;

  if (!stats)
    return (
      <div>
        <Skeleton className="mb-6 h-9 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );

  const maxRev = Math.max(1, ...stats.series.map((s) => s.revenue));
  const maxQty = Math.max(1, ...stats.top.map((t) => t.qty));
  const hasData = stats.productCount > 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="نمای کلی کسب‌وکار"
        subtitle="وضعیت لحظه‌ای فروش، سفارش‌ها و میزهای شما"
        actions={
          <Link href={feat.has("cashier_pos") ? "/dashboard/waiter" : "/dashboard/plan?locked=cashier_pos"}>
            <Button>
              <Icon name="plus" className="size-4" />
              ثبت سفارش جدید
            </Button>
          </Link>
        }
      />

      <IconText>{!hasData && (
        <div className="mb-6">
          <EmptyState
            emoji=""
            title="شروع کنید: منوی خود را بسازید"
            description="ابتدا چند دسته‌بندی و محصول اضافه کنید، سپس میزها را بسازید و QR کد چاپ کنید."
            action={
              <Link href="/dashboard/categories">
                <Button>افزودن دسته‌بندی</Button>
              </Link>
            }
          />
        </div>
      )}</IconText>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="فروش امروز" value={formatPrice(stats.today.revenue)} icon="trend" tone="bg-emerald-50 text-emerald-600" sub={<><Delta v={stats.today.revenueDelta} /> نسبت به دیروز</>} />
        <StatCard label="سفارش‌های امروز" value={formatNumber(stats.today.orders)} icon="orders" tone="bg-blue-50 text-blue-600" sub={`${toFa(stats.week.orders)} سفارش در ۷ روز اخیر`} />
        <StatCard label="سفارش‌های فعال" value={formatNumber(stats.activeCount)} icon="clock" tone="bg-amber-50 text-amber-600" sub={`${toFa(stats.tables.occupied)} از ${toFa(stats.tables.total)} میز اشغال است`} />
        <StatCard label="میانگین سفارش" value={formatPrice(stats.today.avgTicket)} icon="sparkle" tone="bg-violet-50 text-violet-600" sub="بر اساس سفارش‌های پرداخت‌شده امروز" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 p-5 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold">فروش ۷ روز گذشته</h3>
              <p className="mt-1 text-xs text-stone-500">
                مجموع: <b className="text-stone-800">{formatPrice(stats.week.revenue)}</b> <Delta v={stats.week.revenueDelta} />
              </p>
            </div>
          </div>
          <div className="mt-6 flex h-56 items-end gap-2 sm:gap-4">
            {stats.series.map((s, i) => {
              const h = Math.max(4, (s.revenue / maxRev) * 100);
              const isToday = i === stats.series.length - 1;
              return (
                <div key={s.date} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-2" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {hover === i && (
                    <div className="absolute -top-2 z-10 -translate-y-full rounded-lg bg-stone-900 px-2.5 py-1.5 text-center text-[11px] whitespace-nowrap text-white shadow-lg">
                      {formatPrice(s.revenue)}
                      <br />
                      <span className="text-stone-400">{toFa(s.orders)} سفارش</span>
                    </div>
                  )}
                  <span className="text-[10px] font-semibold text-stone-400">{formatCompact(s.revenue)}</span>
                  <div
                    className={`w-full max-w-12 rounded-t-lg transition-all duration-500 ${isToday ? "bg-brand-500" : "bg-brand-200 group-hover:bg-brand-300"}`}
                    style={{ height: `${h * 0.75}%` }}
                  />
                  <span className={`text-[11px] ${isToday ? "font-bold text-brand-600" : "text-stone-500"}`}>{isToday ? "امروز" : formatWeekday(s.date)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="min-w-0 p-5">
          <h3 className="font-bold">پرفروش‌ترین‌ها</h3>
          <p className="mt-1 text-xs text-stone-500">در ۱۴ روز گذشته</p>
          {stats.top.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-400">هنوز فروشی ثبت نشده</p>
          ) : (
            <ul className="mt-5 space-y-4">
              {stats.top.map((t, i) => (
                <li key={t.name}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-stone-100 text-[11px] font-bold text-stone-500">{toFa(i + 1)}</span>
                      <span className="truncate font-medium">{<EmojiIcon emoji={t.emoji} /> } {t.name}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-stone-500">{toFa(t.qty)} عدد</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-gradient-to-l from-brand-400 to-brand-500" style={{ width: `${(t.qty / maxQty) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="font-bold">آخرین سفارش‌ها</h3>
            <Link href="/dashboard/orders" className="text-xs font-semibold text-brand-600 hover:underline">
              مشاهده همه
            </Link>
          </div>
          {stats.recent.length === 0 ? (
            <p className="px-5 pb-10 pt-4 text-center text-sm text-stone-400">هنوز سفارشی ثبت نشده است</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {stats.recent.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-xs font-bold text-stone-600">#{toFa(o.number)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {o.tableName ?? (o.type === "takeaway" ? "بیرون‌بر" : "بدون میز")}
                      <span className="ms-2 text-xs font-normal text-stone-400">{o.items.length ? `${toFa(o.items.reduce((s, i) => s + i.quantity, 0))} آیتم` : ""}</span>
                    </p>
                    <p className="text-xs text-stone-400">
                      {formatTime(o.createdAt)} · {timeAgo(o.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                  <span className="hidden w-28 text-end text-sm font-bold sm:block">{formatPrice(o.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold">وضعیت سفارش‌های امروز</h3>
          <ul className="mt-4 space-y-2.5">
            {ORDER_STATUSES.map((s) => (
              <li key={s.key} className="flex items-center justify-between text-sm">
                <StatusBadge status={s.key} />
                <span className="font-bold">{toFa(stats.statusCounts[s.key] ?? 0)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-xl bg-stone-50 p-3.5">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>اشغال میزها</span>
              <span className="font-bold text-stone-800">
                {toFa(stats.tables.occupied)} / {toFa(stats.tables.total)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${stats.tables.total ? (stats.tables.occupied / stats.tables.total) * 100 : 0}%` }} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
