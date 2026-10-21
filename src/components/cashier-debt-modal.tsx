"use client";
import { useState } from "react";
import { Button, Field, Input, Modal, PersianDateInput, cn } from "@/components/ui";
import { formatPrice, toFa } from "@/lib/format";
import { parseCashierDebt, type CashierDebtInput } from "@/lib/cashier-debt-input";

export function CashierDebtModal({ total, items, name = "", phone = "", createdAt, onClose, onSubmit, busy = false }: {
  total: number; items: { name: string; quantity: number; amount: number }[]; name?: string; phone?: string; createdAt?: string;
  onClose: () => void; onSubmit: (data: CashierDebtInput) => Promise<void>; busy?: boolean;
}) {
  const [form, setForm] = useState<CashierDebtInput>({ name, phone, type: "person", companyName: "", dueAt: null, description: "" });
  const [dateMode, setDateMode] = useState(0);
  const [error, setError] = useState("");
  function due(days: number) {
    setDateMode(days);
    const date = new Date(); date.setDate(date.getDate() + days);
    setForm({ ...form, dueAt: days > 0 ? date.toISOString() : null });
  }
  async function save() {
    setError("");
    try { await onSubmit(parseCashierDebt(form)); } catch (e) { setError((e as Error).message); }
  }
  return <Modal open onClose={() => { if (!busy) onClose(); }} title="ثبت در لیست بدهکاران (بعداً پرداخت)" size="lg" footer={<div className="flex gap-2"><Button className="min-w-0 flex-1 bg-amber-600 text-white hover:bg-amber-700" loading={busy} onClick={save}>ثبت بدهی · {formatPrice(total)}</Button><Button variant="secondary" disabled={busy} onClick={onClose}>انصراف</Button></div>}>
    <div className="space-y-4" dir="rtl">
      <p className="text-xs text-stone-500">نام و شماره موبایل مشتری را وارد کنید تا این فیش به نام او ثبت شود.</p>
      <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
        <div className="flex flex-wrap justify-between gap-2 border-b border-blue-100 pb-2 text-xs"><b>{toFa(items.length)} قلم سفارش</b>{createdAt && <span>{new Date(createdAt).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })}</span>}<b className="text-amber-800">مبلغ بدهی: {formatPrice(total)}</b></div>
        <div className="mt-2 max-h-28 space-y-2 overflow-y-auto">{items.map((item, index) => <div key={index} className="flex justify-between gap-2 text-xs"><span>{toFa(item.quantity)} × {item.name}</span><b className="shrink-0">{formatPrice(item.amount)}</b></div>)}</div>
      </section>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">{([['person','مشتری شخصی'],['company','حساب شرکتی / گروه']] as const).map(([type,label]) => <button key={type} type="button" aria-pressed={form.type === type} onClick={() => setForm({ ...form, type })} className={cn("min-h-10 rounded-lg text-xs font-bold", form.type === type && "bg-white text-primary shadow-sm")}>{label}</button>)}</div>
      {form.type === "company" && <Field label="نام شرکت یا گروه *"><Input value={form.companyName} maxLength={120} onChange={e => setForm({ ...form, companyName: e.target.value })} /></Field>}
      <div className="grid gap-3 sm:grid-cols-2"><Field label={form.type === "person" ? "نام مشتری *" : "نام مسئول حساب *"}><Input value={form.name} maxLength={80} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثلاً علی رضایی" /></Field><Field label="شماره موبایل *"><Input value={form.phone} maxLength={16} inputMode="tel" dir="ltr" onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="09123456789" /></Field></div>
      <div className="space-y-2 border-t pt-3"><p className="text-xs font-bold">کی پرداخت می‌کند؟ (اختیاری)</p><div className="flex flex-wrap gap-1">{[[0,"بدون سررسید"],[1,"فردا"],[3,"۳ روز دیگر"],[7,"۱ هفته دیگر"],[-1,"انتخاب تاریخ…"]].map(([days,label]) => <button key={days} type="button" aria-pressed={dateMode === days} onClick={() => due(Number(days))} className={cn("min-h-9 rounded-lg border px-2 text-xs",dateMode === days ? "bg-primary text-white" : "bg-white")}>{label}</button>)}</div>{dateMode === -1 && <PersianDateInput value={form.dueAt ?? ""} onChange={dueAt => setForm({ ...form, dueAt })} />}</div>
      <Field label="توضیح کوتاه (اختیاری)"><Input value={form.description} maxLength={500} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="مثلاً: آخر هفته تسویه می‌کند" /></Field>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  </Modal>;
}
