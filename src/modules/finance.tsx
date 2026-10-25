"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownLeft, ArrowUpLeft, BarChart3, CalendarDays, Check, ChevronLeft, Clock3, Download, Filter, Package, Printer, ReceiptText, Search, ShoppingBag, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import reportStyles from "./reports.module.css";
import { api } from "@/lib/api";
import { formatCompact, formatDate, formatNumber, formatPrice, formatShortDate, toFa } from "@/lib/format";
import { ResourcePage } from "@/components/resource-page";
import { Badge, Button, Card, ErrorState, Field, Icon, PageHeader, PersianDateInput, Skeleton, cn, iconGlyph, EmojiIcon, IconText} from "@/components/ui";
import { useFeatures } from "@/components/features";

const bankField = { key: "bankAccountId", label: "حساب", remote: { url: "/api/r/bank", label: (r: { name: string }) => r.name, none: "صندوق (نقدی)" } } as const;

type Tx = { id: number; kind: string; source: string; category: string; amount: number; description: string; date: string; accountName: string; accountMoeinName?: string; accountTafsiliName?: string };

function LedgerPage({ endpoint, title, subtitle, emoji, accountSelection = false }: { endpoint: string; title: string; subtitle: string; emoji: string; accountSelection?: boolean }) {
  const incomeAccount = (a: { level: string; type: string; nature: string; isActive: boolean }) => a.level === "moein" && a.type === "revenue" && a.nature === "credit" && a.isActive;
  const expenseAccount = (a: { level: string; type: string; nature: string; isActive: boolean }) => a.level === "moein" && a.type === "expense" && a.nature === "debit" && a.isActive;
  const detailAccounts = (a: { level: string; type: string; nature: string; isActive: boolean; parentId: number | null }, form: Record<string, any>) => {
    const isIncome = form.kind === "income";
    return a.level === "tafsili" && a.parentId === Number(form.accountMoeinId) && a.type === (isIncome ? "revenue" : "expense") && a.nature === (isIncome ? "credit" : "debit") && a.isActive;
  };
  return (
    <ResourcePage<Tx>
      title={title}
      subtitle={subtitle}
      endpoint={endpoint}
      emoji={emoji}
      emptyTitle="هنوز ردیفی ثبت نشده"
      emptyDesc="درآمدها و هزینه‌ها را ثبت کنید تا وضعیت مالی شما دقیق شود."
      addLabel="ثبت ردیف جدید"
      optimisticExtra={{ source: "manual", accountName: "…" }}
      search={(r, t) => r.category.includes(t) || r.accountMoeinName?.includes(t) === true || r.accountTafsiliName?.includes(t) === true || r.description.includes(t)}
      fields={[
        { key: "kind", label: "نوع", type: "select", options: [{ value: "expense", label: "هزینه" }, { value: "income", label: "درآمد" }], ...(accountSelection ? { resetOnChange: ["accountMoeinId", "accountTafsiliId"] } : {}) },
        ...(accountSelection ? [
          {
            key: "accountMoeinId", label: "دسته", type: "select" as const, required: true, resetOnChange: ["accountTafsiliId"],
            remote: {
              url: "/api/income-expense/accounts", label: (a: { code: string; name: string }) => `${a.code} — ${a.name}`, none: "انتخاب دسته",
              filter: (a: { level: string; type: string; nature: string; isActive: boolean }, form: Record<string, any>) => form.kind === "income" ? incomeAccount(a) : expenseAccount(a),
            },
            hint: "دسته‌های قابل انتخاب بر اساس نوع ردیف و ماهیت حساب فیلتر می‌شوند.",
          },
          {
            key: "accountTafsiliId", label: "حساب تفصیلی", type: "select" as const,
            remote: { url: "/api/income-expense/accounts", label: (a: { code: string; name: string }) => `${a.code} — ${a.name}`, none: "انتخاب حساب تفصیلی", filter: detailAccounts },
            requiredWhen: (form: Record<string, any>, remotes: Record<string, any[]>) => (remotes.accountTafsiliId ?? []).some((a) => detailAccounts(a, form)),
            disabledWhen: (form: Record<string, any>) => !form.accountMoeinId,
            hint: "اگر برای معین انتخاب‌شده تفصیلی فعال تعریف شده باشد، انتخاب آن الزامی است؛ در غیر این صورت سند روی خود معین ثبت می‌شود.",
          },
        ] : []),
        { key: "amount", label: "مبلغ (تومان)", type: "money", required: true },
        { ...bankField },
        { key: "date", label: "تاریخ", type: "date", initial: new Date().toISOString().slice(0, 10) },
        { key: "description", label: "توضیحات", type: "textarea" },
      ]}
      header={({ items }) => {
        const inc = items.filter((i) => i.kind === "income").reduce((s, i) => s + i.amount, 0);
        const exp = items.filter((i) => i.kind === "expense").reduce((s, i) => s + i.amount, 0);
        return (
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {[["درآمد", inc, "text-emerald-600"], ["هزینه", exp, "text-rose-600"], ["خالص", inc - exp, inc - exp >= 0 ? "text-emerald-600" : "text-rose-600"]].map(([l, v, c]) => (
              <Card key={l as string} className="p-4"><p className="text-xs text-stone-500">{l as string}</p><p className={cn("mt-1 text-lg font-extrabold", c as string)}>{formatPrice(v as number)}</p></Card>
            ))}
          </div>
        );
      }}
      columns={[
        { label: "تاریخ", render: (r) => <span className="whitespace-nowrap text-xs text-stone-500">{formatDate(r.date)}</span> },
        { label: "نوع", render: (r) => <Badge color={r.kind === "income" ? "emerald" : "rose"}>{r.kind === "income" ? "درآمد" : "هزینه"}</Badge> },
        { label: "دسته / شرح", render: (r) => <div><p className="font-semibold">{(accountSelection ? r.accountMoeinName : "") || r.category || "—"} {r.source === "sale" && <Badge color="blue">فروش</Badge>}</p><p className="text-xs text-stone-400">{accountSelection && r.accountTafsiliName ? `${r.accountTafsiliName} · ` : ""}{r.description}</p></div> },
        { label: "حساب", render: (r) => <span className="text-xs">{r.accountName}</span> },
        { label: "مبلغ", render: (r) => <b className={r.kind === "income" ? "text-emerald-600" : "text-rose-600"}>{r.kind === "income" ? "+" : "-"}{formatNumber(r.amount)}</b> },
      ]}
    />
  );
}
export const Accounting = () => <LedgerPage endpoint="/api/r/ledger" emoji="" title="حسابداری فروش" subtitle="دفتر روزنامه: فروش هر سفارش پرداخت‌شده خودکار ثبت می‌شود؛ ردیف دستی هم می‌توانید اضافه کنید" />;
export const IncomeExpense = () => <LedgerPage endpoint="/api/r/incomeexpense" emoji="" title="درآمد و هزینه" subtitle="ثبت هزینه‌های جاری (اجاره، حقوق، قبوض، خرید) و درآمدهای متفرقه" accountSelection />;

/* ---------- shared bits ---------- */
function Range({ days, setDays }: { days: number; setDays: (d: number) => void }) {
  return (
    <div className="flex gap-1.5">{[7, 14, 30].map((d) => <button key={d} onClick={() => setDays(d)} className={cn("rounded-xl px-3.5 py-2 text-sm font-medium transition", days === d ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200 hover:bg-stone-50")}>{toFa(d)} روز</button>)}</div>
  );
}
function Bars({ data, color = "bg-brand-400", label }: { data: { label: string; value: number }[]; color?: string; label?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className="flex h-44 items-end gap-1.5">
      {data.map((d, i) => (
        <div key={i} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${label ? label(d.value) : formatNumber(d.value)}`}>
          <div className={cn("w-full max-w-8 rounded-t-md transition-all", d.value < 0 ? "bg-rose-400" : color)} style={{ height: `${Math.max(3, (Math.abs(d.value) / max) * 80)}%` }} />
          <span className="text-[9px] text-stone-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
const expenseChartColors = ["var(--color-primary)", "#06b6d4", "#8b5cf6", "#f59e0b", "#f43f5e", "#10b981", "#6366f1", "#f97316"];
function ExpensePie({ rows }: { rows: { name: string; amount: number }[] }) {
  const visibleRows = rows.filter((row) => Number.isFinite(row.amount) && row.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = visibleRows.reduce((sum, row) => sum + row.amount, 0);
  const slices = visibleRows.map((row, index) => {
    const portion = row.amount / total;
    const precedingAmount = visibleRows.slice(0, index).reduce((sum, previous) => sum + previous.amount, 0);
    const start = -Math.PI / 2 + (precedingAmount / total) * Math.PI * 2;
    const end = start + portion * Math.PI * 2;
    const color = expenseChartColors[index % expenseChartColors.length];
    const point = (angle: number) => [64 + 58 * Math.cos(angle), 64 + 58 * Math.sin(angle)];
    const [startX, startY] = point(start);
    const [endX, endY] = point(end);
    const path = portion >= 0.999999
      ? ""
      : `M 64 64 L ${startX} ${startY} A 58 58 0 ${end - start > Math.PI ? 1 : 0} 1 ${endX} ${endY} Z`;
    return { ...row, portion, color, path };
  });

  if (!total) return <p className="py-8 text-center text-sm text-base-content/50">هزینه‌ای در این بازه ثبت نشده است.</p>;

  return <div className="space-y-4">
    <svg viewBox="0 0 128 128" role="img" aria-label={`نمودار دایره‌ای هزینه‌ها به مبلغ ${formatPrice(total)}`} className="mx-auto block size-48 max-w-full">
      <title>سهم هر دسته از کل هزینه‌ها</title>
      {slices.map((slice) => slice.portion >= 0.999999
        ? <circle key={slice.name} cx="64" cy="64" r="58" fill={slice.color} stroke="white" strokeWidth="1.5" />
        : <path key={slice.name} d={slice.path} fill={slice.color} stroke="white" strokeWidth="1.5"><title>{`${slice.name}: ${formatPrice(slice.amount)} (${toFa((slice.portion * 100).toFixed(1))}٪)`}</title></path>)}
    </svg>
    <ul className="max-h-64 space-y-2 overflow-y-auto pe-1">
      {slices.map((slice) => <li key={slice.name} className="flex min-w-0 items-center gap-2 text-xs">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} />
        <span className="min-w-0 flex-1 truncate font-medium" title={slice.name}>{slice.name}</span>
        <span className="shrink-0 text-base-content/55">{toFa((slice.portion * 100).toFixed(1))}٪</span>
        <b className="shrink-0">{formatCompact(slice.amount)}</b>
      </li>)}
    </ul>
    <div className="flex justify-between border-t border-base-300 pt-3 text-xs"><span className="text-base-content/55">جمع هزینه‌های عملیاتی</span><b>{formatPrice(total)}</b></div>
  </div>;
}
function useReport<T>(url: string, query: string | number) {
  const [d, setD] = useState<T | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    api<T>(`${url}?${typeof query === "number" ? `days=${query}` : query}`).then((r) => live && (setD(r), setErr(""))).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [url, query]);
  return { d, err };
}
const Kpi = ({ l, v, tone }: { l: string; v: string; tone?: string }) => <Card className="p-4"><p className="text-xs text-stone-500">{l}</p><p className={cn("mt-1.5 text-xl font-extrabold", tone)}>{v}</p></Card>;
function ProfitLossRow({ l, v, b, tone, sub }: { l: string; v: number; b?: boolean; tone?: string; sub?: string }) {
  return <div className={cn("flex items-center justify-between py-3 text-sm", b && "border-t-2 border-stone-200 text-base font-extrabold")}><span>{l}{sub && <span className="block text-[11px] font-normal text-stone-400">{sub}</span>}</span><span className={tone}>{formatPrice(v)}</span></div>;
}
const METHODS: Record<string, string> = { cash: "نقد", pos: "کارت‌خوان", card: "کارت به کارت", ipg: "درگاه آنلاین", snappay: "اسنپ‌پی", digipay: "دیجی‌پی", cashback: "اعتبار کش‌بک", unknown: "نامشخص" };
const TYPES: Record<string, string> = { dine_in: "سالن", takeaway: "بیرون‌بر", delivery: "ارسال" };

type SalesRep = {
  totals: { revenue: number; orders: number; avg: number; discounts: number; tax: number; cogs: number; grossProfit: number; soldItems: number };
  series: { date: string; revenue: number; orders: number }[];
  hours: { hour: number; orders: number }[];
  methods: { method: string; amount: number; count: number }[];
  types: { type: string; amount: number; count: number }[];
  byProduct: { name: string; emoji: string; qty: number; revenue: number }[];
  byCategory: { name: string; revenue: number; qty: number }[];
  unsoldProducts: string[];
  recentOrders: { id: number; number: number; status: string; paymentStatus: string; paymentMethod: string | null; type: string; total: number; createdAt: string; itemCount: number }[];
  statuses: { status: string; count: number; amount: number }[];
  recentTransactions: { id: number; amount: number; date: string; orderNumber: number; method: string | null }[];
};
type MenuFunnel = { views: number; categoryViews: number; productViews: number; addToCart: number; checkoutStarts: number; orders: number; conversionPercent: number; definition: string };
type DailyReportStatus = { revenue: number; orders: number; average: number; yesterdayRevenue: number; lowStock: number; pending: number };

const reportStatusLabels: Record<string, string> = {
  pending: "در انتظار", preparing: "آماده‌سازی", ready: "آماده تحویل", served: "تحویل شده",
  paid: "پرداخت‌شده", canceled: "لغو شده", awaiting_payment: "در انتظار پرداخت",
};
const reportStatusColors: Record<string, string> = {
  pending: "#f59e0b", preparing: "#3b82f6", ready: "#8b5cf6", served: "#06b6d4",
  paid: "#10b981", canceled: "#f43f5e", awaiting_payment: "#94a3b8",
};

function reportDayKey(offset = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 12));
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

function ReportMetric({ icon: MetricIcon, label, value, detail, accent = "blue" }: { icon: LucideIcon; label: string; value: string; detail?: string; accent?: "blue" | "green" | "amber" | "violet" | "rose" }) {
  const accentClass = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700", rose: "bg-rose-50 text-rose-700" }[accent];
  return <article className="card min-w-0 rounded-2xl border border-base-300 bg-base-100 shadow-sm"><div className="card-body gap-2 p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-base-content/60 sm:text-sm">{label}</span><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${accentClass}`}><MetricIcon className="size-[18px]" aria-hidden="true" /></span></div><strong className="truncate text-lg font-extrabold tabular-nums sm:text-xl">{value}</strong>{detail && <span className="text-[11px] leading-5 text-base-content/50">{detail}</span>}</div></article>;
}

function SalesBars({ data }: { data: SalesRep["series"] }) {
  const max = Math.max(1, ...data.map((item) => item.revenue));
  return <div className="mt-5 min-w-0 max-w-full overflow-x-auto pb-1"><div className="flex h-48 min-w-full items-end gap-2 border-b border-base-300 px-1 sm:gap-3">
    {data.map((item, index) => {
      const day = formatShortDate(item.date).match(/[0-9۰-۹٠-٩]+/g)?.pop() ?? "";
      const height = item.revenue > 0 ? Math.max(6, Math.round((item.revenue / max) * 76)) : 2;
      return <div key={`${item.date}-${index}`} className="group relative flex h-full min-w-7 flex-1 flex-col items-center justify-end gap-2" title={`${formatDate(item.date)} · ${formatPrice(item.revenue)} · ${toFa(item.orders)} سفارش`}>
        <div className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-blue-700 to-blue-400 transition-[height] group-hover:from-blue-800 group-hover:to-sky-400" style={{ height: `${height}%` }} />
        <span className="mb-1 text-[10px] text-base-content/50">{toFa(day)}</span>
      </div>;
    })}
  </div><div className="mt-2 flex justify-between text-[11px] text-base-content/45"><span>درآمد روزانه</span><span>بیشترین روز: {formatPrice(max)}</span></div></div>;
}

function OrderStatusChart({ rows }: { rows: SalesRep["statuses"] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let cursor = 0;
  const gradient = total ? rows.filter((row) => row.count > 0).map((row) => {
    const start = cursor;
    cursor += (row.count / total) * 100;
    return `${reportStatusColors[row.status] ?? "#64748b"} ${start}% ${cursor}%`;
  }).join(", ") : "#e2e8f0 0% 100%";
  return <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
    <div className="relative grid size-36 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label={`ترکیب وضعیت ${toFa(total)} سفارش`}>
      <div className="grid size-24 place-items-center rounded-full bg-base-100 text-center shadow-inner"><div><strong className="block text-xl">{toFa(total)}</strong><span className="text-[11px] text-base-content/55">کل سفارش</span></div></div>
    </div>
    <ul className="grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs sm:max-w-56 sm:grid-cols-1">
      {rows.map((row) => <li key={row.status} className="flex min-w-0 items-center gap-2"><i className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: reportStatusColors[row.status] ?? "#64748b" }} /><span className="min-w-0 flex-1 truncate text-base-content/65">{reportStatusLabels[row.status] ?? row.status}</span><b className="tabular-nums">{toFa(row.count)}</b></li>)}
    </ul>
  </div>;
}

export function Reports() {
  const features = useFeatures();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "range" | "last20">("daily");
  const [days, setDays] = useState(1);
  const [selectedDay, setSelectedDay] = useState(() => reportDayKey());
  const [fromDate, setFromDate] = useState(() => reportDayKey(6));
  const [toDate, setToDate] = useState(() => reportDayKey());
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeError, setRangeError] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productMetric, setProductMetric] = useState<"share" | "sales" | "revenue">("share");
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState("all");
  const salesQuery = period === "daily"
    ? `from=${encodeURIComponent(selectedDay)}&to=${encodeURIComponent(selectedDay)}`
    : period === "range" && appliedRange
      ? `from=${encodeURIComponent(appliedRange.from)}&to=${encodeURIComponent(appliedRange.to)}`
      : `days=${days}`;
  const { d, err } = useReport<SalesRep>("/api/r/report_sales", salesQuery);
  const { d: daily, err: dailyErr } = useReport<DailyReportStatus>("/api/r/report_daily_status", "snapshot=1");
  const funnelDays = days === 7 ? 7 : days === 30 ? 30 : 14;
  const { d: funnel, err: funnelErr } = useReport<MenuFunnel>("/api/reports/menu-funnel", funnelDays);
  function applyRange() {
    if (!fromDate || !toDate) { setRangeError("تاریخ شروع و پایان را انتخاب کنید"); return; }
    if (fromDate > toDate) { setRangeError("تاریخ پایان باید پس از تاریخ شروع باشد"); return; }
    setRangeError("");
    setAppliedRange({ from: fromDate, to: toDate });
    setDays(14);
  }
  function selectPeriod(next: "daily" | "weekly" | "monthly" | "range" | "last20") {
    setPeriod(next);
    setAppliedRange(null);
    setRangeError("");
    setDays(next === "daily" ? 1 : next === "weekly" ? 7 : next === "monthly" ? 30 : 20);
  }
  const exportHref = `/api/reports/sales/export?${salesQuery}`;
  const productTotalRevenue = d?.byProduct.reduce((sum, item) => sum + item.revenue, 0) ?? 0;
  const visibleProducts = (d?.byProduct ?? []).filter((item) => item.name.toLocaleLowerCase("fa").includes(productQuery.trim().toLocaleLowerCase("fa")));
  visibleProducts.sort((a, b) => productMetric === "sales" ? b.qty - a.qty : b.revenue - a.revenue);
  const orderFilters = [
    { key: "all", label: "همه" }, { key: "pending", label: "در انتظار" }, { key: "preparing", label: "آماده‌سازی" },
    { key: "ready", label: "آماده تحویل" }, { key: "served", label: "تحویل شده" }, { key: "paid", label: "پرداخت‌شده" }, { key: "canceled", label: "لغو شده" },
  ];
  const visibleOrders = (d?.recentOrders ?? []).filter((order) => (orderStatus === "all" || order.status === orderStatus) && String(order.number).includes(orderQuery.trim()));
  function goToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function showYesterday() {
    setSelectedDay(reportDayKey(1));
    setPeriod("daily");
    setDays(1);
    setAppliedRange(null);
  }
  return (
    <div className={`${reportStyles.page} min-w-0 animate-fade-in space-y-6 pb-10`}>
      <PageHeader title="گزارش‌ها" subtitle="خلاصه‌ی فروش، محصولات، تراکنش‌ها و سفارش‌های کسب‌وکار" />

      <section aria-labelledby="today-report-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="today-report-title" className="text-lg font-extrabold">وضعیت امروز</h2><p className="mt-1 text-xs text-base-content/55">این شاخص‌ها با انتخاب بازه‌ی گزارش تغییر نمی‌کنند.</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"><Activity className="size-3.5" />نمای لحظه‌ای</span></div>
        {dailyErr ? <ErrorState message={dailyErr} /> : !daily ? <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-28 rounded-2xl" key={index} />)}</div> : <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <ReportMetric icon={Wallet} label="درآمد امروز" value={formatPrice(daily.revenue)} detail={daily.yesterdayRevenue ? `${daily.revenue >= daily.yesterdayRevenue ? "افزایش" : "کاهش"} نسبت به دیروز` : "مجموع فروش پرداخت‌شده"} accent="green" />
          <ReportMetric icon={ReceiptText} label="سفارش‌های امروز" value={`${toFa(daily.orders)} سفارش`} detail="سفارش‌های پرداخت‌شده" />
          <ReportMetric icon={TrendingUp} label="میانگین فاکتور" value={formatPrice(daily.average)} detail="میانگین مبلغ سفارش پرداخت‌شده" accent="violet" />
          <ReportMetric icon={Package} label="موجودی کم" value={daily.lowStock ? `${toFa(daily.lowStock)} قلم` : "بدون کمبود"} detail="اقلام در حد هشدار یا پایین‌تر" accent={daily.lowStock ? "amber" : "green"} />
          <ReportMetric icon={Clock3} label="سفارش‌های در انتظار" value={daily.pending ? `${toFa(daily.pending)} سفارش` : "صف خالی"} detail="در انتظار، آماده‌سازی یا آماده تحویل" accent={daily.pending ? "amber" : "blue"} />
        </div>}
      </section>

      <Card className="sticky top-2 z-20 space-y-3 border border-base-300 bg-base-100/95 p-3 shadow-md backdrop-blur print:hidden sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs font-semibold text-base-content/55 sm:inline-flex"><CalendarDays className="size-4" />بازه</span>
            <button className="btn btn-sm btn-outline" onClick={showYesterday}>دیروز</button>
            <button className={`btn btn-sm ${period === "last20" ? "btn-primary" : "btn-outline"}`} onClick={() => selectPeriod("last20")}>۲۰ روز اخیر</button>
            {[{ key: "daily", label: "روزانه" }, { key: "weekly", label: "هفتگی" }, { key: "monthly", label: "ماهانه" }, { key: "range", label: "بازه دلخواه" }].map((item) => <button key={item.key} className={`btn btn-sm ${period === item.key ? "btn-primary" : "btn-ghost"}`} aria-pressed={period === item.key} onClick={() => selectPeriod(item.key as typeof period)}>{item.label}</button>)}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {period === "daily" ? <Field label="روز گزارش"><PersianDateInput value={selectedDay} onChange={(value) => { setSelectedDay(value); setAppliedRange(null); }} /></Field> : period === "range" ? <>
              <Field label="از تاریخ"><PersianDateInput value={fromDate} onChange={(value) => { setFromDate(value); setAppliedRange(null); }} /></Field>
              <Field label="تا تاریخ"><PersianDateInput value={toDate} onChange={(value) => { setToDate(value); setAppliedRange(null); }} /></Field>
              <Button size="sm" onClick={applyRange}><Check className="size-4" />اعمال</Button>
            </> : <div className="rounded-xl bg-base-200 px-3 py-2 text-xs text-base-content/60">{period === "weekly" ? "هفت روز اخیر" : period === "monthly" ? "سی روز اخیر" : "بیست روز اخیر"}</div>}
            <a href={exportHref} download><Button size="sm" variant="secondary"><Download className="size-4" />Excel</Button></a>
            <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer className="size-4" />چاپ</Button>
          </div>
        </div>
        {rangeError && <p role="alert" className="text-xs text-rose-600">{rangeError}</p>}
        <div className="no-scrollbar flex min-w-0 gap-1 overflow-x-auto border-t border-base-300 pt-2" aria-label="بخش‌های گزارش">
          {[{ id: "report-summary", label: "خلاصه", icon: BarChart3 }, { id: "report-products", label: "محصولات", icon: Package }, { id: "report-transactions", label: "تراکنش‌ها", icon: Wallet }, { id: "report-charts", label: "نمودار", icon: TrendingUp }, { id: "report-orders", label: "سفارش‌ها", icon: ReceiptText }].map(({ id, label, icon: SectionIcon }) => <button key={id} onClick={() => goToSection(id)} className="btn btn-sm btn-ghost shrink-0 gap-1.5"><SectionIcon className="size-4" />{label}</button>)}
        </div>
      </Card>

      {err ? <ErrorState message={err} /> : !d ? <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div> : <>
        <section id="report-summary" className="scroll-mt-48 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-extrabold">خلاصه‌ی عملکرد</h2><p className="mt-1 text-xs text-base-content/55">سفارش‌های پرداخت‌شده در بازه‌ی انتخاب‌شده</p></div><span className="rounded-full bg-base-200 px-3 py-1.5 text-xs text-base-content/60">{period === "daily" ? formatDate(`${selectedDay}T12:00:00`) : appliedRange ? `${formatDate(`${appliedRange.from}T12:00:00`)} تا ${formatDate(`${appliedRange.to}T12:00:00`)}` : period === "weekly" ? "هفت روز اخیر" : period === "monthly" ? "سی روز اخیر" : "بیست روز اخیر"}</span></div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <ReportMetric icon={Wallet} label="درآمد دوره" value={formatPrice(d.totals.revenue)} detail={`${toFa(d.totals.orders)} سفارش پرداخت‌شده`} accent="blue" />
            <ReportMetric icon={ReceiptText} label="سفارش‌های دوره" value={toFa(d.totals.orders)} detail="سفارش پرداخت‌شده" />
            <ReportMetric icon={TrendingUp} label="میانگین ارزش سفارش" value={formatPrice(d.totals.avg)} accent="violet" />
            <ReportMetric icon={Activity} label="سود ناخالص دوره" value={formatPrice(d.totals.grossProfit)} detail={`بهای تمام‌شده ${formatPrice(d.totals.cogs)}`} accent="green" />
            <ReportMetric icon={ArrowDownLeft} label="تخفیف‌ها" value={formatPrice(d.totals.discounts)} accent="amber" />
            <ReportMetric icon={ShoppingBag} label="محصولات فروخته‌شده" value={toFa(d.totals.soldItems)} detail="تعداد کل اقلام در سفارش‌ها" />
            <ReportMetric icon={ArrowUpLeft} label="مالیات فروش" value={formatPrice(d.totals.tax)} accent="rose" />
            <ReportMetric icon={Package} label="محصولات بدون فروش" value={toFa(d.unsoldProducts.length)} detail="در بازه‌ی انتخاب‌شده" />
          </div>
        </section>

        <section id="report-products" className="scroll-mt-48 space-y-3">
          <div><h2 className="text-lg font-extrabold">عملکرد محصولات این دوره</h2><p className="mt-1 text-xs text-base-content/55">محصولات پرفروش را جست‌وجو کنید و سهم، تعداد فروش یا درآمد را مقایسه کنید.</p></div>
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card className="min-w-0 border border-base-300 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="input input-bordered flex w-full items-center gap-2 sm:max-w-72"><Search className="size-4 text-base-content/45" /><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="جستجوی محصول" aria-label="جستجوی محصول" /></label>
                <div className="join w-fit" role="group" aria-label="معیار عملکرد محصول">{[{ key: "share", label: "سهم" }, { key: "sales", label: "فروش" }, { key: "revenue", label: "درآمد" }].map((option) => <button key={option.key} aria-pressed={productMetric === option.key} onClick={() => setProductMetric(option.key as typeof productMetric)} className={`btn btn-sm join-item ${productMetric === option.key ? "btn-primary" : "btn-ghost"}`}>{option.label}</button>)}</div>
              </div>
              <p className="mt-3 text-[11px] text-base-content/45">{toFa(d.byProduct.length)} محصول دارای فروش · سهم از درآمد فروش محصول</p>
              <div className="mt-4 divide-y divide-base-300">
                {visibleProducts.slice(0, 12).map((item, index) => {
                  const share = productTotalRevenue ? (item.revenue / productTotalRevenue) * 100 : 0;
                  const value = productMetric === "share" ? share : productMetric === "sales" ? item.qty : item.revenue;
                  const max = productMetric === "share" ? 100 : Math.max(1, ...visibleProducts.map((product) => productMetric === "sales" ? product.qty : product.revenue));
                  return <div key={item.name} className="flex items-center gap-3 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Package className="size-4" /></span>
                    <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{item.name}</span><b className="shrink-0 text-xs tabular-nums">{productMetric === "sales" ? `${toFa(value)} فروش` : productMetric === "share" ? `${toFa(Math.round(value))}٪` : formatPrice(value)}</b></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-base-200"><div className="h-full rounded-full bg-gradient-to-l from-blue-700 to-sky-400" style={{ width: `${Math.max(value ? 4 : 0, (value / max) * 100)}%` }} /></div><div className="mt-1 flex justify-between text-[10px] text-base-content/45"><span>#{toFa(index + 1)} · {toFa(item.qty)} فروش</span><span>{toFa(Math.round(share))}٪ از درآمد</span></div></div>
                  </div>;
                })}
                {!visibleProducts.length && <p className="py-8 text-center text-sm text-base-content/50">محصولی با این نام پیدا نشد.</p>}
                {d.byProduct.length === 0 && <p className="py-8 text-center text-sm text-base-content/50">در این بازه محصولی فروخته نشده است.</p>}
              </div>
            </Card>
            <Card className="min-w-0 border border-base-300 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">بدون فروش در این دوره</h3><p className="mt-1 text-xs text-base-content/50">محصولات ثبت‌شده‌ای که فروشی نداشته‌اند</p></div><span className="badge badge-ghost">{toFa(d.unsoldProducts.length)}</span></div>
              {d.unsoldProducts.length ? <div className="mt-4 flex max-h-64 flex-wrap content-start gap-2 overflow-y-auto">{d.unsoldProducts.map((name) => <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-base-300 bg-base-200/60 px-3 py-2 text-xs"><Package className="size-3.5 text-base-content/45" />{name}</span>)}</div> : <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">همه‌ی محصولات دست‌کم یک فروش داشته‌اند.</div>}
            </Card>
          </div>
        </section>

        <section id="report-transactions" className="scroll-mt-48 space-y-3">
          <div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-extrabold">تراکنش‌های اخیر</h2><p className="mt-1 text-xs text-base-content/55">پرداخت سفارش‌های همین بازه</p></div><Link className="btn btn-sm btn-ghost" href="/dashboard/orders">همه سفارش‌ها<ChevronLeft className="size-4" /></Link></div>
          <Card className="overflow-hidden border border-base-300">
            {d.recentTransactions.length ? <ul className="divide-y divide-base-300">{d.recentTransactions.map((transaction) => <li key={transaction.id} className="flex items-center gap-3 p-3.5 sm:p-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Check className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">پرداخت سفارش {toFa(transaction.orderNumber)}</p><p className="mt-1 text-[11px] text-base-content/50">{formatDate(transaction.date)} · {METHODS[transaction.method ?? "unknown"] ?? transaction.method}</p></div><div className="shrink-0 text-end"><b className="text-sm text-emerald-700">{formatPrice(transaction.amount)}</b><p className="mt-1 text-[10px] text-base-content/45">موفق</p></div></li>)}</ul> : <div className="p-8 text-center text-sm text-base-content/50">برای این بازه تراکنشی ثبت نشده است.</div>}
          </Card>
        </section>

        <section id="report-charts" className="scroll-mt-48 space-y-3">
          <div><h2 className="text-lg font-extrabold">نمودار فروش و وضعیت سفارش</h2><p className="mt-1 text-xs text-base-content/55">روند درآمد و ترکیب وضعیت سفارش‌ها در بازه‌ی انتخاب‌شده</p></div>
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card className="min-w-0 border border-base-300 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">نمودار فروش</h3><p className="mt-1 text-xs text-base-content/50">درآمد روزانه</p></div><span className="badge badge-primary badge-outline">{formatPrice(d.totals.revenue)}</span></div>{d.series.length ? <SalesBars data={d.series} /> : <p className="py-12 text-center text-sm text-base-content/50">در این بازه داده‌ای وجود ندارد.</p>}</Card>
            <Card className="min-w-0 border border-base-300 p-4 sm:p-5"><h3 className="font-bold">وضعیت سفارش‌ها</h3><p className="mt-1 text-xs text-base-content/50">تعداد سفارش‌ها به تفکیک وضعیت</p><div className="mt-5 min-w-0">{d.statuses.length ? <OrderStatusChart rows={d.statuses} /> : <p className="py-10 text-center text-sm text-base-content/50">سفارشی در بازه‌ی انتخاب‌شده نیست.</p>}</div></Card>
          </div>
        </section>

        <section id="report-orders" className="scroll-mt-48 space-y-3">
          <div><h2 className="text-lg font-extrabold">سفارش‌های این دوره</h2><p className="mt-1 text-xs text-base-content/55">جست‌وجوی شماره سفارش و فیلتر وضعیت</p></div>
          <Card className="overflow-hidden border border-base-300 p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="input input-bordered flex w-full items-center gap-2 lg:max-w-72"><Search className="size-4 text-base-content/45" /><input value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="جستجوی شماره سفارش" aria-label="جستجوی شماره سفارش" /></label>
              <div className="no-scrollbar flex min-w-0 gap-1.5 overflow-x-auto">{orderFilters.map((filter) => <button key={filter.key} onClick={() => setOrderStatus(filter.key)} aria-pressed={orderStatus === filter.key} className={`btn btn-sm shrink-0 ${orderStatus === filter.key ? "btn-primary" : "btn-ghost"}`}><Filter className="size-3.5" />{filter.label}</button>)}</div>
            </div>
            <p className="mt-3 text-[11px] text-base-content/45">آخرین ۱۰۰ سفارش ثبت‌شده در بازه‌ی انتخابی</p>
            <div className="mt-3 hidden overflow-x-auto md:block"><table className="table table-sm"><thead><tr><th>شماره</th><th>اقلام</th><th>نوع سفارش</th><th>مبلغ</th><th>وضعیت</th><th>زمان</th><th></th></tr></thead><tbody>
              {visibleOrders.map((order) => <tr key={order.id}><td className="font-bold">#{toFa(order.number)}</td><td>{toFa(order.itemCount)} قلم</td><td>{TYPES[order.type] ?? order.type}</td><td className="font-semibold">{formatPrice(order.total)}</td><td><span className={`badge ${order.status === "paid" || order.status === "served" ? "badge-success" : order.status === "canceled" ? "badge-error" : order.status === "preparing" ? "badge-info" : "badge-warning"}`}>{reportStatusLabels[order.status] ?? order.status}</span></td><td className="whitespace-nowrap text-xs text-base-content/55">{formatDate(order.createdAt)}</td><td><Link className="btn btn-xs btn-ghost" href={`/dashboard/receipts?orderId=${order.id}`}>فیش</Link></td></tr>)}
              {!visibleOrders.length && <tr><td colSpan={7} className="py-10 text-center text-base-content/50">سفارشی با این فیلتر پیدا نشد.</td></tr>}
            </tbody></table></div>
            <div className="mt-3 space-y-2 md:hidden">{visibleOrders.map((order) => <article key={order.id} className="rounded-xl border border-base-300 p-3"><div className="flex items-start justify-between gap-2"><div><Link className="font-bold text-blue-700" href={`/dashboard/receipts?orderId=${order.id}`}>#{toFa(order.number)}</Link><p className="mt-1 text-[11px] text-base-content/50">{formatDate(order.createdAt)}</p></div><span className={`badge ${order.status === "paid" || order.status === "served" ? "badge-success" : order.status === "canceled" ? "badge-error" : "badge-warning"}`}>{reportStatusLabels[order.status] ?? order.status}</span></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span>{toFa(order.itemCount)} قلم · {TYPES[order.type] ?? order.type}</span><b>{formatPrice(order.total)}</b></div></article>)}{!visibleOrders.length && <p className="rounded-xl bg-base-200 p-6 text-center text-sm text-base-content/50">سفارشی با این فیلتر پیدا نشد.</p>}</div>
          </Card>
        </section>
      </>}

      <section className="space-y-3 print:hidden">
        <div><h2 className="text-lg font-extrabold">قیف بازدید منو</h2><p className="mt-1 text-xs text-base-content/55">رویدادهای ناشناس در {toFa(funnelDays)} روز اخیر؛ بازدیدها یکتا نیستند.</p></div>
        {funnelErr ? <ErrorState message={funnelErr} /> : !funnel ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}</div> : <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"><ReportMetric icon={Activity} label="بازدید منو" value={formatNumber(funnel.views)} /><ReportMetric icon={Package} label="مشاهده محصول" value={formatNumber(funnel.productViews)} /><ReportMetric icon={ShoppingBag} label="افزودن به سبد" value={formatNumber(funnel.addToCart)} /><ReportMetric icon={ReceiptText} label="شروع سفارش" value={formatNumber(funnel.checkoutStarts)} /><ReportMetric icon={Check} label="سفارش ثبت‌شده" value={formatNumber(funnel.orders)} /><ReportMetric icon={TrendingUp} label="نسبت سفارش به بازدید" value={`${toFa(funnel.conversionPercent)}٪`} accent="green" /></div>
          <p className="text-xs leading-6 text-base-content/50">{funnel.definition}</p>
        </>}
      </section>
      {features.has("cashier_pos") && <div className="print:hidden"><CashShiftHistory /></div>}
    </div>
  );
}

type CashShiftHistoryData = {
  items: {
    id: number;
    openedAt: string;
    closedAt: string;
    openedByName: string;
    closedByName: string;
    openingCash: number;
    expectedCash: number | null;
    closingCash: number | null;
    cashDifference: number | null;
    note: string;
    byMethod: { method: string; amount: number }[];
  }[];
  limited: boolean;
};

function CashShiftHistory() {
  const { d, err } = useReport<CashShiftHistoryData>("/api/cash-shifts/history", 30);
  return <section className="mt-6 space-y-3">
    <div><h2 className="font-bold">تسویه‌ی شیفت‌های صندوق</h2><p className="mt-1 text-xs text-stone-500">شیفت‌های بسته‌شده‌ی ۳۰ روز اخیر؛ جمع‌ها از تراکنش‌های فروش موجود خوانده می‌شوند.</p></div>
    {err ? <ErrorState message={err} /> : !d ? <Skeleton className="h-48 rounded-2xl" /> : d.items.length === 0 ? <Card className="p-5 text-sm text-stone-500">در این بازه شیفت بسته‌شده‌ای ثبت نشده است.</Card> : <Card className="overflow-hidden">
      {d.limited && <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">فقط ۱۰۰ شیفت آخر نمایش داده می‌شود.</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm">
        <thead className="bg-stone-50 text-xs text-stone-500"><tr>{["بسته‌شدن", "افتتاح / بستن", "روش‌های پرداخت", "وجه شروع", "نقد مورد انتظار", "شمارش نهایی", "کسری / اضافه", "توضیح"].map((label) => <th key={label} className="p-3 text-start">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-stone-100">{d.items.map((shift) => <tr key={shift.id}>
          <td className="whitespace-nowrap p-3">{formatDate(shift.closedAt)}</td>
          <td className="p-3 text-xs">{shift.openedByName}<span className="block text-stone-400">بست: {shift.closedByName}</span></td>
          <td className="min-w-48 p-3 text-xs">{shift.byMethod.map((row) => `${METHODS[row.method] ?? row.method}: ${formatPrice(row.amount)}`).join(" · ") || "بدون فروش"}</td>
          <td className="whitespace-nowrap p-3">{formatPrice(shift.openingCash)}</td>
          <td className="whitespace-nowrap p-3">{formatPrice(shift.expectedCash ?? 0)}</td>
          <td className="whitespace-nowrap p-3">{formatPrice(shift.closingCash ?? 0)}</td>
          <td className={cn("whitespace-nowrap p-3 font-bold", (shift.cashDifference ?? 0) < 0 ? "text-rose-600" : (shift.cashDifference ?? 0) > 0 ? "text-emerald-700" : "text-stone-500")}>{(shift.cashDifference ?? 0) < 0 ? "کسری " : (shift.cashDifference ?? 0) > 0 ? "اضافه " : "بدون اختلاف "}{formatPrice(Math.abs(shift.cashDifference ?? 0))}</td>
          <td className="max-w-56 p-3 text-xs text-stone-500">{shift.note || "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>}
  </section>;
}

type Pnl = { revenue: number; discounts: number; tax: number; cogs: number; grossProfit: number; expenses: number; otherIncome: number; net: number; expenseBreakdown: { name: string; amount: number }[]; series: { date: string; revenue: number; cogs: number; expenses: number }[]; cogsCoverage: number };
export function ProfitLoss() {
  const [days, setDays] = useState(30);
  const { d, err } = useReport<Pnl>("/api/r/report_pnl", days);
  return (
    <div className="animate-fade-in">
      <PageHeader title="گزارش سود و زیان" subtitle="درآمد خالص، بهای تمام‌شده، هزینه‌ها و سود خالص در بازه‌ی انتخابی" actions={<Range days={days} setDays={setDays} />} />
      {err ? <ErrorState message={err} /> : !d ? <Skeleton className="h-96 rounded-2xl" /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <Card className="p-5"><h3 className="mb-2 font-bold">صورت سود و زیان</h3><div className="divide-y divide-stone-100">
              <ProfitLossRow l="فروش خالص" sub={`پس از کسر ${formatPrice(d.discounts)} تخفیف؛ بدون مالیات`} v={d.revenue} />
              <ProfitLossRow l="بهای تمام‌شده‌ی کالای فروش‌رفته (COGS)" sub={`بر اساس فرمول ساخت؛ پوشش ${toFa(d.cogsCoverage)}٪ سفارش‌ها`} v={-d.cogs} tone="text-rose-600" />
              <ProfitLossRow l="سود ناخالص" v={d.grossProfit} b />
              <ProfitLossRow l="هزینه‌های عملیاتی" v={-d.expenses} tone="text-rose-600" />
              <ProfitLossRow l="سایر درآمدها" v={d.otherIncome} tone="text-emerald-600" />
              <ProfitLossRow l="سود خالص" v={d.net} b tone={d.net >= 0 ? "text-emerald-600" : "text-rose-600"} />
            </div></Card>
            <Card className="p-5"><h3 className="mb-4 font-bold">سود روزانه (فروش − بهای تمام‌شده − هزینه)</h3><Bars data={d.series.map((s) => ({ label: toFa(formatShortDate(s.date).replace(/\D+/g, " ").trim().split(" ").pop() ?? ""), value: s.revenue - s.cogs - s.expenses }))} color="bg-emerald-400" label={formatPrice} /></Card>
          </div>
          <Card className="h-fit p-5"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-bold">ترکیب هزینه‌ها</h3><span className="text-xs font-bold text-base-content/55">به تفکیک دسته</span></div><ExpensePie rows={d.expenseBreakdown ?? []} /></Card>
        </div>
      )}
    </div>
  );
}

type Bk = { accounts: { id: number | null; name: string; bank: string; accountNumber: string; opening: number; income: number; expense: number; balance: number }[]; total: number; recent: { id: number; kind: string; amount: number; category: string; description: string; date: string; accountName: string }[] };
function BankReport() {
  const [days, setDays] = useState(30);
  const { d, err } = useReport<Bk>("/api/r/report_bank", days);
  return (
    <div className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">گزارش تجمیعی</h2><Range days={days} setDays={setDays} /></div>
      <IconText>{err ? <ErrorState message={err} /> : !d ? <Skeleton className="h-48 rounded-2xl" /> : (
        <>
          <Card className="bg-gradient-to-l from-stone-900 to-stone-700 p-5 text-white"><p className="text-xs text-white/70">موجودی کل (صندوق + حساب‌های بانکی)</p><p className="mt-1 text-3xl font-black">{formatPrice(d.total)}</p></Card>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{d.accounts.map((a) => (
            <Card key={a.id ?? "cash"} className="p-4"><div className="flex items-start justify-between"><div><p className="font-bold">{a.id ? "" : ""} {a.name}</p><p className="text-[11px] text-stone-400">{a.bank} {a.accountNumber && `· ${toFa(a.accountNumber)}`}</p></div></div><p className="mt-3 text-xl font-extrabold">{formatPrice(a.balance)}</p><div className="mt-2 flex justify-between text-xs"><span className="text-emerald-600">ورودی: {formatCompact(a.income)}</span><span className="text-rose-600">خروجی: {formatCompact(a.expense)}</span></div></Card>
          ))}</div>
          <Card className="overflow-hidden"><div className="border-b border-stone-100 p-4 font-bold">آخرین تراکنش‌ها</div><ul className="divide-y divide-stone-100">{d.recent.slice(0, 12).map((t) => <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><Badge color={t.kind === "income" ? "emerald" : "rose"}>{t.kind === "income" ? "ورودی" : "خروجی"}</Badge><span className="min-w-0 flex-1 truncate">{t.category || t.description} <span className="text-xs text-stone-400">· {t.accountName}</span></span><b className={t.kind === "income" ? "text-emerald-600" : "text-rose-600"}>{formatNumber(t.amount)}</b><span className="hidden text-xs text-stone-400 sm:block">{formatDate(t.date)}</span></li>)}</ul></Card>
        </>
      )}</IconText>
      <h2 className="pt-4 font-bold">مدیریت حساب‌ها</h2>
    </div>
  );
}
type BankAcc = { id: number; name: string; bank: string; accountNumber: string; openingBalance: number };
export function Bank() {
  return (
    <ResourcePage<BankAcc>
      title="گزارش تجمیعی بانک"
      subtitle="گردش حساب‌ها و موجودی بانکی؛ فروش‌های پوز و آنلاین به حساب اصلی واریز ثبت می‌شود"
      endpoint="/api/r/bank"
      emoji=""
      emptyTitle="حساب بانکی تعریف نشده"
      emptyDesc="حساب‌های بانکی خود را اضافه کنید تا گردش مالی هر حساب مشخص شود."
      addLabel="حساب جدید"
      header={() => <BankReport />}
      fields={[
        { key: "name", label: "عنوان حساب", required: true },
        { key: "bank", label: "بانک" },
        { key: "accountNumber", label: "شماره حساب / کارت", ltr: true },
        { key: "openingBalance", label: "موجودی اولیه", type: "money", initial: "0" },
      ]}
      columns={[
        { label: "حساب", render: (r) => <b>{r.name}</b> },
        { label: "بانک", render: (r) => r.bank || "—" },
        { label: "شماره", render: (r) => <span dir="ltr" className="text-xs">{r.accountNumber || "—"}</span> },
        { label: "موجودی اولیه", render: (r) => formatPrice(r.openingBalance) },
      ]}
    />
  );
}

type Asset = { id: number; name: string; category: string; purchaseDate: string; cost: number; salvage: number; lifeMonths: number; note: string };
const dep = (a: Asset) => {
  const months = Math.max(0, Math.floor((Date.now() - new Date(a.purchaseDate).getTime()) / (30.44 * 86400_000)));
  const base = Math.max(0, a.cost - a.salvage);
  const monthly = base / Math.max(1, a.lifeMonths);
  const accumulated = Math.min(base, Math.round(monthly * months));
  return { months, monthly: Math.round(monthly), accumulated, book: a.cost - accumulated, pct: base ? Math.round((accumulated / base) * 100) : 0 };
};
export function Assets() {
  return (
    <ResourcePage<Asset>
      title="مدیریت اموال و استهلاک"
      subtitle="ثبت دارایی‌ها و محاسبه‌ی استهلاک به روش خط مستقیم"
      endpoint="/api/r/assets"
      emoji=""
      emptyTitle="هنوز دارایی‌ای ثبت نشده"
      emptyDesc="تجهیزات و اثاثیه را ثبت کنید تا ارزش دفتری و استهلاک ماهانه محاسبه شود."
      addLabel="دارایی جدید"
      search={(r, t) => r.name.includes(t) || r.category.includes(t)}
      fields={[
        { key: "name", label: "نام دارایی", required: true },
        { key: "category", label: "گروه", placeholder: "تجهیزات، اثاثیه، وسیله نقلیه…" },
        { key: "purchaseDate", label: "تاریخ خرید", type: "date", required: true, initial: new Date().toISOString().slice(0, 10) },
        { key: "cost", label: "بهای خرید (تومان)", type: "money", required: true },
        { key: "salvage", label: "ارزش اسقاط", type: "money", initial: "0" },
        { key: "lifeMonths", label: "عمر مفید (ماه)", type: "number", initial: "60" },
        { key: "note", label: "توضیحات", type: "textarea" },
      ]}
      header={({ items }) => {
        const t = items.reduce((s, a) => ({ cost: s.cost + a.cost, acc: s.acc + dep(a).accumulated, book: s.book + dep(a).book, m: s.m + dep(a).monthly }), { cost: 0, acc: 0, book: 0, m: 0 });
        return <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi l="بهای تمام‌شده دارایی‌ها" v={formatPrice(t.cost)} /><Kpi l="استهلاک انباشته" v={formatPrice(t.acc)} tone="text-rose-600" /><Kpi l="ارزش دفتری" v={formatPrice(t.book)} tone="text-emerald-600" /><Kpi l="استهلاک ماهانه" v={formatPrice(t.m)} /></div>;
      }}
      columns={[
        { label: "دارایی", render: (r) => <div><p className="font-bold">{r.name}</p><p className="text-xs text-stone-400">{r.category} · خرید {formatDate(r.purchaseDate)}</p></div> },
        { label: "بهای خرید", render: (r) => formatPrice(r.cost) },
        { label: "استهلاک ماهانه", render: (r) => formatPrice(dep(r).monthly) },
        { label: "استهلاک انباشته", render: (r) => <div className="min-w-32"><span className="text-xs">{formatPrice(dep(r).accumulated)}</span><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-rose-400" style={{ width: `${dep(r).pct}%` }} /></div></div> },
        { label: "ارزش دفتری", render: (r) => <b>{formatPrice(dep(r).book)}</b> },
      ]}
    />
  );
}
