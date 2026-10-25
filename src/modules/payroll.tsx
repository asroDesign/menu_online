"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Icon, Input, Modal, PageHeader, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import { JMONTHS, toJ } from "@/lib/jalali";

type Policy = {
  jalaliYear: number;
  minimumDailyWageToman: number; monthlyHousingToman: number; monthlyFoodToman: number; monthlyMaritalToman: number;
  monthlyChildToman: number; monthlySeniorityToman: number; monthlyTaxExemptionToman: number;
  taxBrackets: { upToToman: number | null; ratePercent: number }[];
  taxableComponentKeys: string[]; insurableComponentKeys: string[];
  employeeInsurancePercent: number; employerInsurancePercent: number; unemploymentInsurancePercent: number;
  overtimePercent: number; fridayPremiumPercent: number; holidayPremiumPercent: number; nightPremiumPercent: number;
  standardMonthlyHours: number; minimumInsuredHistoryDaysForChildAllowance: number; annualLeaveDays: number; legalSourceNote: string;
};
type StaffOption = { id: number; name: string; role: string; isActive: boolean };
type Earning = { key: string; label: string; amountToman: number; taxable: boolean; insurable: boolean };
type Item = {
  id: number; staffId: number; staffSnapshot: Record<string, any>;
  workMinutes: number; overtimeMinutes: number; fridayMinutes: number; holidayMinutes: number; nightMinutes: number;
  leaveMinutes: number; unpaidLeaveMinutes: number; shortMinutes: number;
  earnings: Earning[]; deductions: { key: string; label: string; amountToman: number; accounting: boolean }[];
  grossToman: number; employeeInsuranceToman: number; employerInsuranceToman: number; incomeTaxToman: number; penaltyToman: number; netToman: number;
};
type Settlement = { id: number; kind: string; amountToman: number; bankName: string; accountingDocumentId: number; paidAt: string };
type Run = { id: number; jalaliYear: number; jalaliMonth: number; status: "draft" | "approved"; approvalNote: string; salaryDocumentId: number | null; total: { grossToman: number; netToman: number; employeeInsuranceToman: number; employerInsuranceToman: number; incomeTaxToman: number }; items: Item[]; settlements: Settlement[]; events: { itemId: number; actorName: string; reason: string; createdAt: string; beforeData: Record<string, number>; afterData: Record<string, number> }[] };
type Adjustment = { id: number; staffId: number; staffName: string; kind: string; amountToman: number; description: string; legalBasis: string; status: string; taxable: boolean; insurable: boolean };
type Leave = { id: number; staffId: number; staffName: string; kind: string; hours: number; note: string; createdAt: string };
type Bank = { id: number; name: string; bank: string };
const componentNames: Record<string, string> = { base: "حقوق پایه", housing: "مسکن", food: "بن", marital: "تأهل", children: "اولاد", seniority: "سنوات", management: "مدیریت", overtime: "اضافه‌کاری", friday: "جمعه‌کاری", holiday: "تعطیل‌کاری", night: "شب‌کاری", reward: "تشویقی" };
const fmtMoney = (value: number) => formatPrice(Math.round(value));
const hours = (minutes: number) => `${(minutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ساعت`;
const numberValue = (value: string) => Number(value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "")) || 0;
const kindLabel: Record<string, string> = { salary: "حقوق", insurance: "بیمه", tax: "مالیات" };
const leaveLabel: Record<string, string> = { annual: "استحقاقی", sick: "استعلاجی", unpaid: "بدون حقوق", other: "سایر" };

function MetricCard({ title, value, tone = "blue" }: { title: string; value: string; tone?: string }) {
  const color = tone === "green" ? "bg-emerald-50 text-emerald-800" : tone === "amber" ? "bg-amber-50 text-amber-900" : tone === "rose" ? "bg-rose-50 text-rose-800" : "bg-sky-50 text-sky-900";
  return <Card className="p-3 shadow-sm"><p className="text-[11px] font-semibold text-base-content/55">{title}</p><p className={`mt-2 rounded-lg px-2.5 py-1.5 text-sm font-extrabold ${color}`}>{value}</p></Card>;
}

export default function Payroll() {
  const currentJ = useMemo(() => toJ(new Date()), []);
  const [year, setYear] = useState(currentJ.jy);
  const [month, setMonth] = useState(currentJ.jm);
  const [tab, setTab] = useState<"runs" | "people" | "policy">("runs");
  const [run, setRun] = useState<Run | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [hourForm, setHourForm] = useState<Record<string, string>>({});
  const [approvalNote, setApprovalNote] = useState("");
  const [settlement, setSettlement] = useState<{ kind: string; from: string; bankAccountId: string } | null>(null);
  const [leaveForm, setLeaveForm] = useState({ staffId: "", kind: "annual", hours: "", note: "" });
  const [adjustmentForm, setAdjustmentForm] = useState({ staffId: "", kind: "reward", amountToman: "", description: "", legalBasis: "", taxable: true, insurable: true });
  const toast = useToast();
  const period = `${year}-${String(month).padStart(2, "0")}`;

  const loadPolicy = useCallback(async () => {
    const data = await api<{ item: Policy; staff: StaffOption[]; banks: Bank[] }>(`/api/payroll/policy?year=${year}`);
    setPolicy(data.item); setStaffOptions(data.staff); setBanks(data.banks);
  }, [year]);
  const loadRuns = useCallback(async () => {
    const data = await api<{ items: any[] }>(`/api/payroll/runs?year=${year}`);
    setRuns(data.items);
    const selected = data.items.find((item) => item.jalaliYear === year && item.jalaliMonth === month);
    if (selected) {
      const details = await api<Run>(`/api/payroll/runs/${selected.id}`);
      setRun(details);
    } else setRun(null);
  }, [year, month]);
  const loadPeopleData = useCallback(async () => {
    const [a, l] = await Promise.all([
      api<{ items: Adjustment[] }>(`/api/payroll/adjustments?period=${period}`),
      api<{ items: Leave[] }>(`/api/payroll/leaves?period=${period}`),
    ]);
    setAdjustments(a.items); setLeaves(l.items);
  }, [period]);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { await Promise.all([loadPolicy(), loadRuns(), loadPeopleData()]); }
    catch (caught) { setError((caught as Error).message); }
    finally { setLoading(false); }
  }, [loadPeopleData, loadPolicy, loadRuns]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function selectMonth(delta: number) {
    let y = year, m = month + delta;
    if (m < 1) { y--; m = 12; }
    if (m > 12) { y++; m = 1; }
    setYear(y); setMonth(m);
  }
  async function createRun() {
    setSaving(true);
    try {
      const data = await api<Run>("/api/payroll/runs", { method: "POST", body: { period } });
      setRun(data); await loadRuns(); toast("پیش‌نویس حقوق ساخته شد؛ ساعت‌ها و هشدارها را بررسی کنید.");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }
  function openHours(item: Item) {
    setEditItem(item);
    setHourForm({ workMinutes: String(item.workMinutes / 60), overtimeMinutes: String(item.overtimeMinutes / 60), fridayMinutes: String(item.fridayMinutes / 60), holidayMinutes: String(item.holidayMinutes / 60), nightMinutes: String(item.nightMinutes / 60), leaveMinutes: String(item.leaveMinutes / 60), unpaidLeaveMinutes: String(item.unpaidLeaveMinutes / 60), shortMinutes: String(item.shortMinutes / 60), reason: "" });
  }
  async function saveHours() {
    if (!run || !editItem) return;
    if (hourForm.reason.trim().length < 10) return toast("دلیل اصلاح کارکرد را حداقل در ۱۰ حرف بنویسید", "error");
    setSaving(true);
    try {
      const fields = Object.fromEntries(Object.entries(hourForm).filter(([key]) => key !== "reason" && key !== "leaveMinutes").map(([key, value]) => [key, Math.round(numberValue(value) * 60)]));
      await api(`/api/payroll/runs/${run.id}`, { method: "PATCH", body: { itemId: editItem.id, ...fields, reason: hourForm.reason } });
      setRun(await api<Run>(`/api/payroll/runs/${run.id}`)); setEditItem(null); toast("کارکرد و مبلغ حقوق دوباره محاسبه شد");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }
  async function approveRun() {
    if (!run) return;
    const warnings = run.items.flatMap((item) => Array.isArray(item.staffSnapshot.warnings) ? item.staffSnapshot.warnings : []);
    if (warnings.length && approvalNote.trim().length < 10) return toast("هشدارها را بررسی کنید و در صورت تأیید، دلیل خود را بنویسید.", "error");
    setSaving(true);
    try {
      await api(`/api/payroll/runs/${run.id}/approve`, { method: "POST", body: { approvalNote } });
      setRun(await api<Run>(`/api/payroll/runs/${run.id}`)); await loadRuns(); toast("حقوق قطعی شد و سند حسابداری ایجاد شد.");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }
  async function payRun() {
    if (!run || !settlement) return;
    setSaving(true);
    try {
      await api(`/api/payroll/runs/${run.id}/settle`, { method: "POST", body: { kind: settlement.kind, from: settlement.from, bankAccountId: settlement.from === "bank" ? Number(settlement.bankAccountId) : undefined } });
      setRun(await api<Run>(`/api/payroll/runs/${run.id}`)); await loadRuns(); setSettlement(null); toast(`پرداخت ${kindLabel[settlement.kind]} ثبت و سند آن ایجاد شد.`);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }
  async function addLeave(event: FormEvent) {
    event.preventDefault(); if (!leaveForm.staffId) return toast("کارمند را انتخاب کنید", "error");
    setSaving(true);
    try { await api("/api/payroll/leaves", { method: "POST", body: { ...leaveForm, period, hours: numberValue(leaveForm.hours) } }); await loadPeopleData(); toast("مرخصی ثبت شد؛ در پیش‌نویس حقوق بعدی محاسبه می‌شود."); }
    catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  }
  async function addAdjustment(event: FormEvent) {
    event.preventDefault(); if (!adjustmentForm.staffId) return toast("کارمند را انتخاب کنید", "error");
    setSaving(true);
    try { await api("/api/payroll/adjustments", { method: "POST", body: { ...adjustmentForm, period, amountToman: numberValue(adjustmentForm.amountToman) } }); await loadPeopleData(); toast("مورد ثبت شد و برای تأیید در فهرست قرار گرفت."); }
    catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  }
  async function decideAdjustment(item: Adjustment, status: "approved" | "rejected") {
    try { await api(`/api/payroll/adjustments/${item.id}`, { method: "PATCH", body: { status } }); await loadPeopleData(); toast(status === "approved" ? "مورد تأیید شد" : "مورد رد شد"); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  async function savePolicy(event: FormEvent) {
    event.preventDefault(); if (!policy) return;
    setSaving(true);
    try { const data = await api<{ item: Policy }>("/api/payroll/policy", { method: "PUT", body: policy }); setPolicy(data.item); toast("تنظیمات سالانه ذخیره شد؛ لیست‌های قبلی از تغییرات مستقل هستند."); }
    catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  }
  async function exportFile(type: "insurance" | "tax") {
    if (!run) return;
    window.location.href = `/api/payroll/runs/${run.id}/export?type=${type}`;
  }
  const pendingAdjustments = adjustments.filter((item) => item.status === "pending");
  const warningCount = run?.items.reduce((sum, item) => sum + (Array.isArray(item.staffSnapshot.warnings) ? item.staffSnapshot.warnings.length : 0), 0) ?? 0;
  const editEvents = run?.events.filter((event) => event.itemId === editItem?.id) ?? [];

  return <main className="animate-fade-in space-y-4">
    <PageHeader title="حقوق و دستمزد" subtitle="محاسبه ماهانه، فیش حقوقی و ثبت تعهد و پرداخت در حسابداری" actions={<Button variant="secondary" onClick={() => void refresh()}><Icon name="refresh" className="size-4"/>به‌روزرسانی</Button>} />
    <div className="flex flex-wrap gap-2 rounded-2xl border border-base-300 bg-base-100 p-1.5" role="tablist" aria-label="بخش‌های حقوق و دستمزد">
      {([["runs", "لیست حقوق ماهانه", "calendar"], ["people", "مرخصی، تشویقی و جریمه", "users"], ["policy", "تنظیمات قانونی سالانه", "settings"]] as [typeof tab, string, string][]).map(([key, label, icon]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold ${tab === key ? "bg-primary text-primary-content shadow-sm" : "text-base-content/65 hover:bg-base-200"}`}><Icon name={icon} className="size-4"/>{label}</button>)}
    </div>
    {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : loading ? <div className="space-y-3"><Skeleton className="h-28 rounded-2xl"/><Skeleton className="h-64 rounded-2xl"/></div> : <>
      {tab === "runs" && <section className="space-y-4">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-2"><Button size="sm" variant="secondary" aria-label="ماه بعد" onClick={() => void selectMonth(1)}><Icon name="chevron-left" className="size-4"/></Button><div className="min-w-40 text-center"><p className="text-[11px] font-semibold text-base-content/50">دوره حقوق</p><strong className="text-sm">{JMONTHS[month - 1]} {toFa(year)}</strong></div><Button size="sm" variant="secondary" aria-label="ماه قبل" onClick={() => void selectMonth(-1)}><Icon name="chevron-right" className="size-4"/></Button></div>
          <div className="flex flex-wrap items-center gap-2">{run?.status === "approved" && <><Button size="sm" variant="secondary" onClick={() => void exportFile("insurance")}><Icon name="download" className="size-4"/>خروجی بیمه</Button><Button size="sm" variant="secondary" onClick={() => void exportFile("tax")}><Icon name="download" className="size-4"/>خروجی مالیات</Button></>}{!run && <Button disabled={saving} onClick={() => void createRun()}><Icon name="plus" className="size-4"/>ایجاد لیست این ماه</Button>}</div>
        </Card>
        {!run ? <EmptyState emoji="" title="برای این ماه لیست حقوق ساخته نشده" description="قبل از ساخت، اطلاعات حقوقی کارکنان و تنظیمات سالانه را بررسی کنید. کارکرد ثبت‌شده از حضور و غیاب وارد می‌شود." action={<Button onClick={() => setTab("people")}>ثبت مرخصی و مزایا</Button>}/> : <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard title="کارکنان" value={toFa(run.items.length)} />
            <MetricCard title="ناخالص حقوق" value={fmtMoney(run.total.grossToman)} />
            <MetricCard title="خالص پرداختنی" value={fmtMoney(run.total.netToman)} tone="green" />
            <MetricCard title="بیمه کل (کارمند + کارفرما)" value={fmtMoney(run.total.employeeInsuranceToman + run.total.employerInsuranceToman)} tone="amber" />
            <MetricCard title="مالیات حقوق" value={fmtMoney(run.total.incomeTaxToman)} tone="rose" />
          </div>
          {run.status === "draft" && warningCount > 0 && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs leading-6 text-amber-950"><b>نیاز به بررسی: {toFa(warningCount)} هشدار</b><p>کف مزد، کد ملی، شماره بیمه یا کارکرد ناقص را پیش از تأیید بررسی کنید. در صورت ادامه با وجود هشدار، دلیل تأیید اجباری است.</p></div>}
          {run.status === "approved" && <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950"><span><b>لیست قطعی شد.</b> سند حسابداری #{toFa(run.salaryDocumentId ?? 0)} ثبت شده و مقادیر آن قفل است.</span><span className="font-bold">{run.approvalNote ? `یادداشت: ${run.approvalNote}` : ""}</span></div>}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 p-3"><div><h2 className="text-sm font-extrabold">کارکرد و محاسبه هر کارمند</h2><p className="mt-1 text-[11px] text-base-content/55">ساعت‌های حضور از ثبت ورود و خروج می‌آیند؛ اضافه‌کاری و تعطیل‌کاری را کنترل کنید.</p></div><Badge color={run.status === "approved" ? "emerald" : "amber"}>{run.status === "approved" ? "قطعی" : "پیش‌نویس"}</Badge></div>
            {run.items.length === 0 ? <p className="p-6 text-center text-sm text-base-content/55">کارمندی در لیست نیست.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1060px] text-xs"><thead><tr className="bg-base-200/60 text-base-content/60">{["کارمند", "کارکرد", "اضافه‌کاری", "جمعه‌کاری", "تعطیل‌کاری", "شب‌کاری", "مرخصی", "کسر ساعت", "ناخالص", "کسورات", "خالص", "فیش"].map((label) => <th key={label} className="px-3 py-3 text-start">{label}</th>)}</tr></thead><tbody className="divide-y divide-base-200">{run.items.map((item) => { const warnings: string[] = Array.isArray(item.staffSnapshot.warnings) ? item.staffSnapshot.warnings : []; const deductions = item.employeeInsuranceToman + item.incomeTaxToman + item.penaltyToman; return <tr key={item.id} className="align-middle hover:bg-base-200/30"><td className="px-3 py-3"><button type="button" onClick={() => openHours(item)} className="text-start font-extrabold text-base-content hover:text-primary">{item.staffSnapshot.name ?? `کارمند ${toFa(item.staffId)}`}</button><p className="mt-1 text-[10px] text-base-content/50">{item.staffSnapshot.jobTitle || "بدون عنوان شغلی"}{warnings.length > 0 && <span className="ms-1 text-amber-700">· هشدار {toFa(warnings.length)}</span>}</p></td><td className="px-3 py-3">{hours(item.workMinutes)}</td><td className="px-3 py-3">{hours(item.overtimeMinutes)}</td><td className="px-3 py-3">{hours(item.fridayMinutes)}</td><td className="px-3 py-3">{hours(item.holidayMinutes)}</td><td className="px-3 py-3">{hours(item.nightMinutes)}</td><td className="px-3 py-3">{hours(item.leaveMinutes)}</td><td className="px-3 py-3">{hours(item.shortMinutes + item.unpaidLeaveMinutes)}</td><td className="px-3 py-3 font-bold">{fmtMoney(item.grossToman)}</td><td className="px-3 py-3 text-rose-700">{fmtMoney(deductions)}</td><td className="px-3 py-3 font-extrabold text-emerald-800">{fmtMoney(item.netToman)}</td><td className="px-3 py-3"><a className="btn btn-sm btn-outline min-h-8 h-8 px-2 text-[11px]" href={`/dashboard/payroll/payslip/${run.id}/${item.staffId}`} target="_blank" rel="noreferrer"><Icon name="print" className="size-3.5"/>چاپ</a></td></tr>; })}</tbody></table></div>}
            {run.status === "draft" && <div className="space-y-3 border-t border-base-300 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-base-content/55">تغییر کارکرد، مرخصی یا تشویقی پیش‌نویس را خودکار قفل نمی‌کند.</span><Button size="sm" variant="secondary" disabled={saving} onClick={async () => { setSaving(true); try { const next = await api<Run>(`/api/payroll/runs/${run.id}/recalculate`, { method: "POST", body: {} }); setRun(next); toast("کارکرد، مرخصی‌ها و موارد تأییدشده دوباره محاسبه شدند."); } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); } }}><Icon name="refresh" className="size-4"/>بازخوانی داده و محاسبه مجدد</Button></div><Field label="دلیل تأیید با وجود هشدار (در صورت وجود)" hint="در تأیید نهایی در سابقه لیست ذخیره می‌شود"><Input maxLength={500} value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} placeholder="مثلاً قرارداد پاره‌وقت و تناسب کف مزد با ساعات کارکرد بررسی شد"/></Field><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] leading-5 text-base-content/50">با تأیید، سند تعهد حقوق، مالیات و بیمه ایجاد می‌شود و این ماه قفل خواهد شد.</span><Button disabled={saving} onClick={() => void approveRun()}><Icon name="check" className="size-4"/>بررسی و قطعی‌کردن حقوق</Button></div></div>}
          </Card>
          {run.status === "approved" && <Card className="p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-extrabold">پرداخت و تسویه تعهدها</h3><p className="mt-1 text-[11px] text-base-content/55">هر پرداخت سند جدا دارد و حساب بانکی در تفصیلی سند ثبت می‌شود.</p></div></div><div className="mt-3 flex flex-wrap gap-2">{(["salary", "insurance", "tax"] as const).map((kind) => { const paid = run.settlements.some((entry) => entry.kind === kind); const amount = kind === "salary" ? run.total.netToman : kind === "insurance" ? run.total.employeeInsuranceToman + run.total.employerInsuranceToman : run.total.incomeTaxToman; return amount > 0 && <Button key={kind} size="sm" variant={paid ? "secondary" : "primary"} disabled={paid} onClick={() => setSettlement({ kind, from: "bank", bankAccountId: banks[0] ? String(banks[0].id) : "" })}><Icon name={paid ? "check" : "wallet"} className="size-4"/>{paid ? `${kindLabel[kind]} پرداخت شد` : `ثبت پرداخت ${kindLabel[kind]} · ${fmtMoney(amount)}`}</Button>; })}</div>{run.settlements.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-3">{run.settlements.map((entry) => <div key={entry.id} className="rounded-xl border border-base-300 bg-base-200/40 p-3 text-xs"><b>{kindLabel[entry.kind]} · {fmtMoney(entry.amountToman)}</b><p className="mt-1 text-base-content/55">{entry.bankName} · سند #{toFa(entry.accountingDocumentId)}</p></div>)}</div>}</Card>}
          {runs.length > 1 && <details className="rounded-2xl border border-base-300 bg-base-100"><summary className="cursor-pointer px-4 py-3 text-xs font-bold">سوابق حقوق این سال · {toFa(runs.length)} دوره</summary><div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">{runs.map((entry) => <button key={entry.id} type="button" onClick={() => { setYear(entry.jalaliYear); setMonth(entry.jalaliMonth); }} className="flex items-center justify-between rounded-xl border border-base-300 p-3 text-start hover:bg-base-200"><span><b>{JMONTHS[entry.jalaliMonth - 1]} {toFa(entry.jalaliYear)}</b><small className="mt-1 block text-base-content/55">{toFa(entry.staffCount)} کارمند · {fmtMoney(entry.netToman)}</small></span><Badge color={entry.status === "approved" ? "emerald" : "amber"}>{entry.status === "approved" ? "قطعی" : "پیش‌نویس"}</Badge></button>)}</div></details>}
        </>}
      </section>}
      {tab === "people" && <section className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4"><h2 className="text-sm font-extrabold">ثبت مرخصی برای {JMONTHS[month - 1]} {toFa(year)}</h2><p className="mt-1 text-xs leading-5 text-base-content/55">مرخصی استحقاقی/استعلاجی در جمع کارکرد دیده می‌شود؛ مرخصی بدون حقوق از مبلغ پایه کسر می‌شود.</p><form onSubmit={addLeave} className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="کارمند"><Select value={leaveForm.staffId} onChange={(e) => setLeaveForm({ ...leaveForm, staffId: e.target.value })}><option value="">انتخاب کنید</option>{staffOptions.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="نوع"><Select value={leaveForm.kind} onChange={(e) => setLeaveForm({ ...leaveForm, kind: e.target.value })}><option value="annual">استحقاقی</option><option value="sick">استعلاجی</option><option value="unpaid">بدون حقوق</option><option value="other">سایر</option></Select></Field><Field label="ساعت"><Input inputMode="decimal" value={leaveForm.hours} onChange={(e) => setLeaveForm({ ...leaveForm, hours: e.target.value })} placeholder="مثلاً ۷٫۳۳"/></Field><Field label="توضیح"><Input value={leaveForm.note} onChange={(e) => setLeaveForm({ ...leaveForm, note: e.target.value })} placeholder="اختیاری"/></Field><div className="sm:col-span-2"><Button disabled={saving} type="submit"><Icon name="plus" className="size-4"/>ثبت مرخصی</Button></div></form><div className="mt-4 divide-y divide-base-200">{leaves.length === 0 ? <p className="py-5 text-center text-xs text-base-content/50">مرخصی ثبت نشده است.</p> : leaves.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 py-2.5 text-xs"><span><b>{item.staffName}</b><small className="ms-2 text-base-content/55">{leaveLabel[item.kind]} · {item.note || "بدون توضیح"}</small></span><Badge color={item.kind === "unpaid" ? "amber" : "blue"}>{toFa(item.hours)} ساعت</Badge></div>)}</div></Card>
        <Card className="p-4"><h2 className="text-sm font-extrabold">تشویقی و جریمه مستند</h2><p className="mt-1 text-xs leading-5 text-base-content/55">موارد ابتدا در انتظار تأیید می‌مانند و فقط پس از تأیید در حقوق منظور می‌شوند. کسر از مزد باید مبنای قانونی داشته باشد.</p><form onSubmit={addAdjustment} className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="کارمند"><Select value={adjustmentForm.staffId} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, staffId: e.target.value })}><option value="">انتخاب کنید</option>{staffOptions.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="نوع"><Select value={adjustmentForm.kind} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, kind: e.target.value })}><option value="reward">تشویقی / پاداش</option><option value="penalty">جریمه / کسر مستند</option></Select></Field><Field label="مبلغ (تومان)"><Input inputMode="numeric" value={adjustmentForm.amountToman} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, amountToman: e.target.value })}/></Field><Field label="شرح"><Input value={adjustmentForm.description} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, description: e.target.value })}/></Field>{adjustmentForm.kind === "penalty" && <Field label="مبنای قانونی/مستند" className="sm:col-span-2"><Textarea rows={2} value={adjustmentForm.legalBasis} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, legalBasis: e.target.value })} placeholder="مستند، رضایت/حکم یا مرجع مجاز بررسی کسر از مزد"/></Field>}<div className="flex flex-wrap gap-4 text-xs sm:col-span-2"><label className="flex items-center gap-2"><input type="checkbox" checked={adjustmentForm.taxable} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, taxable: e.target.checked })}/>مشمول مالیات</label><label className="flex items-center gap-2"><input type="checkbox" checked={adjustmentForm.insurable} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, insurable: e.target.checked })}/>مشمول بیمه</label></div><div className="sm:col-span-2"><Button disabled={saving} type="submit"><Icon name="plus" className="size-4"/>ثبت برای بررسی</Button></div></form><div className="mt-4 divide-y divide-base-200">{adjustments.length === 0 ? <p className="py-5 text-center text-xs text-base-content/50">موردی ثبت نشده است.</p> : adjustments.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"><span><b>{item.staffName} · {item.kind === "reward" ? "تشویقی" : "جریمه"}</b><small className="mt-1 block text-base-content/55">{item.description} · {fmtMoney(item.amountToman)}{item.legalBasis && ` · ${item.legalBasis}`}</small></span><div className="flex items-center gap-1"><Badge color={item.status === "approved" ? "emerald" : item.status === "rejected" ? "rose" : "amber"}>{item.status === "approved" ? "تأیید" : item.status === "rejected" ? "ردشده" : "در انتظار"}</Badge>{item.status === "pending" && <><Button size="sm" variant="secondary" onClick={() => void decideAdjustment(item, "approved")}>تأیید</Button><Button size="sm" variant="ghost" onClick={() => void decideAdjustment(item, "rejected")}>رد</Button></>}</div></div>)}</div></Card>
        {pendingAdjustments.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-950 xl:col-span-2">{toFa(pendingAdjustments.length)} مورد تشویقی/جریمه در انتظار تأیید است. پیش از ساخت یا بازسازی لیست حقوق آن‌ها را بررسی کنید.</div>}
      </section>}
      {tab === "policy" && policy && <section className="space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-950"><b>پارامترهای سال {toFa(year)} شمسی</b><p>اعداد قوانین مزد، معافیت، بیمه و مزایای مشمول ممکن است سالانه تغییر کنند. مقادیر این صفحه باید با آخرین بخشنامه رسمی تطبیق و توسط کارفرما/حسابدار تأیید شوند. لیست‌های قطعی از نسخه تنظیمات خود استفاده می‌کنند.</p></div>
        <form onSubmit={savePolicy} className="space-y-4">
          <Card className="p-4"><h2 className="text-sm font-extrabold">مزد و مزایای ماهانه (تومان)</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([["minimumDailyWageToman", "حداقل مزد روزانه"], ["monthlyHousingToman", "کمک‌هزینه مسکن"], ["monthlyFoodToman", "بن و اقلام مصرفی"], ["monthlyMaritalToman", "حق تأهل"], ["monthlyChildToman", "حق اولاد هر فرزند"], ["monthlySeniorityToman", "پایه سنوات ماهانه پس از یک سال"]] as [keyof Policy, string][]).map(([key, label]) => <Field key={key} label={label}><Input inputMode="numeric" value={String(policy[key] ?? 0)} onChange={(e) => setPolicy({ ...policy, [key]: numberValue(e.target.value) })}/></Field>)}</div></Card>
          <Card className="p-4"><h2 className="text-sm font-extrabold">بیمه و اضافه‌کاری</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([["employeeInsurancePercent", "بیمه سهم کارمند٪"], ["employerInsurancePercent", "بیمه سهم کارفرما٪"], ["unemploymentInsurancePercent", "بیمه بیکاری٪"], ["overtimePercent", "فوق‌العاده اضافه‌کاری٪"], ["fridayPremiumPercent", "فوق‌العاده جمعه‌کاری٪"], ["holidayPremiumPercent", "نرخ تعطیل‌کاری افزایشی٪"], ["nightPremiumPercent", "فوق‌العاده شب‌کاری٪"], ["standardMonthlyHours", "ساعت موظفی ماهانه"], ["minimumInsuredHistoryDaysForChildAllowance", "حداقل سابقه بیمه حق اولاد (روز)"], ["annualLeaveDays", "روز مرخصی استحقاقی سالانه"]] as [keyof Policy, string][]).map(([key, label]) => <Field key={key} label={label}><Input inputMode="numeric" value={String(policy[key] ?? 0)} onChange={(e) => setPolicy({ ...policy, [key]: numberValue(e.target.value) })}/></Field>)}</div></Card>
          <Card className="p-4"><h2 className="text-sm font-extrabold">مالیات حقوق</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="مبلغ پایه معافیت مالیاتی ماهانه (تومان)" hint="مالیات به‌صورت پلکانی روی درآمد مشمول بیش از این عدد محاسبه می‌شود."><Input inputMode="numeric" value={String(policy.monthlyTaxExemptionToman)} onChange={(e) => setPolicy({ ...policy, monthlyTaxExemptionToman: numberValue(e.target.value) })}/></Field><Field label="مرجع و یادداشت تنظیمات"><Input value={policy.legalSourceNote} onChange={(e) => setPolicy({ ...policy, legalSourceNote: e.target.value })} placeholder="شماره بخشنامه / تاریخ بررسی"/></Field></div><div className="mt-3 space-y-2">{policy.taxBrackets.map((band, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-xl bg-base-200/50 p-2"><Field label={`حد بالای پلکان ${toFa(index + 1)} (تومان بیش از معافیت)`}><Input inputMode="numeric" placeholder="خالی = بدون سقف" value={band.upToToman == null ? "" : String(band.upToToman)} onChange={(e) => setPolicy({ ...policy, taxBrackets: policy.taxBrackets.map((current, i) => i === index ? { ...current, upToToman: e.target.value === "" ? null : numberValue(e.target.value) } : current) })}/></Field><Field label="نرخ مالیات٪"><Input inputMode="numeric" value={String(band.ratePercent)} onChange={(e) => setPolicy({ ...policy, taxBrackets: policy.taxBrackets.map((current, i) => i === index ? { ...current, ratePercent: numberValue(e.target.value) } : current) })}/></Field><Button size="sm" variant="ghost" aria-label="حذف پلکان" onClick={() => setPolicy({ ...policy, taxBrackets: policy.taxBrackets.filter((_, i) => i !== index) })}><Icon name="trash" className="size-4"/></Button></div>)}<div className="flex flex-wrap gap-2"><Button size="sm" type="button" variant="secondary" onClick={() => setPolicy({ ...policy, taxBrackets: [...policy.taxBrackets, { upToToman: null, ratePercent: 0 }] })}><Icon name="plus" className="size-4"/>افزودن پلکان</Button></div></div></Card>
          <Card className="grid gap-4 p-4 lg:grid-cols-2"><div><h3 className="text-sm font-extrabold">اقلام مشمول مالیات</h3><div className="mt-3 grid grid-cols-2 gap-2 text-xs">{Object.entries(componentNames).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={policy.taxableComponentKeys.includes(key)} onChange={(e) => setPolicy({ ...policy, taxableComponentKeys: e.target.checked ? [...policy.taxableComponentKeys, key] : policy.taxableComponentKeys.filter((value) => value !== key) })}/>{label}</label>)}</div></div><div><h3 className="text-sm font-extrabold">اقلام مشمول بیمه</h3><div className="mt-3 grid grid-cols-2 gap-2 text-xs">{Object.entries(componentNames).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={policy.insurableComponentKeys.includes(key)} onChange={(e) => setPolicy({ ...policy, insurableComponentKeys: e.target.checked ? [...policy.insurableComponentKeys, key] : policy.insurableComponentKeys.filter((value) => value !== key) })}/>{label}</label>)}</div></div></Card>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="max-w-3xl text-[11px] leading-5 text-base-content/55">این ابزار جایگزین ارسال رسمی لیست بیمه یا گزارش مالیاتی سامانه دولتی نیست. «تعطیل‌کاری» در این نسخه یک ضریب قابل تنظیم دارد و باید با نوع روز تعطیل، برنامه کاری و قرارداد تطبیق داده شود.</span><Button type="submit" disabled={saving}><Icon name="save" className="size-4"/>ذخیره تنظیمات سال {toFa(year)}</Button></div>
        </form>
      </section>}
    </>}
    <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`کارکرد و فیش · ${editItem?.staffSnapshot.name ?? "کارمند"}`} size="lg" footer={<><Button variant="ghost" onClick={() => setEditItem(null)}>بستن</Button>{run?.status === "draft" && <Button disabled={saving} onClick={() => void saveHours()}>ذخیره و محاسبه مجدد</Button>}</>}>
      {editItem && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([["workMinutes", "جمع کارکرد"], ["overtimeMinutes", "اضافه‌کاری"], ["fridayMinutes", "جمعه‌کاری"], ["holidayMinutes", "تعطیل‌کاری"], ["nightMinutes", "شب‌کاری"], ["leaveMinutes", "جمع مرخصی"], ["unpaidLeaveMinutes", "مرخصی بدون حقوق"], ["shortMinutes", "کسر ساعت"]] as [string, string][]).map(([key, label]) => <Field key={key} label={`${label} (ساعت)`}><Input disabled={run?.status !== "draft" || key === "leaveMinutes"} inputMode="decimal" value={hourForm[key] ?? "0"} onChange={(e) => setHourForm({ ...hourForm, [key]: e.target.value })}/></Field>)}</div>{run?.status === "draft" && <Field label="دلیل اصلاح دستی (اجباری)" hint="در تاریخچهٔ تغییر کارکرد با نام کاربر ثبت می‌شود"><Textarea rows={2} value={hourForm.reason ?? ""} onChange={(e) => setHourForm({ ...hourForm, reason: e.target.value })} placeholder="علت اصلاح ساعت ورود/خروج یا کارکرد را بنویسید"/></Field>}<div className="rounded-xl border border-base-300 p-3"><h3 className="text-xs font-extrabold">اجزای دریافتی</h3><div className="mt-2 divide-y divide-base-200">{editItem.earnings.map((entry) => <div key={entry.key} className="flex items-center justify-between gap-3 py-2 text-xs"><span>{entry.label}<small className="ms-2 text-base-content/50">{entry.taxable ? "مشمول مالیات" : "معاف از مالیات"} · {entry.insurable ? "مشمول بیمه" : "غیرمشمول بیمه"}</small></span><b>{fmtMoney(entry.amountToman)}</b></div>)}</div><div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-base-300 pt-3 text-xs"><b>ناخالص: {fmtMoney(editItem.grossToman)}</b><b>بیمه کارمند: {fmtMoney(editItem.employeeInsuranceToman)}</b><b>مالیات: {fmtMoney(editItem.incomeTaxToman)}</b><b className="text-emerald-700">خالص: {fmtMoney(editItem.netToman)}</b></div></div><div className="rounded-xl bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">ساعت‌های اضافه‌کاری، جمعه‌کاری و تعطیل‌کاری را برای هم‌پوشانی دوباره‌شماری نکنید. شب‌کاری می‌تواند با ساعات دیگر هم‌زمان باشد. هر اصلاح دستی همراه با دلیل، نام کاربر و مقادیر قبل و بعد در تاریخچه ثبت می‌شود.</div>{editEvents.length > 0 && <details className="rounded-xl border border-base-300 p-3"><summary className="cursor-pointer text-xs font-bold">تاریخچه اصلاح کارکرد · {toFa(editEvents.length)}</summary><div className="mt-2 space-y-2">{editEvents.map((event, index) => <div key={`${event.createdAt}-${index}`} className="rounded-lg bg-base-200/50 p-2 text-[11px] leading-5"><b>{event.actorName} · {new Date(event.createdAt).toLocaleString("fa-IR")}</b><p>{event.reason}</p><p className="text-base-content/55">قبل: {Object.entries(event.beforeData).map(([key, value]) => `${key} ${toFa(value)}`).join(" · ")} | بعد: {Object.entries(event.afterData).map(([key, value]) => `${key} ${toFa(value)}`).join(" · ")}</p></div>)}</div></details>}{Array.isArray(editItem.staffSnapshot.warnings) && editItem.staffSnapshot.warnings.length > 0 && <ul className="list-inside list-disc rounded-xl border border-amber-200 p-3 text-xs leading-6 text-amber-900">{editItem.staffSnapshot.warnings.map((warning: string, index: number) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>}</div>}
    </Modal>
    <Modal open={!!settlement} onClose={() => setSettlement(null)} title={`ثبت پرداخت ${kindLabel[settlement?.kind ?? ""] ?? ""}`} size="sm" footer={<><Button variant="ghost" onClick={() => setSettlement(null)}>انصراف</Button><Button disabled={saving || (settlement?.from === "bank" && !settlement.bankAccountId)} onClick={() => void payRun()}><Icon name="check" className="size-4"/>ثبت پرداخت و سند</Button></>}>
      {settlement && <div className="space-y-3"><Field label="روش پرداخت"><Select value={settlement.from} onChange={(e) => setSettlement({ ...settlement, from: e.target.value, bankAccountId: banks[0] ? String(banks[0].id) : "" })}><option value="bank">از حساب بانکی</option><option value="cash">از صندوق نقدی</option></Select></Field>{settlement.from === "bank" && <Field label="حساب بانکی"><Select value={settlement.bankAccountId} onChange={(e) => setSettlement({ ...settlement, bankAccountId: e.target.value })}><option value="">انتخاب کنید</option>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.bank ? `${bank.bank} · ` : ""}{bank.name}</option>)}</Select>{banks.length === 0 && <small className="text-rose-700">ابتدا حساب بانکی را در بخش بانک تعریف کنید.</small>}</Field>}<p className="rounded-xl bg-base-200 p-3 text-xs leading-6">مبلغ {kindLabel[settlement.kind]} برای این ماه از مجموع فیش‌ها به دست می‌آید و پس از ثبت، سند حسابداری و وضعیت پرداخت ایجاد می‌شود.</p></div>}
    </Modal>
  </main>;
}
