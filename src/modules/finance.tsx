"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCompact, formatDate, formatNumber, formatPrice, formatShortDate, toFa } from "@/lib/format";
import { ResourcePage } from "@/components/resource-page";
import { Badge, Card, ErrorState, PageHeader, Skeleton, cn } from "@/components/ui";

const bankField = { key: "bankAccountId", label: "حساب", remote: { url: "/api/r/bank", label: (r: { name: string }) => r.name, none: "صندوق (نقدی)" } } as const;

type Tx = { id: number; kind: string; source: string; category: string; amount: number; description: string; date: string; accountName: string };

function LedgerPage({ endpoint, title, subtitle, emoji }: { endpoint: string; title: string; subtitle: string; emoji: string }) {
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
      search={(r, t) => r.category.includes(t) || r.description.includes(t)}
      fields={[
        { key: "kind", label: "نوع", type: "select", options: [{ value: "expense", label: "هزینه" }, { value: "income", label: "درآمد" }] },
        { key: "amount", label: "مبلغ (تومان)", type: "money", required: true },
        { key: "category", label: "دسته", placeholder: "اجاره، حقوق، خرید مواد اولیه…" },
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
        { label: "دسته / شرح", render: (r) => <div><p className="font-semibold">{r.category || "—"} {r.source === "sale" && <Badge color="blue">فروش</Badge>}</p><p className="text-xs text-stone-400">{r.description}</p></div> },
        { label: "حساب", render: (r) => <span className="text-xs">{r.accountName}</span> },
        { label: "مبلغ", render: (r) => <b className={r.kind === "income" ? "text-emerald-600" : "text-rose-600"}>{r.kind === "income" ? "+" : "-"}{formatNumber(r.amount)}</b> },
      ]}
    />
  );
}
export const Accounting = () => <LedgerPage endpoint="/api/r/ledger" emoji="📒" title="حسابداری فروش" subtitle="دفتر روزنامه: فروش هر سفارش پرداخت‌شده خودکار ثبت می‌شود؛ ردیف دستی هم می‌توانید اضافه کنید" />;
export const IncomeExpense = () => <LedgerPage endpoint="/api/r/incomeexpense" emoji="💸" title="درآمد و هزینه" subtitle="ثبت هزینه‌های جاری (اجاره، حقوق، قبوض، خرید) و درآمدهای متفرقه" />;

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
function HBar({ rows, fmt }: { rows: { name: string; value: number; sub?: string }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">{rows.map((r) => (
      <li key={r.name}><div className="flex justify-between text-sm"><span className="truncate font-medium">{r.name}</span><span className="shrink-0 text-xs font-bold text-stone-600">{fmt(r.value)}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-gradient-to-l from-brand-400 to-brand-500" style={{ width: `${(r.value / max) * 100}%` }} /></div></li>
    ))}</ul>
  );
}
function useReport<T>(url: string, days: number) {
  const [d, setD] = useState<T | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    api<T>(`${url}?days=${days}`).then((r) => live && (setD(r), setErr(""))).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [url, days]);
  return { d, err };
}
const Kpi = ({ l, v, tone }: { l: string; v: string; tone?: string }) => <Card className="p-4"><p className="text-xs text-stone-500">{l}</p><p className={cn("mt-1.5 text-xl font-extrabold", tone)}>{v}</p></Card>;
const METHODS: Record<string, string> = { cash: "نقد", pos: "کارت‌خوان", card: "کارت به کارت", ipg: "درگاه آنلاین", snappay: "اسنپ‌پی", digipay: "دیجی‌پی", cashback: "اعتبار کش‌بک" };
const TYPES: Record<string, string> = { dine_in: "سالن", takeaway: "بیرون‌بر", delivery: "ارسال" };

type SalesRep = { totals: { revenue: number; orders: number; avg: number; discounts: number; tax: number }; series: { date: string; revenue: number; orders: number }[]; hours: { hour: number; orders: number }[]; methods: { method: string; amount: number; count: number }[]; types: { type: string; amount: number; count: number }[]; byProduct: { name: string; emoji: string; qty: number; revenue: number }[]; byCategory: { name: string; revenue: number; qty: number }[] };

export function Reports() {
  const [days, setDays] = useState(14);
  const { d, err } = useReport<SalesRep>("/api/r/report_sales", days);
  return (
    <div className="animate-fade-in">
      <PageHeader title="گزارش فروش" subtitle="فروش، سفارش‌ها و عملکرد محصولات در بازه‌های زمانی مختلف (سفارش‌های پرداخت‌شده)" actions={<Range days={days} setDays={setDays} />} />
      {err ? <ErrorState message={err} /> : !d ? <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div> : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi l="فروش کل" v={formatPrice(d.totals.revenue)} tone="text-emerald-600" /><Kpi l="تعداد سفارش" v={formatNumber(d.totals.orders)} /><Kpi l="میانگین سفارش" v={formatPrice(d.totals.avg)} /><Kpi l="مجموع تخفیف" v={formatPrice(d.totals.discounts)} /><Kpi l="مالیات دریافتی" v={formatPrice(d.totals.tax)} />
          </div>
          <Card className="p-5"><h3 className="mb-4 font-bold">فروش روزانه</h3><Bars data={d.series.map((s) => ({ label: toFa(formatShortDate(s.date).replace(/\D+/g, " ").trim().split(" ").pop() ?? ""), value: s.revenue }))} label={formatPrice} /><p className="mt-2 text-[11px] text-stone-400">آخرین روز: امروز · ارتفاع ستون‌ها نسبت به بیشترین فروش روزانه ({formatCompact(Math.max(...d.series.map((s) => s.revenue)))} تومان)</p></Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5"><h3 className="mb-4 font-bold">فروش به تفکیک دسته‌بندی</h3>{d.byCategory.length ? <HBar rows={d.byCategory.map((c) => ({ name: c.name, value: c.revenue }))} fmt={formatPrice} /> : <p className="text-sm text-stone-400">داده‌ای نیست</p>}</Card>
            <Card className="p-5"><h3 className="mb-4 font-bold">۱۰ محصول پرفروش (بر اساس درآمد)</h3>{d.byProduct.length ? <HBar rows={d.byProduct.map((c) => ({ name: `${c.emoji} ${c.name}`, value: c.revenue }))} fmt={formatPrice} /> : <p className="text-sm text-stone-400">داده‌ای نیست</p>}</Card>
            <Card className="p-5"><h3 className="mb-4 font-bold">ساعات پرفروش</h3><Bars data={d.hours.slice(6).map((h) => ({ label: toFa(h.hour), value: h.orders }))} color="bg-sky-400" /></Card>
            <Card className="space-y-5 p-5">
              <div><h3 className="mb-3 font-bold">روش پرداخت</h3><HBar rows={d.methods.map((m) => ({ name: `${METHODS[m.method] ?? m.method} (${toFa(m.count)})`, value: m.amount }))} fmt={formatPrice} /></div>
              <div><h3 className="mb-3 font-bold">نوع سفارش</h3><HBar rows={d.types.map((m) => ({ name: `${TYPES[m.type] ?? m.type} (${toFa(m.count)})`, value: m.amount }))} fmt={formatPrice} /></div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

type Pnl = { revenue: number; discounts: number; tax: number; cogs: number; grossProfit: number; expenses: number; otherIncome: number; net: number; expenseBreakdown: { name: string; amount: number }[]; series: { date: string; revenue: number; cogs: number; expenses: number }[]; cogsCoverage: number };
export function ProfitLoss() {
  const [days, setDays] = useState(30);
  const { d, err } = useReport<Pnl>("/api/r/report_pnl", days);
  const Row = ({ l, v, b, tone, sub }: { l: string; v: number; b?: boolean; tone?: string; sub?: string }) => <div className={cn("flex items-center justify-between py-3 text-sm", b && "border-t-2 border-stone-200 text-base font-extrabold")}><span>{l}{sub && <span className="block text-[11px] font-normal text-stone-400">{sub}</span>}</span><span className={tone}>{formatPrice(v)}</span></div>;
  return (
    <div className="animate-fade-in">
      <PageHeader title="گزارش سود و زیان" subtitle="درآمد خالص، بهای تمام‌شده، هزینه‌ها و سود خالص در بازه‌ی انتخابی" actions={<Range days={days} setDays={setDays} />} />
      {err ? <ErrorState message={err} /> : !d ? <Skeleton className="h-96 rounded-2xl" /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <Card className="p-5"><h3 className="mb-2 font-bold">صورت سود و زیان</h3><div className="divide-y divide-stone-100">
              <Row l="فروش خالص" sub={`پس از کسر ${formatPrice(d.discounts)} تخفیف؛ بدون مالیات`} v={d.revenue} />
              <Row l="بهای تمام‌شده‌ی کالای فروش‌رفته (COGS)" sub={`بر اساس فرمول ساخت؛ پوشش ${toFa(d.cogsCoverage)}٪ سفارش‌ها`} v={-d.cogs} tone="text-rose-600" />
              <Row l="سود ناخالص" v={d.grossProfit} b />
              <Row l="هزینه‌های عملیاتی" v={-d.expenses} tone="text-rose-600" />
              <Row l="سایر درآمدها" v={d.otherIncome} tone="text-emerald-600" />
              <Row l="سود خالص" v={d.net} b tone={d.net >= 0 ? "text-emerald-600" : "text-rose-600"} />
            </div></Card>
            <Card className="p-5"><h3 className="mb-4 font-bold">سود روزانه (فروش − بهای تمام‌شده − هزینه)</h3><Bars data={d.series.map((s) => ({ label: toFa(formatShortDate(s.date).replace(/\D+/g, " ").trim().split(" ").pop() ?? ""), value: s.revenue - s.cogs - s.expenses }))} color="bg-emerald-400" label={formatPrice} /></Card>
          </div>
          <Card className="h-fit p-5"><h3 className="mb-4 font-bold">ترکیب هزینه‌ها</h3>{d.expenseBreakdown.length ? <HBar rows={d.expenseBreakdown.map((e) => ({ name: e.name, value: e.amount }))} fmt={formatPrice} /> : <p className="text-sm text-stone-400">هزینه‌ای در این بازه ثبت نشده است.</p>}</Card>
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
      {err ? <ErrorState message={err} /> : !d ? <Skeleton className="h-48 rounded-2xl" /> : (
        <>
          <Card className="bg-gradient-to-l from-stone-900 to-stone-700 p-5 text-white"><p className="text-xs text-white/70">موجودی کل (صندوق + حساب‌های بانکی)</p><p className="mt-1 text-3xl font-black">{formatPrice(d.total)}</p></Card>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{d.accounts.map((a) => (
            <Card key={a.id ?? "cash"} className="p-4"><div className="flex items-start justify-between"><div><p className="font-bold">{a.id ? "🏛️" : "💵"} {a.name}</p><p className="text-[11px] text-stone-400">{a.bank} {a.accountNumber && `· ${toFa(a.accountNumber)}`}</p></div></div><p className="mt-3 text-xl font-extrabold">{formatPrice(a.balance)}</p><div className="mt-2 flex justify-between text-xs"><span className="text-emerald-600">ورودی: {formatCompact(a.income)}</span><span className="text-rose-600">خروجی: {formatCompact(a.expense)}</span></div></Card>
          ))}</div>
          <Card className="overflow-hidden"><div className="border-b border-stone-100 p-4 font-bold">آخرین تراکنش‌ها</div><ul className="divide-y divide-stone-100">{d.recent.slice(0, 12).map((t) => <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><Badge color={t.kind === "income" ? "emerald" : "rose"}>{t.kind === "income" ? "ورودی" : "خروجی"}</Badge><span className="min-w-0 flex-1 truncate">{t.category || t.description} <span className="text-xs text-stone-400">· {t.accountName}</span></span><b className={t.kind === "income" ? "text-emerald-600" : "text-rose-600"}>{formatNumber(t.amount)}</b><span className="hidden text-xs text-stone-400 sm:block">{formatDate(t.date)}</span></li>)}</ul></Card>
        </>
      )}
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
      emoji="🏛️"
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
      emoji="🏗️"
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
