"use client";

import { useEffect, useState } from "react";
import { BarChart3, Gift, Repeat, UserPlus, Users, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { formatNumber, formatPrice, toFa } from "@/lib/format";
import { Badge, Card, ErrorState, Skeleton, cn } from "@/components/ui";

type Point = { month: string; newBuyers: number; returningCustomers: number; referredCustomers: number; paidOrders: number; revenue: number };
type Analytics = {
  months: number;
  summary: { totalCustomers: number; newSignups: number; newBuyers: number; returningCustomers: number; referredCustomers: number; activeBuyers: number; retentionPercent: number; averageOrders: number; paidOrders: number; revenue: number };
  series: Point[];
  topReferrers: { id: number; name: string; referrals: number }[];
  definitions: { newBuyer: string; returningCustomer: string; referredCustomer: string };
};

const chartKeys = [
  { key: "newBuyers", label: "اولین خرید", color: "bg-sky-500" },
  { key: "returningCustomers", label: "بازگشتی", color: "bg-indigo-500" },
  { key: "referredCustomers", label: "معرفی‌شده", color: "bg-emerald-500" },
] as const;

function monthLabel(month: string) {
  const date = new Date(`${month}T12:00:00+03:30`);
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short", year: "2-digit", timeZone: "Asia/Tehran" }).format(date);
}

function Metric({ label, value, detail, icon: MetricIcon, color }: { label: string; value: string; detail: string; icon: LucideIcon; color: string }) {
  return <Card className="min-w-0 border border-base-300 p-4 shadow-sm">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-medium text-base-content/60">{label}</p><p className="mt-2 truncate text-xl font-black tabular-nums">{value}</p></div><span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", color)}><MetricIcon className="size-5" aria-hidden="true" /></span></div>
    <p className="mt-2 text-[11px] leading-5 text-base-content/50">{detail}</p>
  </Card>;
}

export function CustomerAnalytics() {
  const [months, setMonths] = useState<3 | 6 | 12>(6);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<{ months: number; message: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    api<Analytics>(`/api/r/customer-analytics?months=${months}`)
      .then((next) => { if (active) { setData(next); setError(null); } })
      .catch((cause) => { if (active) setError({ months, message: (cause as Error).message }); });
    return () => { active = false; };
  }, [months, refresh]);

  const max = Math.max(1, ...(data?.series.flatMap((point) => chartKeys.map(({ key }) => point[key])) ?? []));
  const currentError = error?.months === months ? error.message : "";
  const loading = (!data || data.months !== months) && !currentError;
  return <section aria-labelledby="customer-analytics-title" className="mb-5 space-y-3">
    <Card className="overflow-hidden border border-base-300 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-200 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><BarChart3 className="size-5" aria-hidden="true" /></span><div><h2 id="customer-analytics-title" className="font-extrabold">تحلیل رفتار مشتریان</h2><p className="mt-1 text-xs leading-5 text-base-content/55">تکرار خرید، مشتریان تازه و اثر معرفی دهان‌به‌دهان را دنبال کنید.</p></div></div>
        <div className="join rounded-xl border border-base-300 bg-base-100 p-1" aria-label="بازه تحلیل">
          {([3, 6, 12] as const).map((value) => <button key={value} type="button" className={cn("join-item btn btn-xs border-0 px-3", months === value ? "btn-primary" : "btn-ghost")} onClick={() => setMonths(value)}>{toFa(value)} ماه</button>)}
        </div>
      </div>
      {loading ? <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div> : currentError ? <div className="p-4"><ErrorState message={currentError} onRetry={() => setRefresh((value) => value + 1)} /></div> : data && <div className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="اولین خرید" value={formatNumber(data.summary.newBuyers)} detail="خریدارانی که نخستین سفارش پرداخت‌شده‌شان در این بازه است" icon={UserPlus} color="bg-sky-50 text-sky-700" />
          <Metric label="مشتری بازگشتی" value={formatNumber(data.summary.returningCustomers)} detail="خریدارانی که در این بازه دوباره سفارش پرداخت‌شده داشته‌اند" icon={Repeat} color="bg-indigo-50 text-indigo-700" />
          <Metric label="معرفی‌شده" value={formatNumber(data.summary.referredCustomers)} detail="حساب‌های تازه‌ای که کد دعوت مشتری دیگری را ثبت کرده‌اند" icon={Gift} color="bg-emerald-50 text-emerald-700" />
          <Metric label="نرخ بازگشت" value={`${formatNumber(data.summary.retentionPercent)}٪`} detail={`${formatNumber(data.summary.activeBuyers)} خریدار فعال در بازه`} icon={BarChart3} color="bg-violet-50 text-violet-700" />
          <Metric label="ثبت‌نام جدید" value={formatNumber(data.summary.newSignups)} detail={`از ${formatNumber(data.summary.totalCustomers)} مشتری ثبت‌شده در باشگاه`} icon={Users} color="bg-amber-50 text-amber-700" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,.8fr)]">
          <div className="min-w-0 rounded-2xl border border-base-200 bg-base-100 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">روند ماهانه مشتریان</h3><p className="mt-1 text-[11px] leading-5 text-base-content/50">اولین خرید، خرید مجدد و حساب‌های منتسب از کد دعوت</p></div><Badge color="blue">{toFa(months)} ماه اخیر</Badge></div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-base-content/60">{chartKeys.map((item) => <span key={item.key} className="inline-flex items-center gap-1.5"><i className={cn("size-2.5 rounded-sm", item.color)} />{item.label}</span>)}</div>
            <div className="mt-3 overflow-x-auto pb-2">
              <div className="grid h-48 min-w-[560px] items-end gap-2 border-b border-base-300 px-1" style={{ gridTemplateColumns: `repeat(${data.series.length}, minmax(32px, 1fr))` }} role="img" aria-label="نمودار ماهانه مشتریان جدید، بازگشتی و معرفی‌شده">
                {data.series.map((point) => <div key={point.month} className="flex h-full min-w-0 flex-col items-center justify-end gap-2" title={`${monthLabel(point.month)} · اولین خرید ${formatNumber(point.newBuyers)} · بازگشتی ${formatNumber(point.returningCustomers)} · معرفی‌شده ${formatNumber(point.referredCustomers)}`}>
                  <div className="flex h-36 w-full items-end justify-center gap-1">
                    {chartKeys.map((item) => <span key={item.key} className={cn("w-2.5 max-w-[22%] rounded-t-sm transition-[height] sm:w-4", item.color)} style={{ height: `${point[item.key] ? Math.max(4, (point[item.key] / max) * 100) : 2}%` }} />)}
                  </div>
                  <span className="max-w-full truncate text-[9px] text-base-content/50">{monthLabel(point.month)}</span>
                </div>)}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-base-content/60"><span>سفارش پرداخت‌شده: <b className="text-base-content">{formatNumber(data.summary.paidOrders)}</b></span><span>میانگین دفعات خرید: <b className="text-base-content">{toFa(data.summary.averageOrders)}</b></span><span>فروش این مشتریان: <b className="text-base-content">{formatPrice(data.summary.revenue)}</b></span></div>
          </div>

          <div className="rounded-2xl border border-base-200 bg-base-100 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold">مشتریانی که بیشتر معرفی کرده‌اند</h3><p className="mt-1 text-[11px] text-base-content/50">بر پایه کدهای دعوت ثبت‌شده</p></div><Gift className="size-5 text-emerald-600" aria-hidden="true" /></div>
            {data.topReferrers.length ? <ol className="mt-4 space-y-4">{data.topReferrers.map((person, index) => <li key={person.id}><div className="flex items-center gap-2 text-xs"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-base-200 font-bold">{toFa(index + 1)}</span><span className="min-w-0 flex-1 truncate font-semibold">{person.name}</span><b className="shrink-0">{formatNumber(person.referrals)} معرفی</b></div><div className="ms-8 mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(8, (person.referrals / Math.max(...data.topReferrers.map((row) => row.referrals))) * 100)}%` }} /></div></li>)}</ol> : <div className="mt-5 rounded-xl border border-dashed border-base-300 px-4 py-7 text-center"><Gift className="mx-auto size-6 text-base-content/30" aria-hidden="true" /><p className="mt-2 text-xs font-semibold">هنوز معرفی‌ای ثبت نشده</p><p className="mt-1 text-[11px] leading-5 text-base-content/50">مشتری‌ها از پروفایلشان لینک دعوت را کپی می‌کنند و دوستشان هنگام ورود با OTP کد را ثبت می‌کند.</p></div>}
            <div className="mt-4 rounded-xl bg-base-200/60 p-3 text-[10px] leading-5 text-base-content/60"><b className="text-base-content/75">تعریف شاخص‌ها:</b> اولین خرید با نخستین سفارش پرداخت‌شده سنجیده می‌شود؛ بازگشتی یعنی خریدار دارای سفارش قدیمی‌تر؛ معرفی‌شده با اتصال کد دعوت ثبت می‌شود.</div>
          </div>
        </div>
      </div>}
    </Card>
  </section>;
}
