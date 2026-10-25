"use client";

import { useEffect, useMemo, useState } from "react";
import { api, useCollection } from "@/lib/api";
import { formatCompact, formatDate, formatPrice, toFa } from "@/lib/format";
import { fromJ, JMONTHS, jMonthLength, toJ } from "@/lib/jalali";
import { chequeStatusesFor } from "@/lib/cheques";
import { CHEQUE_PURPOSES, IRANIAN_BANKS } from "@/lib/cheque-metadata";
import { tehranDayKey } from "@/lib/cheque-reminders-core";
import { AmountInput, Badge, Button, Card, cn, EmptyState, ErrorState, Field, Icon, Input, Modal, PageHeader, PersianDateInput, Select, Skeleton, useToast } from "@/components/ui";

type Account = { id: number; code: string; name: string; level: string; nature: string; type: string };
type Beneficiary = { id: number; fullName: string; nationalId: string; phone: string };
type Event = { id: number; fromStatus: string | null; toStatus: string; note: string; createdAt: string; accountingAccountId: number | null; reversalDocumentId: number | null; accountingDocumentId: number | null };
type Cheque = { id: number; beneficiaryId: number | null; direction: string; status: string; partnerName: string; amount: number; issueDate: string; dueDate: string; chequeNumber: string; serialNumber: string; bank: string; branch: string; expensePurpose: string; sayadIdentifier: string; note: string; accountingAccountId: number | null; accountingDocumentId: number | null; events: Event[] };
const labels: Record<string, string> = { payable: "پرداختنی", receivable: "دریافتنی", registered: "ثبت شد", passed: "پاس شد", bounced: "برگشت خورده", returned: "عودت داده شد", assigned: "واگذار شد", voided: "ابطال شد" };
const weekdays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const dayKey = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const chequeDayKey = (date: string) => { const { jy, jm, jd } = toJ(date); return dayKey(jy, jm, jd); };
type DayTotals = { payable: number; receivable: number; count: number };
const EMPTY_CHEQUES: Cheque[] = [];

export default function Cheques() {
  const records = useCollection<Cheque>("/api/cheques");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [beneficiaryModalOpen, setBeneficiaryModalOpen] = useState(false);
  const [direction, setDirection] = useState("payable");
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [beneficiaryDraft, setBeneficiaryDraft] = useState({ fullName: "", nationalId: "", phone: "" });
  const [beneficiaryBusy, setBeneficiaryBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState(() => tehranDayKey(new Date()));
  const [dueDate, setDueDate] = useState("");
  const [bank, setBank] = useState("");
  const [bankCustom, setBankCustom] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [branch, setBranch] = useState("");
  const [expensePurpose, setExpensePurpose] = useState("");
  const [purposeCustom, setPurposeCustom] = useState("");
  const [sayadIdentifier, setSayadIdentifier] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountingAccountId, setAccountingAccountId] = useState("");
  const [editingCheque, setEditingCheque] = useState<Cheque | null>(null);
  const [nextStatus, setNextStatus] = useState("");
  const [transitionAccountId, setTransitionAccountId] = useState("");
  const [assignedAccountId, setAssignedAccountId] = useState("");
  const [transitionNote, setTransitionNote] = useState("");
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [viewMonth, setViewMonth] = useState(() => { const { jy, jm } = toJ(new Date()); return { year: jy, month: jm }; });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calendarVersion, setCalendarVersion] = useState(0);
  const [calendarResult, setCalendarResult] = useState<{ key: string; items: Cheque[]; error: string } | null>(null);
  const calendarRequestKey = `${viewMonth.year}-${viewMonth.month}-${calendarVersion}`;
  const calendarItems = calendarResult?.key === calendarRequestKey ? calendarResult.items : EMPTY_CHEQUES;
  const calendarLoading = calendarResult?.key !== calendarRequestKey;
  const calendarError = calendarResult?.key === calendarRequestKey ? calendarResult.error : "";
  useEffect(() => { const tick = () => setNow(Date.now()); const initial = window.setTimeout(tick, 0); const timer = window.setInterval(tick, 60_000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, []);
  useEffect(() => {
    let active = true;
    api<{ items: Account[] }>("/api/cheques/accounts")
      .then((result) => { if (active) setAccounts(result.items); })
      .catch((cause) => { if (active) toast((cause as Error).message, "error"); })
      .finally(() => { if (active) setAccountsLoading(false); });
    return () => { active = false; };
  }, [toast]);
  useEffect(() => {
    let active = true;
    api<{ items: Beneficiary[] }>("/api/cheques/beneficiaries")
      .then((result) => { if (active) setBeneficiaries(result.items); })
      .catch((cause) => { if (active) toast((cause as Error).message, "error"); });
    return () => { active = false; };
  }, [toast]);
  useEffect(() => {
    let active = true;
    api<{ items: Cheque[] }>(`/api/cheques?year=${viewMonth.year}&month=${viewMonth.month}`)
      .then((result) => { if (active) setCalendarResult({ key: calendarRequestKey, items: result.items, error: "" }); })
      .catch((cause) => { if (active) setCalendarResult({ key: calendarRequestKey, items: [], error: (cause as Error).message }); });
    return () => { active = false; };
  }, [viewMonth, calendarVersion, calendarRequestKey]);
  async function create() {
    const selectedBeneficiary = beneficiaries.find((beneficiary) => String(beneficiary.id) === beneficiaryId);
    const selectedBank = bank === "سایر" ? bankCustom.trim() : bank;
    const purpose = expensePurpose === "سایر" ? purposeCustom.trim() : expensePurpose;
    if (!beneficiaryId || !selectedBeneficiary) return toast("ذی‌نفع چک را انتخاب کنید یا در همین فرم بسازید.", "error");
    if (!amount || !issueDate || !dueDate) return toast("مبلغ و تاریخ صدور و سررسید را وارد کنید.", "error");
    if (!chequeNumber.trim() || !serialNumber.trim() || !selectedBank) return toast("شماره، سریال و بانک چک را وارد کنید.", "error");
    if (!accountingAccountId) return toast("کد حساب طرف سند را انتخاب کنید.", "error");
    setBusy(true);
    try {
      await api("/api/cheques", { method: "POST", body: { direction, beneficiaryId: Number(beneficiaryId), amount, issueDate, dueDate, chequeNumber, serialNumber, bank: selectedBank, branch, expensePurpose: purpose, sayadIdentifier, note, accountingAccountId: Number(accountingAccountId) } });
      setOpen(false); setBeneficiaryId(""); setAmount(""); setIssueDate(tehranDayKey(new Date())); setDueDate(""); setBank(""); setBankCustom(""); setChequeNumber(""); setSerialNumber(""); setBranch(""); setExpensePurpose(""); setPurposeCustom(""); setSayadIdentifier(""); setNote(""); setAccountingAccountId("");
      await records.reload(true); setCalendarVersion((version) => version + 1); toast("چک ثبت و سند حسابداری آن به‌صورت خودکار ایجاد شد.");
    }
    catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBusy(false); }
  }
  async function createBeneficiary() {
    setBeneficiaryBusy(true);
    try {
      const result = await api<{ item: Beneficiary }>("/api/cheques/beneficiaries", { method: "POST", body: beneficiaryDraft });
      setBeneficiaries((items) => [...items, result.item].sort((a, b) => a.fullName.localeCompare(b.fullName, "fa")));
      setBeneficiaryId(String(result.item.id)); setBeneficiaryDraft({ fullName: "", nationalId: "", phone: "" }); setBeneficiaryModalOpen(false); setOpen(true); toast("ذی‌نفع ذخیره شد و برای همین چک انتخاب شد.");
    } catch (cause) { toast((cause as Error).message, "error"); }
    finally { setBeneficiaryBusy(false); }
  }
  function openTransition(item: Cheque) {
    const latestStateEvent = item.events.find((event) => event.fromStatus !== null && event.toStatus === item.status);
    setEditingCheque(item);
    setNextStatus(item.status);
    setTransitionAccountId(String(item.accountingAccountId ?? ""));
    setAssignedAccountId(String(item.status === "assigned" ? latestStateEvent?.accountingAccountId ?? "" : ""));
    setTransitionNote("");
  }
  async function transition() {
    if (!editingCheque || !nextStatus) return;
    const requiresInitialAccount = !editingCheque.accountingDocumentId;
    const requiresAssignedAccount = nextStatus === "assigned";
    if (requiresInitialAccount && !transitionAccountId) return toast("کد حساب سند پایه را انتخاب کنید.", "error");
    if (requiresAssignedAccount && !assignedAccountId) return toast("کد حساب مقصد واگذاری را انتخاب کنید.", "error");
    setTransitionBusy(true);
    try { await api("/api/cheques", { method: "PATCH", body: { id: editingCheque.id, status: nextStatus, requestKey: crypto.randomUUID(), note: transitionNote, ...(requiresInitialAccount ? { accountingAccountId: Number(transitionAccountId) } : {}), ...(requiresAssignedAccount ? { statusAccountId: Number(assignedAccountId) } : {}) } }); setEditingCheque(null); await records.reload(true); setCalendarVersion((version) => version + 1); toast("وضعیت و سند حسابداری چک به‌روزرسانی شد."); }
    catch (cause) { toast((cause as Error).message, "error"); }
    finally { setTransitionBusy(false); }
  }
  const settledStatuses = ["passed", "returned", "assigned", "voided"];
  const overdue = (item: Cheque) => now > 0 && new Date(item.dueDate).getTime() < now && !settledStatuses.includes(item.status);
  const summary = (direction: string) => records.items.filter((item) => item.direction === direction && !settledStatuses.includes(item.status)).reduce((sum, item) => sum + item.amount, 0);
  const today = toJ(new Date());
  const todayKey = dayKey(today.jy, today.jm, today.jd);
  const daysInMonth = jMonthLength(viewMonth.year, viewMonth.month);
  const leadingDays = (fromJ(viewMonth.year, viewMonth.month, 1).getUTCDay() + 1) % 7;
  const calendarDays = Array.from({ length: Math.ceil((leadingDays + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - leadingDays + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const dailyTotals = useMemo(() => {
    const totals = new Map<string, DayTotals>();
    for (const item of calendarItems) {
      if (item.status === "voided") continue;
      const { jy, jm, jd } = toJ(item.dueDate);
      if (jy !== viewMonth.year || jm !== viewMonth.month) continue;
      const key = dayKey(jy, jm, jd);
      const day = totals.get(key) ?? { payable: 0, receivable: 0, count: 0 };
      day[item.direction === "receivable" ? "receivable" : "payable"] += item.amount;
      day.count += 1;
      totals.set(key, day);
    }
    return totals;
  }, [calendarItems, viewMonth]);
  const visibleChecks = selectedDay ? calendarItems.filter((item) => chequeDayKey(item.dueDate) === selectedDay) : records.items;
  const selectedParts = selectedDay?.split("-").map(Number);
  const selectedTitle = selectedParts ? `${toFa(selectedParts[2])} ${JMONTHS[selectedParts[1] - 1]} ${toFa(selectedParts[0])}` : "همه چک‌ها";
  function shiftMonth(delta: number) {
    let year = viewMonth.year;
    let month = viewMonth.month + delta;
    if (month < 1) { year -= 1; month = 12; }
    if (month > 12) { year += 1; month = 1; }
    setViewMonth({ year, month });
    setSelectedDay(null);
  }
  function goToCurrentMonth() {
    setViewMonth({ year: today.jy, month: today.jm });
    setSelectedDay(null);
  }
  const editingStateEvent = editingCheque?.events.find((event) => event.fromStatus !== null && event.toStatus === editingCheque.status);
  const transitionUnchanged = !!editingCheque && !!editingCheque.accountingDocumentId && nextStatus === editingCheque.status && (nextStatus !== "assigned" || Number(assignedAccountId) === editingStateEvent?.accountingAccountId);
  return <div className="animate-fade-in">
    <PageHeader title="دفتر چک" subtitle="ثبت چک‌های پرداختنی و دریافتنی، پیگیری سررسید و تاریخچه وضعیت" actions={<Button onClick={() => setOpen(true)}><Icon name="plus" className="size-4"/>ثبت چک</Button>}/>
    <div className="mb-5 grid gap-3 sm:grid-cols-2"><Card className="p-4"><p className="text-xs text-base-content/60">تعهدات باز پرداختنی</p><b className="mt-1 block text-xl">{formatPrice(summary("payable"))}</b></Card><Card className="p-4"><p className="text-xs text-base-content/60">مطالبات باز دریافتنی</p><b className="mt-1 block text-xl">{formatPrice(summary("receivable"))}</b></Card></div>
    <div role="note" className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-6 text-blue-950">با ثبت چک و هر تغییر وضعیت، سند دوطرفه در حسابداری ساخته می‌شود. برای دریافت/صدور چک و واگذاری آن، حساب طرف سند را انتخاب کنید؛ ثبت وضعیت به‌تنهایی پرداخت بانکی یا استعلام صیاد انجام نمی‌دهد.</div>
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-4">
        <div><p className="text-xs text-base-content/55">تقویم سررسید شمسی</p><h2 className="mt-1 text-lg font-extrabold">{JMONTHS[viewMonth.month - 1]} {toFa(viewMonth.year)}</h2></div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={goToCurrentMonth}>ماه جاری</Button>
          <Button size="sm" variant="secondary" aria-label="ماه قبل" onClick={() => shiftMonth(-1)}><Icon name="arrowRight" className="size-4"/>ماه قبل</Button>
          <Button size="sm" variant="secondary" aria-label="ماه بعد" onClick={() => shiftMonth(1)}>ماه بعد<Icon name="arrowLeft" className="size-4"/></Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pt-3 text-xs text-base-content/65">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-blue-500"/>دریافتی</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-amber-500"/>پرداختی</span>
        <span className="text-[11px]">مبالغ به تومان است؛ جمع بر اساس سررسید و بدون چک لغوشده محاسبه می‌شود.</span>
      </div>
      {calendarLoading && <p className="px-4 py-3 text-xs text-base-content/55">در حال دریافت سررسیدهای این ماه…</p>}
      {calendarError && <div className="p-3"><ErrorState message={calendarError} onRetry={() => setCalendarVersion((version) => version + 1)}/></div>}
      <div className="grid grid-cols-7 gap-px bg-base-300 p-px text-center">
        {weekdays.map((day) => <div key={day} className="bg-base-200 px-0.5 py-2 text-[10px] font-bold text-base-content/65 sm:text-xs">{day}</div>)}
        {calendarDays.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} aria-hidden="true" className="min-h-[72px] bg-base-100 sm:min-h-[94px]"/>;
          const key = dayKey(viewMonth.year, viewMonth.month, day);
          const totals = dailyTotals.get(key);
          const selected = selectedDay === key;
          const isToday = todayKey === key;
          const aria = `${toFa(day)} ${JMONTHS[viewMonth.month - 1]}، ${toFa(totals?.receivable ?? 0)} دریافتی، ${toFa(totals?.payable ?? 0)} پرداختی`;
          return <button key={key} type="button" aria-label={aria} aria-pressed={selected} title={aria} disabled={calendarLoading || !!calendarError} onClick={() => setSelectedDay((current) => current === key ? null : key)} className={cn("min-h-[72px] min-w-0 bg-base-100 p-1 text-start transition hover:bg-primary/5 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait sm:min-h-[94px] sm:p-2", selected && "bg-primary/10 ring-2 ring-inset ring-primary", isToday && !selected && "bg-blue-50")}>
            <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs font-bold sm:size-7 sm:text-sm", isToday && "bg-primary text-primary-content", selected && "ring-1 ring-primary")}>{toFa(day)}</span>
            {!!totals && <div className="mt-1 space-y-0.5 text-[8px] leading-tight sm:text-[10px]">
              {totals.receivable > 0 && <span className="block truncate text-blue-700">{formatCompact(totals.receivable)}</span>}
              {totals.payable > 0 && <span className="block truncate text-amber-700">{formatCompact(totals.payable)}</span>}
              <span className="block text-base-content/45">{toFa(totals.count)} چک</span>
            </div>}
          </button>;
        })}
      </div>
      {selectedDay && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 px-4 py-3 text-sm">
        <span><b>{selectedTitle}</b> · دریافتی: <b className="text-blue-700">{formatPrice(dailyTotals.get(selectedDay)?.receivable ?? 0)}</b> · پرداختی: <b className="text-amber-700">{formatPrice(dailyTotals.get(selectedDay)?.payable ?? 0)}</b></span>
        <Button size="sm" variant="ghost" onClick={() => setSelectedDay(null)}>نمایش همه چک‌ها</Button>
      </div>}
    </Card>
    {records.loading ? <Skeleton className="h-72 rounded-2xl"/> : records.error ? <ErrorState message={records.error} onRetry={() => records.reload()}/> : <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-extrabold">{selectedDay ? `چک‌های ${selectedTitle}` : "همه چک‌ها"}</h2><p className="mt-1 text-xs text-base-content/55">{toFa(visibleChecks.length)} مورد</p></div>{selectedDay && <Button size="sm" variant="ghost" onClick={() => setSelectedDay(null)}>حذف فیلتر روز</Button>}</div>
      {visibleChecks.length === 0 ? <EmptyState emoji="" title={selectedDay ? "چکی برای این روز ثبت نشده است" : "چکی ثبت نشده است"} description={selectedDay ? "برای این تاریخ سررسیدی در دفتر چک وجود ندارد." : "چک‌های دریافتنی یا پرداختنی را برای پیگیری سررسید در دفتر داخلی وارد کنید."}/> : <div className="grid gap-3 lg:grid-cols-2">{visibleChecks.map((item) => <Card key={item.id} className="overflow-hidden"><article className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{item.partnerName || `چک #${toFa(item.id)}`}</h3><Badge color={item.direction === "payable" ? "amber" : "blue"}>{labels[item.direction]}</Badge><Badge color={item.status === "passed" ? "emerald" : item.status === "voided" ? "stone" : ["bounced", "returned"].includes(item.status) ? "rose" : overdue(item) ? "rose" : "blue"}>{labels[item.status]}</Badge>{overdue(item) && <Badge color="rose">سررسید گذشته</Badge>}</div><p className="mt-2 text-sm text-base-content/65">سررسید {formatDate(item.dueDate)} · {item.bank || "بانک نامشخص"}</p><p className="mt-1 text-xs text-base-content/55">شناسه ثبت‌شده: {item.sayadIdentifier || "—"} · کد حساب: {accounts.find((account) => account.id === item.accountingAccountId)?.code ?? "—"} · سند پایه: {item.accountingDocumentId ? `#${toFa(item.accountingDocumentId)}` : "نیازمند تکمیل"}</p></div><b className="text-lg">{formatPrice(item.amount)}</b></div>{item.note && <p className="mt-3 text-sm text-base-content/70">{item.note}</p>}
        <div className="mt-3 space-y-2 border-t border-base-300 pt-3">{item.events.map((event) => <p key={event.id} className="text-xs text-base-content/60">{formatDate(event.createdAt)} · {event.fromStatus ? `${labels[event.fromStatus]} ← ` : "ثبت اولیه · "}{labels[event.toStatus]}{event.note && ` · ${event.note}`}{event.reversalDocumentId ? ` · برگشت سند #${toFa(event.reversalDocumentId)}` : ""}{event.accountingDocumentId ? ` · سند #${toFa(event.accountingDocumentId)}` : ""}</p>)}</div>
        <div className="mt-3 grid gap-1.5 rounded-xl bg-base-200/50 p-3 text-xs text-base-content/65 sm:grid-cols-2">
          <p>شماره چک: <b dir="ltr" className="text-base-content">{item.chequeNumber || "—"}</b> · سریال: <b dir="ltr" className="text-base-content">{item.serialNumber || "—"}</b></p>
          <p>صدور: <b className="text-base-content">{item.issueDate ? formatDate(item.issueDate) : "—"}</b> · شعبه: <b className="text-base-content">{item.branch || "—"}</b></p>
          {item.expensePurpose && <p className="sm:col-span-2">بابت: <b className="text-base-content">{item.expensePurpose}</b></p>}
          {item.beneficiaryId && <p className="sm:col-span-2">کد ملی ذی‌نفع: <b dir="ltr" className="text-base-content">{beneficiaries.find((person) => person.id === item.beneficiaryId)?.nationalId || "—"}</b> · تلفن: <b dir="ltr" className="text-base-content">{beneficiaries.find((person) => person.id === item.beneficiaryId)?.phone || "—"}</b></p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => openTransition(item)}>تغییر وضعیت</Button></div>
      </article></Card>)}</div>}
    </section>}
    <Modal open={open} onClose={() => setOpen(false)} title="ثبت چک" description="اطلاعات برگه چک، ذی‌نفع و حساب متناظر را ثبت کنید." size="lg" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button><Button loading={busy} onClick={() => void create()}>ثبت چک و سند</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="جهت چک"><Select value={direction} onChange={(event) => { setDirection(event.target.value); setAccountingAccountId(""); }}><option value="payable">پرداختنی · صادرشده</option><option value="receivable">دریافتنی · دریافت‌شده</option></Select></Field>
          <Field label="ذی‌نفع / طرف چک"><div className="flex gap-2"><Select className="min-w-0 flex-1" value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)}><option value="">انتخاب ذی‌نفع</option>{beneficiaries.map((person) => <option key={person.id} value={person.id}>{person.fullName}{person.nationalId ? ` · ${person.nationalId}` : ""}</option>)}</Select><Button type="button" variant="secondary" className="shrink-0 px-3" onClick={() => { setOpen(false); setBeneficiaryModalOpen(true); }} aria-label="ثبت ذی‌نفع جدید"><Icon name="plus" className="size-4"/><span className="hidden sm:inline">ذی‌نفع جدید</span></Button></div><span className="mt-1 block text-xs text-base-content/55">مشخصات هویتی به‌صورت دفتر مشترک همین کسب‌وکار ذخیره می‌شود.</span></Field>
        </div>
        {beneficiaryId && (() => { const person = beneficiaries.find((item) => String(item.id) === beneficiaryId); return person ? <p className="rounded-xl bg-primary/5 px-3 py-2 text-xs text-base-content/70">انتخاب‌شده: <b>{person.fullName}</b> · کد ملی {person.nationalId || "ثبت نشده"} · تلفن {person.phone || "ثبت نشده"}</p> : null; })()}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="شماره چک *"><Input dir="ltr" inputMode="numeric" value={chequeNumber} maxLength={40} onChange={(event) => setChequeNumber(event.target.value)} placeholder="شماره روی برگه" /></Field>
          <Field label="سریال چک *"><Input dir="ltr" value={serialNumber} maxLength={40} onChange={(event) => setSerialNumber(event.target.value)} placeholder="سریال دسته‌چک" /></Field>
          <Field label="تاریخ صدور *"><PersianDateInput value={issueDate} onChange={setIssueDate} required /></Field>
          <Field label="تاریخ سررسید *"><PersianDateInput value={dueDate} onChange={setDueDate} required /></Field>
          <Field label="بانک *"><Select value={bank} onChange={(event) => { setBank(event.target.value); if (event.target.value !== "سایر") setBankCustom(""); }}><option value="">انتخاب بانک</option>{IRANIAN_BANKS.map((name) => <option key={name} value={name}>{name}</option>)}<option value="سایر">سایر بانک‌ها</option></Select></Field>
          <Field label="شعبه"><Input value={branch} maxLength={100} onChange={(event) => setBranch(event.target.value)} placeholder="نام یا کد شعبه" /></Field>
          {bank === "سایر" && <Field label="نام بانک"><Input value={bankCustom} maxLength={60} onChange={(event) => setBankCustom(event.target.value)} placeholder="نام بانک را بنویسید" /></Field>}
          <Field label="شناسه صیادی (اختیاری)"><Input dir="ltr" value={sayadIdentifier} maxLength={40} onChange={(event) => setSayadIdentifier(event.target.value)} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="مبلغ چک به تومان"><AmountInput value={amount} onValueChange={setAmount} /></Field>
          <Field label="بابت / موضوع چک" hint="گزینه‌ها راهنمای ثبت حسابداری‌اند؛ می‌توانید شرح سفارشی بنویسید."><Select value={expensePurpose} onChange={(event) => setExpensePurpose(event.target.value)}><option value="">انتخاب بابت (اختیاری)</option>{CHEQUE_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}</Select></Field>
          {expensePurpose === "سایر" && <Field label="شرح بابت"><Input value={purposeCustom} maxLength={120} onChange={(event) => setPurposeCustom(event.target.value)} placeholder="شرح دلیل صدور یا دریافت چک" /></Field>}
        </div>
        <Field label="کد حساب طرف سند · الزامی"><Select value={accountingAccountId} disabled={accountsLoading || accounts.length === 0} onChange={(event) => setAccountingAccountId(event.target.value)}><option value="">{accountsLoading ? "در حال دریافت کدهای حساب…" : "انتخاب کد حساب"}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name} ({account.level === "tafsili" ? "تفصیلی" : "معین"})</option>)}</Select><span className="mt-1 block text-xs text-base-content/55">این حساب در برابر سرفصل اسناد دریافتنی یا پرداختنی ثبت می‌شود.</span></Field>
        <Field label="یادداشت (اختیاری)"><Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></Field>
      </div>
    </Modal>
    <Modal open={beneficiaryModalOpen} onClose={() => { setBeneficiaryModalOpen(false); setOpen(true); }} title="ثبت ذی‌نفع جدید" description="ذی‌نفع ذخیره‌شده برای همین چک انتخاب می‌شود." size="md" footer={<><Button variant="ghost" onClick={() => { setBeneficiaryModalOpen(false); setOpen(true); }}>انصراف</Button><Button loading={beneficiaryBusy} onClick={() => void createBeneficiary()}>ذخیره ذی‌نفع</Button></>}>
      <div className="space-y-4"><Field label="نام و نام خانوادگی *"><Input autoFocus value={beneficiaryDraft.fullName} maxLength={120} onChange={(event) => setBeneficiaryDraft({ ...beneficiaryDraft, fullName: event.target.value })} /></Field><Field label="کد ملی"><Input dir="ltr" inputMode="numeric" value={beneficiaryDraft.nationalId} maxLength={10} onChange={(event) => setBeneficiaryDraft({ ...beneficiaryDraft, nationalId: event.target.value })} placeholder="۱۰ رقم" /></Field><Field label="شماره تلفن همراه"><Input dir="ltr" inputMode="tel" value={beneficiaryDraft.phone} maxLength={14} onChange={(event) => setBeneficiaryDraft({ ...beneficiaryDraft, phone: event.target.value })} placeholder="09xxxxxxxxx" /></Field></div>
    </Modal>
    <Modal open={!!editingCheque} onClose={() => setEditingCheque(null)} title="تغییر وضعیت چک" footer={<><Button variant="ghost" onClick={() => setEditingCheque(null)}>انصراف</Button><Button loading={transitionBusy} disabled={transitionUnchanged} onClick={() => void transition()}>ثبت وضعیت و سند</Button></>}>
      <div className="space-y-4"><Field label="وضعیت جدید"><Select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>{editingCheque && chequeStatusesFor(editingCheque.direction).map((status) => <option key={status} value={status}>{labels[status]}</option>)}</Select></Field>{!!editingCheque && !editingCheque.accountingDocumentId && <Field label="کد حساب سند پایه · الزامی"><Select value={transitionAccountId} disabled={accountsLoading} onChange={(event) => setTransitionAccountId(event.target.value)}><option value="">انتخاب کد حساب پایه</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name} ({account.level === "tafsili" ? "تفصیلی" : "معین"})</option>)}</Select><span className="mt-1 block text-xs text-base-content/55">این چک قدیمی سند پایه ندارد؛ حساب متناظر با ثبت اولیه را انتخاب کنید.</span></Field>}{!!editingCheque && nextStatus === "assigned" && <Field label="کد حساب مقصد واگذاری · الزامی"><Select value={assignedAccountId} disabled={accountsLoading} onChange={(event) => setAssignedAccountId(event.target.value)}><option value="">انتخاب کد حساب مقصد</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name} ({account.level === "tafsili" ? "تفصیلی" : "معین"})</option>)}</Select><span className="mt-1 block text-xs text-base-content/55">حساب طرف واگذاری چک را انتخاب کنید؛ در چک قدیمی این حساب می‌تواند با حساب سند پایه متفاوت باشد.</span></Field>}<Field label="یادداشت تغییر"><Input value={transitionNote} maxLength={300} onChange={(event) => setTransitionNote(event.target.value)}/></Field></div>
    </Modal>
  </div>;
}
