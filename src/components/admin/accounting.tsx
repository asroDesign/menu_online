"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCompact, formatDate, formatNumber, formatPrice, toFa } from "@/lib/format";
import { fmtJ, JMONTHS, toJ } from "@/lib/jalali";
import { JalaliInput } from "@/components/jalali-input";
import { PLANS, planName } from "@/lib/plans";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, IconButton, Input, Modal, Select, Skeleton, Textarea, cn, useToast , IconText} from "@/components/ui";
import { Bars, METHOD, PLAN_COLOR, Stat, useGet, type Me } from "@/components/admin/common";

const toEn = (s: string) => Number(s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٬,\s]/g, "")) || 0;
const INV_ST: Record<string, [string, string]> = { unpaid: ["پرداخت‌نشده", "amber"], paid: ["پرداخت شد", "emerald"], void: ["باطل", "stone"] };

export function AdminAccounting({ me, params }: { me: Me; params: Record<string, string> }) {
  const [sub, setSub] = useState<"summary" | "invoices" | "expenses" | "documents">((params.sub as any) ?? "summary");
  return (
    <div className="animate-fade-in">
      <div className="mb-5"><h1 className="text-xl font-extrabold sm:text-2xl">اشتراک‌ها و حسابداری سامانه</h1><p className="mt-1 text-sm text-stone-500">فاکتور فروش اشتراک، دریافت‌ها، هزینه‌ها و گزارش مالی (تاریخ شمسی)</p></div>
      <div className="mb-5 flex gap-2 overflow-x-auto"><IconText>{([["summary", " گزارش مالی"], ["invoices", " فاکتورهای اشتراک"], ["expenses", " هزینه‌های سامانه"], ["documents", " اسناد حسابداری"]] as const).map(([k, l]) => <button key={k} onClick={() => setSub(k)} className={cn("rounded-xl px-4 py-2.5 text-sm font-semibold", sub === k ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200")}>{l}</button>)}</IconText></div>
      {sub === "summary" && <Summary />}
      {sub === "invoices" && <Invoices params={params} />}
      {sub === "expenses" && <Expenses />}
      {sub === "documents" && <AccountingDocuments />}
      <span className="hidden">{me.id}</span>
    </div>
  );
}

function AccountingDocuments() {
  const { data, error, loading, reload } = useGet<{ items: any[] }>("/api/admin/accounting-documents");
  return <div className="space-y-4"><div><h2 className="text-lg font-extrabold">اسناد خودکار همکاری در فروش</h2><p className="mt-1 text-sm text-stone-500">سند هزینه و بدهی با ثبت پورسانت، و سند تسویه با پرداخت برداشت ثبت می‌شود.</p></div>{error ? <ErrorState message={error} onRetry={() => reload()} /> : loading && !data ? <Skeleton className="h-56 rounded-2xl" /> : !data?.items.length ? <EmptyState title="سندی ثبت نشده" description="پس از ثبت فروش پورسانتی یا تسویه برداشت، سند اینجا نمایش داده می‌شود." /> : <Card className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr className="border-b bg-base-200 text-xs text-base-content/60"><th className="p-3 text-start">تاریخ</th><th className="p-3 text-start">شرح</th><th className="p-3 text-start">بدهکار</th><th className="p-3 text-start">بستانکار</th><th className="p-3 text-end">مبلغ (تومان)</th><th className="p-3 text-start">ثبت‌کننده</th></tr></thead><tbody className="divide-y divide-base-200">{data.items.map((x) => <tr key={x.id}><td className="whitespace-nowrap p-3 text-xs">{formatDate(x.date)}</td><td className="p-3">{x.description}</td><td className="p-3"><Badge color="rose">{x.debitAccount}</Badge></td><td className="p-3"><Badge color="emerald">{x.creditAccount}</Badge></td><td className="p-3 text-end font-bold tabular-nums">{formatNumber(x.amount)}</td><td className="p-3 text-xs">{x.createdBy}</td></tr>)}</tbody></table></Card>}</div>;
}

function Summary() {
  const [year, setYear] = useState(toJ(new Date()).jy);
  const { data: d, error, reload } = useGet<any>(`/api/admin/accounting?year=${year}`);
  if (error) return <ErrorState message={error} onRetry={() => reload()} />;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2"><span className="text-sm font-semibold">سال مالی:</span><Select className="w-32" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[0, 1, 2].map((i) => { const y = toJ(new Date()).jy - i; return <option key={y} value={y}>{toFa(y)}</option>; })}</Select></div>
      <IconText>{!d ? <Skeleton className="h-80 rounded-2xl" /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon="" label="درآمد اشتراک‌ها" value={formatPrice(d.revenue)} tone="text-emerald-600" />
            <Stat icon="" label="هزینه‌های سامانه" value={formatPrice(d.expenses)} tone="text-rose-600" />
            <Stat icon="" label="سود خالص" value={formatPrice(d.net)} tone={d.net >= 0 ? "text-emerald-600" : "text-rose-600"} />
            <Stat icon="" label="مطالبات (پرداخت‌نشده)" value={formatPrice(d.unpaidTotal)} tone="text-amber-600" sub={`${toFa(d.unpaid.length)} فاکتور`} />
          </div>
          <Card className="p-5"><h3 className="mb-4 font-bold">درآمد ماهانه</h3><Bars data={d.months.map((m: any) => ({ label: JMONTHS[m.month - 1].slice(0, 3), value: m.revenue }))} fmt={formatPrice} /></Card>
          <Card className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">ماه</th><th className="p-3 text-end">فاکتور پرداخت‌شده</th><th className="p-3 text-end">درآمد</th><th className="p-3 text-end">هزینه</th><th className="p-3 text-end">سود</th></tr></thead>
            <tbody className="divide-y divide-stone-100">{d.months.map((m: any) => <tr key={m.month}><td className="p-3 font-semibold">{JMONTHS[m.month - 1]}</td><td className="p-3 text-end">{toFa(m.invoices)}</td><td className="p-3 text-end tabular-nums">{formatNumber(m.revenue)}</td><td className="p-3 text-end tabular-nums text-rose-600">{formatNumber(m.expenses)}</td><td className={cn("p-3 text-end font-bold tabular-nums", m.revenue - m.expenses >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatNumber(m.revenue - m.expenses)}</td></tr>)}</tbody>
            <tfoot><tr className="bg-stone-100 font-extrabold"><td className="p-3">جمع سال</td><td /><td className="p-3 text-end">{formatNumber(d.revenue)}</td><td className="p-3 text-end">{formatNumber(d.expenses)}</td><td className="p-3 text-end">{formatNumber(d.net)}</td></tr></tfoot></table></Card>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5"><h3 className="mb-3 font-bold">درآمد به تفکیک پلن</h3><ul className="space-y-2 text-sm">{PLANS.map((p) => <li key={p.key} className="flex justify-between"><span>{p.name} <span className="text-xs text-stone-400">({toFa(d.byPlan[p.key]?.n ?? 0)} فاکتور)</span></span><b>{formatCompact(d.byPlan[p.key]?.amount ?? 0)}</b></li>)}</ul></Card>
            <Card className="p-5"><h3 className="mb-3 font-bold">روش دریافت</h3><ul className="space-y-2 text-sm">{Object.entries(d.byMethod).length === 0 && <li className="text-stone-400">—</li>}{Object.entries(d.byMethod as Record<string, number>).map(([k, v]) => <li key={k} className="flex justify-between"><span>{METHOD[k] ?? k}</span><b>{formatCompact(v)}</b></li>)}</ul></Card>
            <Card className="p-5"><h3 className="mb-3 font-bold">هزینه‌ها به تفکیک دسته</h3><ul className="space-y-2 text-sm">{d.byCategory.length === 0 && <li className="text-stone-400">—</li>}{d.byCategory.map((c: any) => <li key={c.name} className="flex justify-between"><span>{c.name}</span><b>{formatCompact(c.amount)}</b></li>)}</ul></Card>
          </div>
          {d.unpaid.length > 0 && <Card className="overflow-hidden"><div className="border-b p-4 font-bold">مطالبات باز</div><ul className="divide-y divide-stone-100 text-sm">{d.unpaid.map((u: any) => <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><b>#{toFa(u.number)}</b><span className="min-w-40 flex-1">{u.businessName}</span><Badge color={PLAN_COLOR[u.plan]}>{planName(u.plan)}</Badge><b>{formatPrice(u.amount)}</b><span className="text-xs text-stone-400">{fmtJ(u.createdAt)}</span></li>)}</ul></Card>}
        </>
      )}</IconText>
    </div>
  );
}

function Invoices({ params }: { params: Record<string, string> }) {
  const toast = useToast();
  const [status, setStatus] = useState(params.status ?? "");
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useGet<{ items: any[] }>(`/api/admin/invoices?status=${status}&q=${encodeURIComponent(q)}`);
  const biz = useGet<{ items: any[] }>("/api/admin/businesses");
  const [create, setCreate] = useState<any>(params.create ? { businessId: params.create, plan: params.plan ?? "premium" } : null);
  const [pay, setPay] = useState<any>(null);
  const [amountEdit, setAmountEdit] = useState<any>(null);
  const [voidId, setVoidId] = useState<any>(null);
  const tenants = (biz.data?.items ?? []).filter((b) => !b.isAdmin);
  const total = (data?.items ?? []).filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  useEffect(() => { if (create && !create.amountTouched) { const p = PLANS.find((x) => x.key === create.plan); void p; } }, [create]);
  async function save() {
    try {
      await api("/api/admin/invoices", { method: "POST", body: { businessId: Number(create.businessId), plan: create.plan, months: toEn(String(create.months ?? 12)), discount: toEn(String(create.discount ?? 0)), amount: create.amount === undefined || create.amount === "" ? undefined : toEn(String(create.amount)), note: create.note, markPaid: !!create.markPaid, method: create.method ?? "transfer", refNo: create.refNo } });
      toast(create.markPaid ? "فاکتور صادر و پرداخت ثبت شد؛ اشتراک تمدید شد" : "فاکتور صادر شد"); setCreate(null); reload(true);
    } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex gap-1.5">{([["", "همه"], ["unpaid", "پرداخت‌نشده"], ["paid", "پرداخت‌شده"], ["void", "باطل"]] as const).map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={cn("rounded-xl px-3.5 py-2 text-xs font-semibold", status === k ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200")}>{l}</button>)}</div>
        <div className="relative w-56"><Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><Input className="ps-9" placeholder="نام یا شماره فاکتور…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button className="ms-auto" onClick={() => setCreate({ businessId: tenants[0]?.id ?? "", plan: "premium", months: 12, method: "transfer" })}><Icon name="plus" className="size-4" /> فاکتور جدید</Button>
      </div>
      <IconText>{error ? <ErrorState message={error} onRetry={() => reload()} /> : loading && !data ? <Skeleton className="h-64 rounded-2xl" /> : !data?.items.length ? <EmptyState emoji="" title="فاکتوری وجود ندارد" description="برای فروش یا تمدید اشتراک، فاکتور صادر کنید؛ با ثبت پرداخت، پلن و تاریخ اشتراک خودکار اعمال می‌شود." action={<Button onClick={() => setCreate({ businessId: tenants[0]?.id ?? "", plan: "premium", months: 12, method: "transfer" })}>صدور فاکتور</Button>} /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">شماره</th><th className="p-3 text-start">کسب‌وکار</th><th className="p-3 text-start">پلن</th><th className="p-3 text-start">دوره</th><th className="p-3 text-end">مبلغ</th><th className="p-3 text-start">وضعیت</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-stone-100">{data.items.map((i) => (
            <tr key={i.id} className="hover:bg-stone-50/70"><td className="p-3 font-extrabold">#{toFa(i.number)}</td><td className="p-3 font-semibold">{i.businessName}<p className="text-[11px] font-normal text-stone-400">صدور: {fmtJ(i.createdAt)} · {i.createdBy}</p></td>
              <td className="p-3"><Badge color={PLAN_COLOR[i.plan]}>{planName(i.plan)}</Badge><span className="ms-1 text-xs text-stone-500">{toFa(i.months)} ماه</span></td>
              <td className="p-3 text-xs">{i.periodStart ? `${fmtJ(i.periodStart)} تا ${fmtJ(i.periodEnd)}` : "—"}</td>
              <td className="p-3 text-end"><b>{formatNumber(i.amount)}</b>{i.discount > 0 && <p className="text-[11px] text-rose-500">تخفیف {formatNumber(i.discount)}</p>}</td>
              <td className="p-3"><Badge color={INV_ST[i.status][1]}>{INV_ST[i.status][0]}</Badge>{i.status === "paid" && <p className="mt-1 text-[11px] text-stone-500">{METHOD[i.method] ?? i.method} · {i.paidAt && fmtJ(i.paidAt)}{i.refNo && ` · ${i.refNo}`}</p>}</td>
              <td className="p-2"><div className="flex justify-end gap-1">{i.status === "unpaid" && <><Button size="sm" onClick={() => setPay({ id: i.id, number: i.number, amount: i.amount, method: "transfer", refNo: "", paidAt: new Date().toISOString() })}>ثبت پرداخت</Button><IconButton icon="edit" label="تغییر مبلغ فاکتور" onClick={() => setAmountEdit({ id: i.id, number: i.number, amount: String(i.amount), note: i.note ?? "" })} /><IconButton icon="x" label="ابطال" className="hover:text-rose-600" onClick={() => setVoidId(i)} /></>}<a href={`/print/invoice/${i.id}`} target="_blank" aria-label="چاپ"><IconButton icon="print" label="چاپ فاکتور" /></a></div></td></tr>
          ))}</tbody>
          <tfoot><tr className="border-t bg-stone-50 text-xs font-bold"><td colSpan={4} className="p-3">{toFa(data.items.length)} فاکتور</td><td className="p-3 text-end">پرداخت‌شده: {formatNumber(total)}</td><td colSpan={2} /></tr></tfoot></table></Card>
      )}</IconText>
      <Modal open={!!create} onClose={() => setCreate(null)} title="صدور فاکتور اشتراک" footer={<><Button variant="ghost" onClick={() => setCreate(null)}>انصراف</Button><Button onClick={save} disabled={!create?.businessId}>{create?.markPaid ? "صدور و ثبت پرداخت" : "صدور فاکتور"}</Button></>}>
        {create && <div className="space-y-4">
          <Field label="کسب‌وکار"><Select value={create.businessId} onChange={(e) => setCreate({ ...create, businessId: e.target.value })}><option value="">انتخاب…</option>{tenants.map((b) => <option key={b.id} value={b.id}>{b.name} — {planName(b.plan)}</option>)}</Select></Field>
          <div className="grid gap-3 sm:grid-cols-3"><Field label="پلن"><Select value={create.plan} onChange={(e) => setCreate({ ...create, plan: e.target.value })}>{PLANS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</Select></Field><Field label="دوره اشتراک"><Select value={create.months ?? 12} onChange={(e) => setCreate({ ...create, months: Number(e.target.value) })}><option value={6}>شش‌ماهه</option><option value={12}>سالانه</option></Select></Field><Field label="تخفیف اضافی (تومان)"><Input inputMode="numeric" value={create.discount ?? ""} onChange={(e) => setCreate({ ...create, discount: e.target.value })} /></Field></div>
          <Field label="مبلغ نهایی (تومان)" hint="خالی = قیمت دوره پس از تخفیف تنظیم‌شده و تخفیف اضافی"><Input inputMode="numeric" value={create.amount ?? ""} onChange={(e) => setCreate({ ...create, amount: e.target.value })} /></Field>
          <Field label="توضیح"><Input value={create.note ?? ""} onChange={(e) => setCreate({ ...create, note: e.target.value })} /></Field>
          <label className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-900"><input type="checkbox" className="accent-emerald-600" checked={!!create.markPaid} onChange={(e) => setCreate({ ...create, markPaid: e.target.checked })} /> مبلغ دریافت شده است (فوراً پلن را فعال کن)</label>
          {create.markPaid && <div className="grid gap-3 sm:grid-cols-2"><Field label="روش دریافت"><Select value={create.method ?? "transfer"} onChange={(e) => setCreate({ ...create, method: e.target.value })}>{Object.entries(METHOD).filter(([k]) => k !== "other").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field><Field label="شماره پیگیری / رسید"><Input value={create.refNo ?? ""} onChange={(e) => setCreate({ ...create, refNo: e.target.value })} /></Field></div>}
        </div>}
      </Modal>
      <Modal open={!!pay} onClose={() => setPay(null)} size="sm" title={pay ? `ثبت پرداخت فاکتور #${toFa(pay.number)}` : ""} footer={<><Button variant="ghost" onClick={() => setPay(null)}>انصراف</Button><Button onClick={async () => { try { await api(`/api/admin/invoices/${pay.id}`, { method: "PATCH", body: { action: "pay", method: pay.method, refNo: pay.refNo, paidAt: pay.paidAt } }); toast("پرداخت ثبت و اشتراک تمدید شد"); setPay(null); reload(true); } catch (e) { toast((e as Error).message, "error"); } }}>تأیید دریافت {pay ? formatPrice(pay.amount) : ""}</Button></>}>
        {pay && <div className="space-y-4"><Field label="روش دریافت"><Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{Object.entries(METHOD).filter(([k]) => k !== "other").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field><Field label="تاریخ دریافت (شمسی)"><JalaliInput value={pay.paidAt} onChange={(v) => v && setPay({ ...pay, paidAt: v })} /></Field><Field label="شماره پیگیری / رسید"><Input value={pay.refNo} onChange={(e) => setPay({ ...pay, refNo: e.target.value })} /></Field><p className="text-xs leading-6 text-stone-500">با تأیید، پلن کسب‌وکار به پلن فاکتور تغییر می‌کند و تاریخ پایان اشتراک به‌اندازه‌ی مدت فاکتور تمدید می‌شود.</p></div>}
      </Modal>
      <Modal open={!!amountEdit} onClose={() => setAmountEdit(null)} size="sm" title={amountEdit ? `ویرایش مبلغ فاکتور #${toFa(amountEdit.number)}` : ""} footer={<><Button variant="ghost" onClick={() => setAmountEdit(null)}>انصراف</Button><Button onClick={async () => { try { await api(`/api/admin/invoices/${amountEdit.id}`, { method: "PATCH", body: { action: "adjust", amount: toEn(String(amountEdit.amount)), note: amountEdit.note } }); toast("مبلغ فاکتور به‌روزرسانی شد"); setAmountEdit(null); reload(true); } catch (e) { toast((e as Error).message, "error"); } }}>ذخیره مبلغ</Button></>}>
        {amountEdit && <div className="space-y-4"><Field label="مبلغ نهایی (تومان)" hint="مبلغ پیش از پرداخت به مشتری نمایش داده می‌شود"><Input inputMode="numeric" value={amountEdit.amount} onChange={(e) => setAmountEdit({ ...amountEdit, amount: e.target.value })} /></Field><Field label="توضیح فاکتور"><Input value={amountEdit.note} onChange={(e) => setAmountEdit({ ...amountEdit, note: e.target.value })} /></Field></div>}
      </Modal>
      <ConfirmDialog open={!!voidId} title="ابطال فاکتور" message={voidId ? `فاکتور #${voidId.number} باطل می‌شود.` : ""} confirmLabel="ابطال" onClose={() => setVoidId(null)} onConfirm={async () => { try { await api(`/api/admin/invoices/${voidId.id}`, { method: "PATCH", body: { action: "void" } }); toast("باطل شد"); reload(true); } catch (e) { toast((e as Error).message, "error"); } }} />
    </div>
  );
}

function Expenses() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useGet<{ items: any[] }>("/api/admin/expenses");
  const [f, setF] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const CATS = ["سرور و زیرساخت", "پیامک و ارتباطات", "حقوق و دستمزد", "بازاریابی و تبلیغات", "دامنه و گواهی", "ابزار و نرم‌افزار", "سایر"];
  const total = (data?.items ?? []).reduce((s, e) => s + e.amount, 0);
  async function save() {
    try {
      const body = { category: f.category, amount: toEn(String(f.amount)), date: f.date, description: f.description };
      if (f.id) await api(`/api/admin/expenses/${f.id}`, { method: "PATCH", body }); else await api("/api/admin/expenses", { method: "POST", body });
      toast("ذخیره شد"); setF(null); reload(true);
    } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><p className="text-sm text-stone-500">جمع هزینه‌های ثبت‌شده: <b className="text-rose-600">{formatPrice(total)}</b></p><Button onClick={() => setF({ category: CATS[0], amount: "", date: new Date().toISOString(), description: "" })}><Icon name="plus" className="size-4" /> هزینه جدید</Button></div>
      <IconText>{error ? <ErrorState message={error} onRetry={() => reload()} /> : loading && !data ? <Skeleton className="h-48 rounded-2xl" /> : !data?.items.length ? <EmptyState emoji="" title="هزینه‌ای ثبت نشده" description="هزینه‌های سرور، پیامک، دامنه و… را ثبت کنید تا سود خالص دقیق محاسبه شود." action={<Button onClick={() => setF({ category: CATS[0], amount: "", date: new Date().toISOString(), description: "" })}>ثبت هزینه</Button>} /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr className="border-b bg-stone-50 text-xs text-stone-500"><th className="p-3 text-start">تاریخ</th><th className="p-3 text-start">دسته</th><th className="p-3 text-start">شرح</th><th className="p-3 text-end">مبلغ</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-stone-100">{data.items.map((e) => <tr key={e.id}><td className="whitespace-nowrap p-3 text-xs">{fmtJ(e.date)}</td><td className="p-3"><Badge>{e.category}</Badge></td><td className="p-3 text-xs text-stone-600">{e.description}</td><td className="p-3 text-end font-bold text-rose-600">{formatNumber(e.amount)}</td><td className="p-2"><div className="flex justify-end"><IconButton icon="edit" label="ویرایش" onClick={() => setF({ ...e, amount: String(e.amount) })} /><IconButton icon="trash" label="حذف" className="hover:text-rose-600" onClick={() => setDel(e)} /></div></td></tr>)}</tbody></table></Card>
      )}</IconText>
      <Modal open={!!f} onClose={() => setF(null)} size="sm" title={f?.id ? "ویرایش هزینه" : "هزینه جدید"} footer={<><Button variant="ghost" onClick={() => setF(null)}>انصراف</Button><Button onClick={save}>ذخیره</Button></>}>
        {f && <div className="space-y-4"><Field label="دسته"><Input list="exp-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /><datalist id="exp-cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist></Field><Field label="مبلغ (تومان)"><Input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field><Field label="تاریخ (شمسی)"><JalaliInput value={f.date} onChange={(v) => v && setF({ ...f, date: v })} /></Field><Field label="شرح"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>}
      </Modal>
      <ConfirmDialog open={!!del} title="حذف هزینه" message="این هزینه حذف می‌شود." onClose={() => setDel(null)} onConfirm={async () => { try { await api(`/api/admin/expenses/${del.id}`, { method: "DELETE" }); setData((d) => (d ? { items: d.items.filter((x) => x.id !== del.id) } : d)); toast("حذف شد"); } catch (e) { toast((e as Error).message, "error"); } }} />
    </div>
  );
}
void formatDate;
