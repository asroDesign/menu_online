"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, useCollection } from "@/lib/api";
import { formatDate, formatNumber, formatPrice, toFa } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Icon, PageHeader, PersianDateInput, Select, Skeleton } from "@/components/ui";
import { StockReceiptEditor, type SavedReceipt } from "@/components/stock-receipt-editor";
import { WASTE_REASONS, wasteReasonLabel } from "@/lib/stock-waste";
import styles from "./inventory-waste.module.css";

type InventoryItem = { id: number; name: string; unit: string; stock: number; costPerUnit: number };
type WasteRow = {
  id: number; itemId: number; itemName: string; unit: string; quantity: number; balanceAfter: number;
  amount: number; note: string; createdAt: string; receiptId: number | null; documentId: number | null;
  wasteReason: string | null; warehouseName: string | null;
};
type WasteReport = {
  range: { from: string; to: string };
  summary: { entryCount: number; receiptCount: number; quantityByUnit: { unit: string; quantity: number }[]; totalCost: number; previousCost: number; changePercent: number | null };
  items: WasteRow[];
  topItems: { itemId: number; name: string; unit: string; quantity: number; cost: number }[];
  reasons: { reason: string; quantity: number; cost: number }[];
  daily: { day: string; quantity: number; cost: number }[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
};

const dayKey = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
function shiftDay(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}
function defaultRange() {
  const to = dayKey();
  return { from: shiftDay(to, -29), to, itemId: "", reason: "all" };
}
function downloadUrl(filters: { from: string; to: string; itemId: string; reason: string }) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to, format: "csv" });
  if (filters.itemId) params.set("itemId", filters.itemId);
  if (filters.reason !== "all") params.set("reason", filters.reason);
  return `/api/r/waste?${params.toString()}`;
}

const reasonColors = ["bg-rose-500", "bg-amber-500", "bg-violet-500", "bg-blue-500", "bg-orange-500", "bg-stone-400"];

export function InventoryWaste() {
  const [draft, setDraft] = useState(defaultRange);
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<WasteReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [registering, setRegistering] = useState(false);
  const requestId = useRef(0);
  const inventory = useCollection<InventoryItem>("/api/r/items");

  const query = useMemo(() => {
    const params = new URLSearchParams({ from: applied.from, to: applied.to, page: String(page), pageSize: "30" });
    if (applied.itemId) params.set("itemId", applied.itemId);
    if (applied.reason !== "all") params.set("reason", applied.reason);
    return params.toString();
  }, [applied, page]);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<WasteReport>(`/api/r/waste?${query}`);
      if (current === requestId.current) setReport(result);
    } catch (e) {
      if (current === requestId.current) setError((e as Error).message || "گزارش ضایعات دریافت نشد");
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function applyFilters(next = draft) {
    if (!next.from || !next.to) {
      setError("تاریخ شروع و پایان را انتخاب کنید");
      return;
    }
    if (next.from > next.to) {
      setError("تاریخ شروع باید پیش از تاریخ پایان باشد");
      return;
    }
    setPage(1);
    setApplied(next);
  }

  function setQuickRange(days: number) {
    const to = dayKey();
    const next = { ...draft, from: shiftDay(to, -(days - 1)), to };
    setDraft(next);
    applyFilters(next);
  }

  function saved(receipt: SavedReceipt) {
    setRegistering(false);
    setPage(1);
    const receiptDay = receipt.date ? dayKey(new Date(receipt.date)) : dayKey();
    const next = { ...defaultRange(), from: shiftDay(receiptDay, -29), to: receiptDay };
    setDraft(next);
    setApplied(next);
  }

  const maxDaily = Math.max(1, ...((report?.daily ?? []).map((row) => row.cost)));
  const maxReason = Math.max(1, ...((report?.reasons ?? []).map((row) => row.cost)));
  const maxItem = Math.max(1, ...((report?.topItems ?? []).map((row) => row.cost)));
  const hasFilters = applied.itemId || applied.reason !== "all";

  const quantitySummary = report?.summary.quantityByUnit?.length
    ? report.summary.quantityByUnit.map(({ unit, quantity }) => `${formatNumber(quantity)} ${unit}`).join(" · ")
    : "—";

  return <div className={`${styles.report} mx-auto max-w-screen-2xl space-y-5 pb-8`}>
    <PageHeader title="ضایعات انبار" subtitle="ثبت، کنترل هزینه و بررسی روند دورریز مواد اولیه" actions={<>
      <div className="no-print flex flex-wrap gap-2">
        <Link href="/dashboard/inventory" className="btn btn-secondary btn-sm inline-flex h-9 items-center gap-1.5 rounded-xl"><Icon name="box" className="size-4" />انبار</Link>
        <Link href="/dashboard/stock-movements" className="btn btn-secondary btn-sm inline-flex h-9 items-center gap-1.5 rounded-xl"><Icon name="list" className="size-4" />گردش انبار</Link>
        <Button variant="secondary" size="sm" onClick={() => window.print()}><Icon name="print" className="size-4" />چاپ صفحه</Button>
        <a href={downloadUrl(applied)} className="btn btn-secondary btn-sm inline-flex h-9 items-center gap-1.5 rounded-xl"><Icon name="download" className="size-4" />خروجی CSV</a>
        <Button size="sm" onClick={() => setRegistering(true)}><Icon name="plus" className="size-4" />ثبت ضایعات</Button>
      </div>
    </>} />

    <div className="no-print"><Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-extrabold">گزارش و فیلترها</h2><p className="mt-1 text-xs text-base-content/55">بازه را با تاریخ شمسی انتخاب کنید؛ گزارش هزینه با بازهٔ قبلی هم‌اندازه مقایسه می‌شود.</p></div>
        <div className="flex flex-wrap gap-2" aria-label="بازه‌های سریع">
          {[{ days: 1, title: "امروز" }, { days: 7, title: "۷ روز" }, { days: 30, title: "۳۰ روز" }].map(({ days, title }) => <Button key={days} size="sm" variant="secondary" onClick={() => setQuickRange(days)}>{title}</Button>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_1fr_auto] xl:items-end">
        <Field label="از تاریخ (شمسی)"><PersianDateInput value={draft.from} onChange={(from) => setDraft((current) => ({ ...current, from }))} /></Field>
        <Field label="تا تاریخ (شمسی)"><PersianDateInput value={draft.to} onChange={(to) => setDraft((current) => ({ ...current, to }))} /></Field>
        <Field label="قلم انبار"><Select value={draft.itemId} onChange={(event) => setDraft((current) => ({ ...current, itemId: event.target.value }))}><option value="">همهٔ مواد</option>{inventory.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <Field label="دلیل ضایعات"><Select value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}><option value="all">همهٔ دلیل‌ها</option>{WASTE_REASONS.map((reason) => <option key={reason.key} value={reason.key}>{reason.label}</option>)}</Select></Field>
        <Button className="w-full xl:w-auto" onClick={() => applyFilters()}><Icon name="filter" className="size-4" />اعمال فیلتر</Button>
      </div>
      {inventory.error && <p className="text-xs text-error">فهرست مواد برای فیلتر بارگذاری نشد: {inventory.error}</p>}
      {hasFilters && <button type="button" className="text-xs font-bold text-primary underline" onClick={() => { const clean = { ...draft, itemId: "", reason: "all" }; setDraft(clean); applyFilters(clean); }}>پاک کردن فیلتر ماده و دلیل</button>}
    </Card></div>

    <div className={styles.printMeta}>
      <strong>گزارش ضایعات انبار</strong>
      <span>بازه: {report ? `${formatDate(report.range.from)} تا ${formatDate(report.range.to)}` : "—"}</span>
      {report && <span>{formatNumber(report.pagination.total)} ردیف · صفحه {toFa(page)} از {toFa(Math.max(report.pagination.pages, 1))}</span>}
    </div>

    {error && <ErrorState message={error} onRetry={() => void load()} />}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {loading && !report ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />) : <>
        <SummaryCard icon="warning" title="هزینهٔ ضایعات" value={formatPrice(report?.summary.totalCost ?? 0)} detail={report?.summary.changePercent == null ? "مقایسه با بازهٔ قبل در دسترس نیست" : `${report.summary.changePercent > 0 ? "افزایش" : report.summary.changePercent < 0 ? "کاهش" : "بدون تغییر"} ${toFa(Math.abs(report.summary.changePercent))}٪ نسبت به بازهٔ قبل`} tone="rose" trend={report?.summary.changePercent ?? null} />
        <SummaryCard icon="box" title="مقدار دورریز" value={quantitySummary} detail="مقدارها به تفکیک واحد کالا نمایش داده می‌شوند" tone="amber" />
        <SummaryCard icon="file" title="رسید ضایعات" value={formatNumber(report?.summary.receiptCount ?? 0)} detail={`${formatNumber(report?.summary.entryCount ?? 0)} ردیف ماده`} tone="blue" />
        <SummaryCard icon="calendar" title="بازهٔ گزارش" value={report ? `${formatDate(report.range.from)} تا ${formatDate(report.range.to)}` : "—"} detail="تاریخ‌ها در منطقهٔ زمانی تهران محاسبه می‌شوند" tone="violet" />
      </>}
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold">روند روزانه هزینه</h2><p className="mt-1 text-xs text-base-content/55">مجموع بهای موجودی خارج‌شده در هر روز</p></div><Badge color="rose"><Icon name="trend" className="size-3.5" />{formatPrice(report?.summary.totalCost ?? 0)}</Badge></div>
        {loading && !report ? <Skeleton className="mt-5 h-48 rounded-xl" /> : (report?.daily.length ?? 0) === 0 ? <div className="mt-4 rounded-xl bg-base-200/60 p-8 text-center text-sm text-base-content/50">در این بازه ضایعاتی ثبت نشده است.</div> : <div className="mt-5 flex h-48 items-end gap-1.5 overflow-x-auto border-b border-base-300 pb-2 sm:gap-2">
          {report!.daily.map((row) => <div key={row.day} className="group flex h-full min-w-7 flex-1 flex-col items-center justify-end gap-1" title={`${formatDate(row.day)} — ${formatPrice(row.cost)} — ${formatNumber(row.quantity)} مقدار`}>
            <div className="relative flex w-full flex-1 items-end justify-center"><div className="w-full max-w-7 rounded-t-md bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(5, row.cost / maxDaily * 100)}%` }} /></div>
            <span className="max-w-12 truncate text-[9px] text-base-content/55">{formatDate(row.day).replace(/\s*۱۴۰\d/, "")}</span>
          </div>)}
        </div>}
      </Card>

      <Card className="p-4 sm:p-5">
        <div><h2 className="font-extrabold">دسته‌بندی دلیل‌ها</h2><p className="mt-1 text-xs text-base-content/55">سهم هر دلیل از هزینهٔ ثبت‌شده</p></div>
        {loading && !report ? <Skeleton className="mt-5 h-44 rounded-xl" /> : (report?.reasons.length ?? 0) === 0 ? <p className="mt-5 rounded-xl bg-base-200/60 p-8 text-center text-sm text-base-content/50">داده‌ای برای تحلیل وجود ندارد.</p> : <div className="mt-5 space-y-4">
          {report!.reasons.map((entry, index) => <div key={entry.reason}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs"><span className="font-semibold">{wasteReasonLabel(entry.reason)}</span><span className="text-base-content/55">{formatPrice(entry.cost)} <span className="mx-1">·</span>{formatNumber(entry.quantity)}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-base-200"><div className={`h-full rounded-full ${reasonColors[index % reasonColors.length]}`} style={{ width: `${Math.max(2, entry.cost / maxReason * 100)}%` }} /></div>
          </div>)}
        </div>}
      </Card>
    </div>

    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Card className="p-4 sm:p-5">
        <div><h2 className="font-extrabold">مواد با بیشترین هزینهٔ ضایعات</h2><p className="mt-1 text-xs text-base-content/55">برای بررسی خرید، نگهداری و آموزش آماده‌سازی</p></div>
        {loading && !report ? <Skeleton className="mt-4 h-40 rounded-xl" /> : (report?.topItems.length ?? 0) === 0 ? <p className="mt-4 rounded-xl bg-base-200/60 p-7 text-center text-sm text-base-content/50">ماده‌ای در این بازه ثبت نشده است.</p> : <div className="mt-4 space-y-4">
          {report!.topItems.map((item, index) => <div key={item.itemId} className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-base-200 text-xs font-extrabold text-base-content/60">{toFa(index + 1)}</span>
            <div className="min-w-0 flex-1"><div className="mb-1 flex justify-between gap-2 text-xs"><b className="truncate">{item.name}</b><span className="shrink-0 text-base-content/55">{formatNumber(item.quantity)} {item.unit}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-base-200"><div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(3, item.cost / maxItem * 100)}%` }} /></div></div>
            <b className="shrink-0 text-xs">{formatPrice(item.cost)}</b>
          </div>)}
        </div>}
      </Card>
      <Card className="no-print flex items-start gap-3 border-primary/20 bg-primary/5 p-4 sm:p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name="sparkles" className="size-5" /></span>
        <div><h2 className="font-extrabold">از گزارش ضایعات چه استفاده‌ای کنیم؟</h2><p className="mt-2 text-sm leading-7 text-base-content/70">دلیل‌های پرتکرار را با مسئول انبار و آشپزخانه مرور کنید، مقدار خرید و روش نگهداری مواد را با روند مصرف بسنجید و در صورت تکرار خرابی یا انقضا، شرایط تحویل و تاریخ مصرف را اصلاح کنید. هزینهٔ هر ثبت به سند حسابداری ضایعات وصل است.</p><Link href="/dashboard/stock-movements" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">بررسی گردش‌های مرتبط <Icon name="arrowLeft" className="size-3.5" /></Link></div>
      </Card>
    </div>

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-4 sm:px-5"><div><h2 className="font-extrabold">ریز ضایعات</h2><p className="mt-1 text-xs text-base-content/55">{report ? `${formatNumber(report.pagination.total)} ردیف در این فیلتر` : "ثبت‌های بازه انتخاب‌شده"}</p></div>{report && report.pagination.pages > 1 && <div className="no-print flex items-center gap-2"><Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>قبلی</Button><span className="text-xs tabular-nums">{toFa(page)} / {toFa(report.pagination.pages)}</span><Button size="sm" variant="secondary" disabled={page >= report.pagination.pages || loading} onClick={() => setPage((current) => current + 1)}>بعدی</Button></div>}</div>
      {error && !report ? null : loading && !report ? <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 rounded-lg" />)}</div> : (report?.items.length ?? 0) === 0 ? <EmptyState icon="box" title="ضایعاتی در این بازه ثبت نشده" description="با ثبت ضایعات، موجودی، هزینه و گزارش این صفحه به‌روز می‌شوند." action={<Button size="sm" onClick={() => setRegistering(true)}><Icon name="plus" className="size-4" />ثبت اولین ضایعات</Button>} /> : <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-sm"><thead className="bg-base-200/60 text-xs text-base-content/55"><tr><th className="p-3 text-start">تاریخ</th><th className="p-3 text-start">ماده</th><th className="p-3 text-start">مقدار</th><th className="p-3 text-start">دلیل</th><th className="p-3 text-start">هزینه</th><th className="p-3 text-start">موجودی پس از ثبت</th><th className="p-3 text-start">انبار / توضیحات</th><th className="p-3 text-start">سند</th></tr></thead><tbody className="divide-y divide-base-300/70">{report!.items.map((row) => <tr key={row.id} className="align-top hover:bg-base-200/30"><td className="whitespace-nowrap p-3 text-xs text-base-content/60">{formatDate(row.createdAt)}</td><td className="p-3 font-bold">{row.itemName}</td><td className="whitespace-nowrap p-3 font-semibold">{formatNumber(row.quantity)} {row.unit}</td><td className="p-3"><Badge color="rose">{wasteReasonLabel(row.wasteReason)}</Badge></td><td className="whitespace-nowrap p-3 font-bold text-rose-700">{formatPrice(row.amount)}</td><td className="whitespace-nowrap p-3">{formatNumber(row.balanceAfter)} {row.unit}</td><td className="max-w-64 p-3 text-xs text-base-content/60"><div>{row.warehouseName || "بدون انبار"}</div>{row.note && <p className="mt-1 break-words">{row.note}</p>}</td><td className="whitespace-nowrap p-3 text-xs">{row.documentId ? <a href={`/print/doc/${row.documentId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-primary underline"><Icon name="file" className="size-3.5" />سند #{toFa(row.documentId)}</a> : row.receiptId ? `رسید #${toFa(row.receiptId)}` : "—"}</td></tr>)}</tbody></table></div>}
    </Card>

    {registering && <StockReceiptEditor fixedType="waste" onClose={() => setRegistering(false)} onSaved={saved} />}
  </div>;
}

function SummaryCard({ icon, title, value, detail, tone, trend }: { icon: string; title: string; value: string; detail: string; tone: "rose" | "amber" | "blue" | "violet"; trend?: number | null }) {
  const colors = { rose: "bg-rose-50 text-rose-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700" };
  return <Card className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-base-content/55">{title}</p><p className="mt-2 break-words text-base font-black leading-7 sm:text-lg">{value}</p></div><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${colors[tone]}`}><Icon name={icon} className="size-5" /></span></div><p className={`mt-2 text-[11px] leading-5 ${trend == null ? "text-base-content/45" : trend > 0 ? "text-rose-700" : trend < 0 ? "text-emerald-700" : "text-base-content/50"}`}>{detail}</p></Card>;
}
