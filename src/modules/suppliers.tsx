"use client";

import { useState } from "react";
import { api, useCollection } from "@/lib/api";
import { useFeatures } from "@/components/features";
import { JalaliInput } from "@/components/jalali-input";
import { formatNumber, formatPrice, toFa } from "@/lib/format";
import { fmtJ } from "@/lib/jalali";
import { AmountInput, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, PageHeader, Select, Skeleton, Textarea, cn, useToast , EmojiIcon, IconText} from "@/components/ui";

export type Supplier = { id: number; name: string; contactPerson: string; phone: string; address: string; taxId: string; bankInfo: string; note: string; isActive: boolean; purchased: number; paid: number; balance: number };
type Line = { id: number; docId: number; number: number; date: string; description: string; debit: number; credit: number; balance: number };
const blank = { name: "", contactPerson: "", phone: "", address: "", taxId: "", bankInfo: "", note: "" };
const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "");

export default function Suppliers() {
  const col = useCollection<Supplier>("/api/r/suppliers");
  const f = useFeatures();
  const toast = useToast();
  const [edit, setEdit] = useState<Supplier | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [stmt, setStmt] = useState<{ s: Supplier; lines: Line[] } | null>(null);
  const [pay, setPay] = useState<Supplier | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", from: "cash", date: new Date().toISOString(), note: "" });
  const [del, setDel] = useState<Supplier | null>(null);
  const [q, setQ] = useState("");
  const [onlyDebt, setOnlyDebt] = useState(false);
  const canPay = f.has("accounting") && (f.role === "owner" || f.role === "manager" || f.role === "accountant");
  const fail = (e: unknown) => toast((e as Error).message, "error");

  const rows = col.items.filter((s) => (!onlyDebt || s.balance > 0) && (!q.trim() || s.name.includes(q.trim()) || s.phone.includes(q.trim())));
  const totalDebt = col.items.reduce((t, s) => t + Math.max(0, s.balance), 0);

  function open(s: Supplier | "new") { setForm(s === "new" ? blank : { name: s.name, contactPerson: s.contactPerson, phone: s.phone, address: s.address, taxId: s.taxId, bankInfo: s.bankInfo, note: s.note }); setEdit(s); }
  async function save() {
    if (!form.name.trim()) return toast("نام تأمین‌کننده را وارد کنید", "error");
    const t = edit; setEdit(null);
    try {
      if (t === "new") { await col.create(form, { ...form, isActive: true, purchased: 0, paid: 0, balance: 0 } as never); toast("تأمین‌کننده ثبت شد"); }
      else if (t) { await col.update(t.id, form); toast("ذخیره شد"); }
    } catch (e) { fail(e); }
  }
  async function openStmt(s: Supplier) {
    try { const r = await api<{ supplier: Supplier; lines: Line[] }>(`/api/r/suppliers/${s.id}`); setStmt({ s: r.supplier, lines: r.lines }); } catch (e) { fail(e); }
  }
  async function doPay() {
    if (!pay) return;
    try {
      const r = await api<{ item: { number: number } }>("/api/r/supplierpay", { method: "POST", body: { supplierId: pay.id, amount: Number(faToEn(payForm.amount)), from: payForm.from, date: payForm.date, note: payForm.note } });
      toast(`پرداخت ثبت شد (سند ${toFa(r.item.number)})`);
      setPay(null); col.reload(true);
    } catch (e) { fail(e); }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="تأمین‌کنندگان و بدهی‌ها" subtitle="اطلاعات فروشنده، خریدهای نسیه و مانده‌ی بدهی هر نفر؛ هر خرید نسیه خودکار سند حسابداری صادر می‌کند" actions={<><Button variant="secondary" onClick={() => window.print()}><IconText>{<EmojiIcon emoji="" />}</IconText> چاپ گزارش بدهی</Button><Button onClick={() => open("new")}><Icon name="plus" className="size-4" /> تأمین‌کننده جدید</Button></>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-stone-500">مجموع بدهی به تأمین‌کنندگان</p><p className={cn("mt-1 text-xl font-extrabold", totalDebt ? "text-rose-600" : "text-emerald-600")}>{formatPrice(totalDebt)}</p></Card>
        <Card className="p-4"><p className="text-xs text-stone-500">تعداد تأمین‌کنندگان</p><p className="mt-1 text-xl font-extrabold">{toFa(col.items.length)}</p></Card>
        <Card className="p-4"><p className="text-xs text-stone-500">دارای بدهی</p><p className="mt-1 text-xl font-extrabold">{toFa(col.items.filter((s) => s.balance > 0).length)}</p></Card>
      </div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64"><Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><Input className="ps-9" placeholder="جستجوی نام یا تلفن…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={onlyDebt} onChange={(e) => setOnlyDebt(e.target.checked)} /> فقط دارای بدهی</label>
      </div>
      <IconText>{col.loading ? <Skeleton className="h-64 rounded-2xl" /> : col.error ? <ErrorState message={col.error} onRetry={() => col.reload()} /> : rows.length === 0 ? (
        <EmptyState emoji="" title={col.items.length ? "موردی پیدا نشد" : "هنوز تأمین‌کننده‌ای ثبت نشده"} description="هنگام ثبت «خرید نسیه» در گردش انبار هم می‌توانید فروشنده را ثبت کنید." action={!col.items.length && <Button onClick={() => open("new")}>ثبت اولین تأمین‌کننده</Button>} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b bg-stone-50/70 text-xs text-stone-500"><th className="p-3 text-start">تأمین‌کننده</th><th className="p-3 text-start">تلفن</th><th className="p-3 text-end">خرید نسیه</th><th className="p-3 text-end">پرداخت‌شده</th><th className="p-3 text-end">مانده بدهی</th><th className="no-print p-3" /></tr></thead>
            <tbody className="divide-y divide-stone-100">{rows.map((s) => (
              <tr key={s.id} className={cn("hover:bg-stone-50/60", s.id < 0 && "opacity-60", !s.isActive && "opacity-50")}>
                <td className="p-3"><button className="text-start font-bold hover:text-brand-600" onClick={() => openStmt(s)}>{s.name}</button>{s.contactPerson && <p className="text-xs text-stone-400">{s.contactPerson}</p>}</td>
                <td className="p-3 text-xs" dir="ltr" style={{ textAlign: "start" }}>{s.phone || "—"}</td>
                <td className="p-3 text-end tabular-nums">{formatNumber(s.purchased)}</td>
                <td className="p-3 text-end tabular-nums text-emerald-700">{formatNumber(s.paid)}</td>
                <td className="p-3 text-end"><b className={cn("tabular-nums", s.balance > 0 ? "text-rose-600" : "text-stone-400")}>{formatNumber(s.balance)}</b>{s.balance < 0 && <Badge color="blue" className="ms-1">بستانکار</Badge>}</td>
                <td className="no-print p-2"><div className="flex justify-end gap-1">
                  <Button size="sm" variant="secondary" onClick={() => openStmt(s)}>صورت‌حساب</Button>
                  {canPay && s.balance > 0 && <Button size="sm" onClick={() => { setPay(s); setPayForm({ amount: String(s.balance), from: "cash", date: new Date().toISOString(), note: "" }); }}>{<EmojiIcon emoji="" />} پرداخت</Button>}
                  <IconButton icon="edit" label="ویرایش" onClick={() => open(s)} />
                  <IconButton icon="trash" label="حذف" className="hover:text-rose-600" onClick={() => setDel(s)} />
                </div></td>
              </tr>
            ))}</tbody>
            <tfoot><tr className="border-t bg-stone-50 font-extrabold"><td colSpan={4} className="p-3">جمع کل بدهی</td><td className="p-3 text-end">{formatNumber(totalDebt)}</td><td /></tr></tfoot>
          </table>
        </Card>
      )}</IconText>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "تأمین‌کننده جدید" : "ویرایش تأمین‌کننده"} size="lg" footer={<><Button variant="ghost" onClick={() => setEdit(null)}>انصراف</Button><Button onClick={save}>ذخیره</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام فروشنده / شرکت *"><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="شخص رابط"><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></Field>
          <Field label="تلفن / موبایل"><Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="کد ملی / شناسه ملی / کد اقتصادی"><Input dir="ltr" className="text-left" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></Field>
          <Field label="شماره شبا / کارت" className="sm:col-span-2"><Input dir="ltr" className="text-left" value={form.bankInfo} onChange={(e) => setForm({ ...form, bankInfo: e.target.value })} placeholder="IR…" /></Field>
          <Field label="آدرس" className="sm:col-span-2"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="یادداشت" className="sm:col-span-2"><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal open={!!stmt} onClose={() => setStmt(null)} title={stmt ? `صورت‌حساب: ${stmt.s.name}` : ""} size="lg" footer={stmt && <><IconText>{canPay && stmt.s.balance > 0 && <Button onClick={() => { setPay(stmt.s); setPayForm({ amount: String(stmt.s.balance), from: "cash", date: new Date().toISOString(), note: "" }); setStmt(null); }}>{<EmojiIcon emoji="" />} پرداخت بدهی</Button>}</IconText><Button variant="secondary" onClick={() => window.print()}><IconText>{<EmojiIcon emoji="" />}</IconText> چاپ</Button></>}>
        <IconText>{stmt && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 rounded-xl bg-stone-50 p-3 text-sm"><span>خرید نسیه: <b>{formatNumber(stmt.s.purchased)}</b></span><span>پرداخت‌شده: <b className="text-emerald-700">{formatNumber(stmt.s.paid)}</b></span><span>مانده بدهی: <b className="text-rose-600">{formatNumber(stmt.s.balance)}</b></span>{stmt.s.phone && <span dir="ltr">{<EmojiIcon emoji="" />} {stmt.s.phone}</span>}</div>
            {stmt.lines.length === 0 ? <p className="py-8 text-center text-sm text-stone-400">هنوز گردشی ثبت نشده</p> : (
              <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200"><table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-stone-50 text-xs text-stone-500"><th className="p-2.5 text-start">تاریخ</th><th className="p-2.5 text-start">سند</th><th className="p-2.5 text-start">شرح</th><th className="p-2.5 text-end">پرداخت (بد)</th><th className="p-2.5 text-end">خرید (بس)</th><th className="p-2.5 text-end">مانده</th></tr></thead>
                <tbody className="divide-y divide-stone-100">{stmt.lines.map((l) => <tr key={l.id}><td className="whitespace-nowrap p-2.5 text-xs">{fmtJ(l.date)}</td><td className="p-2.5"><a className="font-bold text-brand-600" href={`/print/doc/${l.docId}`} target="_blank">{toFa(l.number)}</a></td><td className="max-w-64 truncate p-2.5 text-xs text-stone-600" title={l.description}>{l.description}</td><td className="p-2.5 text-end tabular-nums">{l.debit ? formatNumber(l.debit) : "—"}</td><td className="p-2.5 text-end tabular-nums">{l.credit ? formatNumber(l.credit) : "—"}</td><td className="p-2.5 text-end font-bold tabular-nums">{formatNumber(l.balance)}</td></tr>)}</tbody></table></div>
            )}
          </div>
        )}</IconText>
      </Modal>

      <Modal open={!!pay} onClose={() => setPay(null)} title={pay ? `پرداخت بدهی به ${pay.name}` : ""} size="sm" footer={<><Button variant="ghost" onClick={() => setPay(null)}>انصراف</Button><Button onClick={doPay} disabled={!payForm.amount}>ثبت پرداخت و صدور سند</Button></>}>
        {pay && <div className="space-y-4">
          <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">مانده بدهی فعلی: <b>{formatPrice(pay.balance)}</b></p>
          <Field label="مبلغ پرداخت (تومان)"><AmountInput value={payForm.amount} onValueChange={(amount) => setPayForm({ ...payForm, amount })} /></Field>
          <Field label="پرداخت از"><Select value={payForm.from} onChange={(e) => setPayForm({ ...payForm, from: e.target.value })}><option value="cash">صندوق (نقدی)</option><option value="bank">بانک</option></Select></Field>
          <Field label="تاریخ پرداخت (شمسی)"><JalaliInput value={payForm.date} onChange={(v) => v && setPayForm({ ...payForm, date: v })} /></Field>
          <Field label="توضیح"><Input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} placeholder="شماره چک / فیش…" /></Field>
        </div>}
      </Modal>
      <ConfirmDialog open={!!del} title="حذف تأمین‌کننده" message={`«${del?.name}» حذف می‌شود (فقط اگر گردشی نداشته باشد).`} onClose={() => setDel(null)} onConfirm={() => del && col.remove(del.id).then(() => toast("حذف شد")).catch(fail)} />
    </div>
  );
}
