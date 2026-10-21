"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatPrice, formatNumber } from "@/lib/format";
import { Badge, Button, Card, Field, Icon, Input, Modal, PageHeader, PersianDateInput, Select, Textarea } from "@/components/ui";

type Account = { id: number; name: string; type: string; phone: string; customerId: number | null };
type Debt = {
  id: number; accountId: number; accountName: string; accountType: string; phone: string;
  orderId: number | null; orderNumber: number | null; source: string; amount: number; received: number;
  balance: number; status: string; dueAt: string | null; description: string; createdAt: string;
};
type Order = { id: number; number: number; customerId: number | null; customerName: string; customerPhone: string; total: number; createdAt: string };
type Bank = { id: number; name: string; bank: string };
type Statement = { item: Debt; payments: { id: number; amount: number; method: string; note: string; createdAt: string; accountingDocumentId: number | null }[]; reversals: { id: number; paymentId: number; amount: number; reason: string; createdAt: string }[] };

const stateLabels: Record<string, string> = { open: "باز", partial: "بخشی پرداخت‌شده", overdue: "سررسید گذشته", settled: "تسویه‌شده" };
const methodLabels: Record<string, string> = { cash: "نقدی", bank: "واریز بانکی", pos: "کارت‌خوان", transfer: "انتقال بانکی" };

export default function Receivables() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [debtOpen, setDebtOpen] = useState(false);
  const [paymentFor, setPaymentFor] = useState<Debt | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [reversalTarget, setReversalTarget] = useState<{ paymentId: number; amount: number } | null>(null);
  const [reversalAmount, setReversalAmount] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("person");
  const [accountPhone, setAccountPhone] = useState("");
  const [debtAccountId, setDebtAccountId] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtDueAt, setDebtDueAt] = useState("");
  const [debtDescription, setDebtDescription] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payBank, setPayBank] = useState("");
  const [payNote, setPayNote] = useState("");
  const [orderId, setOrderId] = useState("");
  const [search, setSearch] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    const filters = new URLSearchParams();
    if (filterFrom) filters.set("from", filterFrom);
    if (filterTo) filters.set("to", filterTo);
    const query = filters.size ? `?${filters.toString()}` : "";
    const [accountData, debtData, orderData, bankData] = await Promise.all([
      api<{ items: Account[] }>("/api/receivables/accounts"),
      api<{ items: Debt[] }>(`/api/receivables${query}`),
      api<{ items: Order[] }>("/api/receivables/orders"),
      api<{ items: Bank[] }>("/api/r/bank"),
    ]);
    setAccounts(accountData.items);
    setDebts(debtData.items);
    setOrders(orderData.items);
    setBanks(bankData.items);
  }, [filterFrom, filterTo]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh().catch((e) => setError(e instanceof ApiError ? e.message : "دریافت اطلاعات مطالبات ناموفق بود"))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const visibleDebts = useMemo(() => debts.filter((debt) =>
    `${debt.accountName} ${debt.phone} ${debt.orderNumber ?? ""} ${debt.description}`.toLowerCase().includes(search.trim().toLowerCase())), [debts, search]);
  const totalBalance = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const overdueCount = debts.filter((debt) => debt.status === "overdue").length;

  async function submitAccount(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/receivables/accounts", { method: "POST", body: { name: accountName, type: accountType, phone: accountPhone } });
      setAccountOpen(false); setAccountName(""); setAccountPhone(""); await refresh();
    } catch (e) { setError(e instanceof ApiError ? e.message : "ثبت حساب بدهکار انجام نشد"); }
    finally { setBusy(false); }
  }

  async function submitDebt(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/receivables", { method: "POST", body: {
        accountId: Number(debtAccountId), amount: Number(debtAmount), dueAt: debtDueAt || null, description: debtDescription,
      } });
      setDebtOpen(false); setDebtAmount(""); setDebtDueAt(""); setDebtDescription(""); await refresh();
    } catch (e) { setError(e instanceof ApiError ? e.message : "ثبت طلب انجام نشد"); }
    finally { setBusy(false); }
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault(); if (!paymentFor) return;
    setBusy(true); setError("");
    try {
      await api(`/api/receivables/${paymentFor.id}/payments`, { method: "POST", body: {
        amount: Number(payAmount), method: payMethod, bankAccountId: payMethod === "cash" ? null : Number(payBank),
        idempotencyKey: crypto.randomUUID(), note: payNote,
      } });
      setPaymentFor(null); setPayAmount(""); setPayNote(""); await refresh();
    } catch (e) { setError(e instanceof ApiError ? e.message : "ثبت دریافت انجام نشد"); }
    finally { setBusy(false); }
  }

  async function registerOrderCredit() {
    if (!orderId) return;
    setBusy(true); setError("");
    try {
      await api(`/api/receivables/orders/${orderId}`, { method: "POST", body: {} });
      setOrderId(""); await refresh();
    } catch (e) { setError(e instanceof ApiError ? e.message : "ثبت سفارش نسیه انجام نشد"); }
    finally { setBusy(false); }
  }

  async function showStatement(id: number) {
    setError("");
    try { setStatement(await api<Statement>(`/api/receivables/${id}`)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "دریافت صورت‌حساب انجام نشد"); }
  }

  async function submitReversal(event: FormEvent) {
    event.preventDefault();
    if (!statement || !reversalTarget) return;
    setBusy(true); setError("");
    try {
      await api(`/api/receivables/${statement.item.id}/payments/${reversalTarget.paymentId}/reverse`, { method: "POST", body: {
        amount: Number(reversalAmount), reason: reversalReason, idempotencyKey: crypto.randomUUID(),
      } });
      setReversalTarget(null); setReversalReason(""); setReversalAmount("");
      await Promise.all([refresh(), showStatement(statement.item.id)]);
    } catch (e) { setError(e instanceof ApiError ? e.message : "برگشت دریافت انجام نشد"); }
    finally { setBusy(false); }
  }

  return <div className="animate-fade-in space-y-5">
    <PageHeader title="مطالبات و دریافتنی‌ها" subtitle="ثبت بدهی مشتری و وصول مرحله‌ای؛ هر ثبت مالی با سند دوطرفه همراه است"
      actions={<><Button variant="secondary" onClick={() => setAccountOpen(true)}><Icon name="plus" className="size-4" /> حساب بدهکار</Button><Button onClick={() => setDebtOpen(true)} disabled={!accounts.length}><Icon name="plus" className="size-4" /> ثبت طلب</Button></>} />

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-3">
      <Card className="p-4"><p className="text-xs text-base-content/60">مانده مطالبات</p><p className="mt-2 text-xl font-extrabold">{formatPrice(totalBalance)}</p></Card>
      <Card className="p-4"><p className="text-xs text-base-content/60">حساب‌های بدهکار</p><p className="mt-2 text-xl font-extrabold">{formatNumber(accounts.length)}</p></Card>
      <Card className="p-4"><p className="text-xs text-base-content/60">مطالبات سررسیدگذشته</p><p className="mt-2 text-xl font-extrabold text-rose-600">{formatNumber(overdueCount)}</p></Card>
    </div>

    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-bold">سفارش‌های تحویل‌شده و تسویه‌نشده</h2><p className="mt-1 text-xs text-base-content/55">فقط سفارش متصل به مشتری ثبت‌شده قابلیت انتقال به دفتر مطالبات دارد.</p></div>
        <div className="flex w-full gap-2 sm:max-w-xl">
          <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="min-w-0 flex-1">
            <option value="">انتخاب سفارش</option>{orders.map((order) => <option key={order.id} value={order.id}>#{formatNumber(order.number)} · {order.customerName || "مشتری"} · {formatPrice(order.total)}</option>)}
          </Select>
          <Button size="sm" onClick={registerOrderCredit} disabled={!orderId || busy}>ثبت نسیه</Button>
        </div>
      </div>
      {!orders.length && <p className="rounded-lg bg-base-200/60 p-3 text-sm text-base-content/60">سفارش واجد شرایطی وجود ندارد.</p>}
    </Card>

    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-base-300 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-bold">دفتر مطالبات</h2><p className="mt-1 text-xs text-base-content/55">نمایش حداکثر ۵۰۰ طلب اخیر؛ برای مشاهده گردش هر ردیف صورت‌حساب را باز کنید.</p></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_auto_auto_auto]">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی بدهکار، سفارش یا شرح" />
          <PersianDateInput value={filterFrom} onChange={setFilterFrom} placeholder="از تاریخ شمسی" />
          <PersianDateInput value={filterTo} onChange={setFilterTo} placeholder="تا تاریخ شمسی" />
          <Button size="sm" variant="secondary" onClick={() => window.location.assign(`/api/receivables/export${filterFrom || filterTo ? `?${new URLSearchParams({ ...(filterFrom ? { from: filterFrom } : {}), ...(filterTo ? { to: filterTo } : {}) })}` : ""}`)}><Icon name="download" className="size-4" /> CSV</Button>
        </div>
      </div>
      {loading ? <div className="p-8 text-center text-sm text-base-content/55">در حال بارگذاری…</div> : visibleDebts.length === 0 ?
        <div className="p-10 text-center text-sm text-base-content/55">هنوز طلبی ثبت نشده است.</div> : <>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[950px] text-sm"><thead className="bg-base-200/60 text-xs text-base-content/60"><tr>{["بدهکار / سفارش", "مبلغ طلب", "دریافت‌شده", "مانده", "سررسید", "وضعیت", "عملیات"].map((x) => <th key={x} className="p-3 text-start">{x}</th>)}</tr></thead>
            <tbody className="divide-y divide-base-300">{visibleDebts.map((debt) => <tr key={debt.id}>
              <td className="p-3"><button className="text-start font-semibold hover:text-primary" onClick={() => showStatement(debt.id)}>{debt.accountName}</button><span className="mt-1 block text-xs text-base-content/50">{debt.orderNumber ? `سفارش #${formatNumber(debt.orderNumber)}` : debt.description || "طلب دستی"}</span></td>
              <td className="whitespace-nowrap p-3">{formatPrice(Number(debt.amount))}</td><td className="whitespace-nowrap p-3">{formatPrice(debt.received)}</td><td className="whitespace-nowrap p-3 font-bold">{formatPrice(debt.balance)}</td>
              <td className="whitespace-nowrap p-3">{debt.dueAt ? formatDate(debt.dueAt) : "—"}</td><td className="p-3"><Badge color={debt.status === "settled" ? "emerald" : debt.status === "overdue" ? "rose" : debt.status === "partial" ? "blue" : "amber"}>{stateLabels[debt.status]}</Badge></td>
              <td className="p-3"><div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => showStatement(debt.id)}>صورت‌حساب</Button>{debt.balance > 0 && <Button size="sm" onClick={() => { setPaymentFor(debt); setPayAmount(String(debt.balance)); setPayMethod("cash"); }}>ثبت دریافت</Button>}</div></td>
            </tr>)}</tbody></table></div>
          <div className="divide-y divide-base-300 md:hidden">{visibleDebts.map((debt) => <article key={debt.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2"><div><button className="font-bold hover:text-primary" onClick={() => showStatement(debt.id)}>{debt.accountName}</button><p className="mt-1 text-xs text-base-content/55">{debt.orderNumber ? `سفارش #${formatNumber(debt.orderNumber)}` : debt.description || "طلب دستی"}</p></div><Badge color={debt.status === "settled" ? "emerald" : debt.status === "overdue" ? "rose" : "amber"}>{stateLabels[debt.status]}</Badge></div>
            <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-base-200/60 p-2">مبلغ: <b>{formatPrice(Number(debt.amount))}</b></div><div className="rounded-lg bg-base-200/60 p-2">مانده: <b>{formatPrice(debt.balance)}</b></div></div>
            <div className="flex gap-2">{debt.balance > 0 && <Button size="sm" onClick={() => { setPaymentFor(debt); setPayAmount(String(debt.balance)); setPayMethod("cash"); }}>ثبت دریافت</Button>}<Button size="sm" variant="secondary" onClick={() => showStatement(debt.id)}>صورت‌حساب</Button></div>
          </article>)}</div>
        </>}
    </Card>

    <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title="افزودن حساب بدهکار" footer={<><Button variant="secondary" onClick={() => setAccountOpen(false)}>انصراف</Button><Button loading={busy} form="receivable-account-form">ثبت حساب</Button></>}>
      <form id="receivable-account-form" onSubmit={submitAccount} className="space-y-4">
        <Field label="نام شخص یا شرکت"><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} required maxLength={120} /></Field>
        <Field label="نوع حساب"><Select value={accountType} onChange={(e) => setAccountType(e.target.value)}><option value="person">شخص</option><option value="company">شرکت / گروه</option></Select></Field>
        <Field label="شماره تماس (اختیاری)"><Input value={accountPhone} onChange={(e) => setAccountPhone(e.target.value)} inputMode="tel" dir="ltr" maxLength={32} /></Field>
      </form>
    </Modal>

    <Modal open={debtOpen} onClose={() => setDebtOpen(false)} title="ثبت طلب دستی" footer={<><Button variant="secondary" onClick={() => setDebtOpen(false)}>انصراف</Button><Button loading={busy} form="receivable-form">ثبت طلب</Button></>}>
      <form id="receivable-form" onSubmit={submitDebt} className="space-y-4">
        <Field label="حساب بدهکار"><Select value={debtAccountId} onChange={(e) => setDebtAccountId(e.target.value)} required><option value="">انتخاب کنید</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.phone ? ` — ${a.phone}` : ""}</option>)}</Select></Field>
        <Field label="مبلغ طلب (تومان)"><Input value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} type="number" min="1" step="1" inputMode="numeric" required /></Field>
        <Field label="تاریخ سررسید (اختیاری)"><PersianDateInput value={debtDueAt} onChange={setDebtDueAt} /></Field>
        <Field label="شرح"><Textarea value={debtDescription} onChange={(e) => setDebtDescription(e.target.value)} maxLength={500} placeholder="شرح فاکتور یا علت ایجاد طلب" /></Field>
        <p className="rounded-lg bg-blue-50 p-3 text-xs leading-6 text-blue-900">ثبت طلب، حساب دریافتنی را بدهکار و حساب درآمد متفرقه را بستانکار می‌کند؛ سند در دفتر حسابداری ذخیره می‌شود.</p>
      </form>
    </Modal>

    <Modal open={Boolean(paymentFor)} onClose={() => setPaymentFor(null)} title="ثبت دریافت از بدهکار" footer={<><Button variant="secondary" onClick={() => setPaymentFor(null)}>انصراف</Button><Button loading={busy} form="receivable-payment-form">ثبت دریافت</Button></>}>
      {paymentFor && <form id="receivable-payment-form" onSubmit={submitPayment} className="space-y-4">
        <p className="rounded-lg bg-base-200/70 p-3 text-sm">{paymentFor.accountName} · مانده {formatPrice(paymentFor.balance)}</p>
        <Field label="مبلغ دریافت (تومان)"><Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} type="number" min="1" max={paymentFor.balance} step="1" inputMode="numeric" required /></Field>
        <Field label="روش دریافت"><Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>{Object.entries(methodLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {payMethod !== "cash" && <Field label="حساب بانکی"><Select value={payBank} onChange={(e) => setPayBank(e.target.value)} required><option value="">انتخاب کنید</option>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}{bank.bank ? ` — ${bank.bank}` : ""}</option>)}</Select></Field>}
        <Field label="توضیح (اختیاری)"><Input value={payNote} onChange={(e) => setPayNote(e.target.value)} maxLength={300} /></Field>
      </form>}
    </Modal>

    <Modal open={Boolean(statement)} onClose={() => setStatement(null)} title="صورت‌حساب مطالبات" size="lg">
      {statement && <div className="space-y-4"><Card className="grid gap-3 p-4 sm:grid-cols-3"><div><p className="text-xs text-base-content/55">بدهکار</p><b>{statement.item.accountName}</b></div><div><p className="text-xs text-base-content/55">مبلغ اولیه</p><b>{formatPrice(Number(statement.item.amount))}</b></div><div><p className="text-xs text-base-content/55">مانده</p><b>{formatPrice(statement.item.balance)}</b></div></Card>
        <div className="overflow-x-auto rounded-xl border border-base-300"><table className="w-full min-w-[650px] text-sm"><thead className="bg-base-200/60 text-xs"><tr>{["تاریخ", "نوع رویداد", "روش", "مبلغ", "شرح / اصلاح"].map((x) => <th key={x} className="p-3 text-start">{x}</th>)}</tr></thead><tbody className="divide-y divide-base-300"><tr><td className="p-3">{formatDate(statement.item.createdAt)}</td><td className="p-3">ثبت طلب</td><td className="p-3">—</td><td className="p-3">{formatPrice(Number(statement.item.amount))}</td><td className="p-3">{statement.item.description || "طلب ثبت‌شده"}</td></tr>{statement.payments.map((payment) => {
          const reversed = statement.reversals.filter((item) => item.paymentId === payment.id).reduce((sum, item) => sum + Number(item.amount), 0);
          const remaining = Number(payment.amount) - reversed;
          return <tr key={payment.id}><td className="p-3">{formatDate(payment.createdAt)}</td><td className="p-3">دریافت</td><td className="p-3">{methodLabels[payment.method] ?? payment.method}</td><td className="p-3 text-emerald-700">− {formatPrice(Number(payment.amount))}</td><td className="p-3"><span>{payment.note || "—"}</span>{remaining > 0 && <Button className="ms-2" size="sm" variant="ghost" onClick={() => { setReversalTarget({ paymentId: payment.id, amount: remaining }); setReversalAmount(String(remaining)); }}>برگشت/اصلاح</Button>}</td></tr>;
        })}{statement.reversals.map((reversal) => <tr key={`reverse-${reversal.id}`}><td className="p-3">{formatDate(reversal.createdAt)}</td><td className="p-3">برگشت دریافت</td><td className="p-3">—</td><td className="p-3 text-rose-700">+ {formatPrice(Number(reversal.amount))}</td><td className="p-3">{reversal.reason}</td></tr>)}</tbody></table></div>
      </div>}
    </Modal>

    <Modal open={Boolean(reversalTarget)} onClose={() => setReversalTarget(null)} title="برگشت یا اصلاح دریافت" footer={<><Button variant="secondary" onClick={() => setReversalTarget(null)}>انصراف</Button><Button loading={busy} form="receivable-reversal-form" variant="danger">ثبت برگشت</Button></>}>
      {reversalTarget && <form id="receivable-reversal-form" onSubmit={submitReversal} className="space-y-4"><p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">ثبت برگشت یک سند معکوس و تراکنش خروجی می‌سازد؛ receipt قبلی حذف یا ویرایش نمی‌شود.</p><Field label="مبلغ برگشت"><Input value={reversalAmount} onChange={(e) => setReversalAmount(e.target.value)} type="number" min="1" max={reversalTarget.amount} step="1" required /></Field><Field label="علت (الزامی)"><Textarea value={reversalReason} onChange={(e) => setReversalReason(e.target.value)} maxLength={300} required /></Field></form>}
    </Modal>
  </div>;
}
