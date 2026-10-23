"use client";

import Link from "next/link";
import { CashierDebtModal } from "./cashier-debt-modal";
import { useState } from "react";
import { api, useCollection } from "@/lib/api";
import { formatPrice, statusInfo, toFa } from "@/lib/format";
import { workflowDisplayStages, workflowDisplayStageIndex } from "@/lib/order-workflow-core";
import type { Order } from "@/lib/types";
import { useFeatures } from "@/components/features";
import { Badge, Button, Icon, Input, Modal, Select, useToast } from "@/components/ui";
import { ManualOrderPrintButton } from "@/components/manual-order-print-button";

export function CashierOrderDesk({ revision, workflowPreset, docked = false }: { revision: number; workflowPreset: 1 | 2 | 3 | 4; docked?: boolean }) {
  const collection = useCollection<Order>(`/api/orders?limit=200&refresh=${revision}`, { poll: 8000 });
  const [debtOrder, setDebtOrder] = useState<Order | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState("cash");
  const [settling, setSettling] = useState(false);
  const toast = useToast();
  const features = useFeatures();
  const stages = workflowDisplayStages(workflowPreset);
  const selected = collection.items.find((order) => order.id === selectedId);
  const active = collection.items.filter((order) => ["pending", "preparing", "ready", "served"].includes(order.status));
  const term = query.trim().replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  const visible = collection.items.filter((order) =>
    (filter === "all" || filter === "active" && active.includes(order) || filter === "no-table" && !order.tableId && active.includes(order) || order.status === filter) &&
    (!term || `${order.number} ${order.customerName} ${order.customerPhone} ${order.tableName ?? ""}`.includes(term)));

  async function change(status: string, paymentMethod?: string) {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api(`/api/orders/${selected.id}`, { method: "PATCH", body: { status, ...(paymentMethod ? { paymentMethod } : {}) } });
      await collection.reload(true);
      setSettling(false);
      toast(paymentMethod ? "تسویه و سند حسابداری ثبت شد" : "مرحله سفارش تغییر کرد");
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setBusy(false); }
  }
  const orderList = (
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="جستجوی سفارش" placeholder="شماره سفارش، میز، نام یا موبایل" value={query} onChange={(e) => setQuery(e.target.value)} /><Select aria-label="فیلتر سفارش‌ها" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="active">فعال</option><option value="no-table">فعال بدون میز</option><option value="ready">آماده</option><option value="paid">تکمیل و تسویه‌شده</option><option value="all">همه</option></Select></div>
        {collection.error && <p role="alert" className="text-sm text-red-700">{collection.error}<Button variant="ghost" onClick={() => collection.reload()}>تلاش دوباره</Button></p>}
        <div className="grid max-h-[60dvh] gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((order) => {
            const confirmed = !!order.cashierConfirmedAt;
            const stepLabels = workflowPreset === 4 ? ["ثبت", "تأیید", "آماده‌سازی", "آماده"] : stages.map(s => s.label);
            const stageIndex = workflowPreset === 4 ? (["ready", "served", "paid"].includes(order.status) ? 3 : order.status === "preparing" ? 2 : confirmed ? 1 : 0) : workflowDisplayStageIndex(workflowPreset, order.status);
            const next = order.status === "pending" ? workflowPreset === 4 && !confirmed ? "confirm" : "preparing" : order.status === "preparing" ? "ready" : order.status === "ready" ? "served" : null;
            return <article key={order.id} className="cashier-order-card relative grid gap-1.5 rounded-xl border border-blue-200 bg-blue-50/50 p-2 text-start">
              <div className="grid min-w-0 items-center gap-1 whitespace-nowrap" style={{ gridTemplateColumns: "auto minmax(0, 1fr) minmax(0, 1.4fr)" }}>
                <b className="shrink-0 rounded-md bg-blue-900 px-1 py-0.5 text-[10px] leading-tight text-white">#{toFa(order.number)}</b>
                <span className="block min-w-0 truncate text-[10px] font-bold">{order.tableName ?? (order.type === "delivery" ? "ارسال" : order.type === "dine_in" ? "حضوری · بدون میز" : "بیرون‌بر")}</span>
                <Badge className="!block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-1 py-0.5 text-center text-[9px] leading-tight">{order.status === "pending" && workflowPreset === 4 ? confirmed ? "تأیید صندوقدار" : "در انتظار تأیید صندوقدار" : statusInfo(order.status).label}</Badge>
              </div>
              <div className="grid gap-1.5 rounded-lg border border-blue-100 bg-white p-1.5">
                <div className="flex justify-between gap-1 text-xs"><b>{formatPrice(order.total)}</b><span>{toFa(order.items.reduce((sum,item) => sum + item.quantity,0))} آیتم</span></div>
                <p className="line-clamp-2 text-[11px] text-stone-600">{order.items.map(item => `${item.name}${item.quantity > 1 ? ` × ${toFa(item.quantity)}` : ""}`).join("، ")}</p>
                <div className="flex flex-wrap justify-between gap-1 text-[10px] text-stone-500"><span>{order.customerName || "مشتری مهمان"}</span><time>{new Date(order.createdAt).toLocaleString("fa-IR", { month:"short",day:"numeric",hour:"2-digit",minute:"2-digit" })}</time></div>
                <div className="grid gap-1" style={{gridTemplateColumns:`repeat(${stepLabels.length},minmax(0,1fr))`}}>{stepLabels.map((label,index) => <div key={label}><div className={`h-1 rounded-full ${index <= stageIndex ? "bg-blue-900" : "bg-stone-100"}`} /><span className="block text-center text-[9px]">{label}</span></div>)}</div>
              </div>
              {next && <Button size="sm" className="h-8 min-h-8 w-full px-2 text-[10px] bg-blue-900 text-white" disabled={busy} onClick={async () => {
                setBusy(true);
                try { await api(`/api/orders/${order.id}${next === "confirm" ? "/cashier" : ""}`, {method: next === "confirm" ? "POST" : "PATCH", body: next === "confirm" ? {action:"confirm"} : {status:next}}); await collection.reload(true); toast(next === "confirm" ? "تأیید صندوقدار ثبت شد" : "مرحله سفارش تغییر کرد"); } catch(e) { toast((e as Error).message,"error"); } finally { setBusy(false); }
              }}>{next === "confirm" ? "تأیید صندوقدار" : next === "preparing" ? "شروع آماده‌سازی" : next === "ready" ? "آماده تحویل" : "تحویل / سرو شد"}</Button>}
              <div className="grid grid-cols-3 gap-1"><Button size="sm" variant="secondary" className="h-7 min-h-7 px-1 text-[9px]" onClick={() => {setExpanded(false);setSelectedId(order.id);setSettling(false);}}>جزئیات</Button><ManualOrderPrintButton orderId={order.id} kind="customer" label="فیش" disabled={!features.has("cloud_printer")} className="h-7 min-h-7 w-full px-1 text-[9px]" /><ManualOrderPrintButton orderId={order.id} kind="kitchen" label="آشپزخانه" disabled={!features.has("cloud_printer")} className="h-7 min-h-7 w-full px-1 text-[9px]" /></div>
              {order.paymentStatus === "unpaid" && order.paymentMethod !== "credit" && ["pending","preparing","ready","served"].includes(order.status) && <Button size="sm" variant="secondary" className="h-8 min-h-8 w-full px-2 text-[10px] border-amber-200 bg-amber-50 text-amber-900" disabled={busy} onClick={() => {setExpanded(false);setDebtOrder(order);}}>بدهکاران · پرداخت بعداً</Button>}
              {order.paymentMethod === "credit" && <Link href="/dashboard/receivables" className="block text-center text-xs text-amber-800">ثبت‌شده در بدهکاران · مشاهده حساب</Link>}
            </article>;
          })}
        </div>
        {!visible.length && <p className="py-3 text-center text-sm text-stone-500">{collection.loading ? "در حال دریافت سفارش‌ها…" : "سفارشی با این فیلتر وجود ندارد"}</p>}
        <p className="text-xs text-stone-500">۲۰۰ سفارش اخیر · به‌روزرسانی خودکار هر ۸ ثانیه</p>
      </div>
  );
  return <>
    {debtOrder && <CashierDebtModal total={debtOrder.total} items={debtOrder.items.map(item => ({name:item.name,quantity:item.quantity,amount:item.lineTotal || item.price * item.quantity}))} name={debtOrder.customerName} phone={debtOrder.customerPhone} createdAt={debtOrder.createdAt} busy={busy} onClose={() => setDebtOrder(null)} onSubmit={async details => {setBusy(true);try {await api(`/api/orders/${debtOrder.id}/cashier`,{method:"POST",body:{action:"debt",details}});await collection.reload(true);setDebtOrder(null);toast("بدهی و سند حسابداری ثبت شد");} finally {setBusy(false);}}} />}
    <div className={docked ? "cashier-order-dock" : ""}>
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button size="sm" variant="secondary" className="h-9 gap-1.5 rounded-lg px-2.5 text-xs" onClick={() => setExpanded(true)} aria-expanded={expanded}>
        <Icon name="orders" className="size-4" /><span className="hidden sm:inline">سفارش‌های جاری</span><span className="sr-only sm:hidden">سفارش‌های جاری</span><Badge>{toFa(active.length)}</Badge>
      </Button>
      <Link aria-label="بدهکاران و تسویه" title="بدهکاران و تسویه" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50" href="/dashboard/receivables"><Icon name="wallet" className="size-4" /><span className="hidden sm:inline">بدهکاران</span></Link>
      <Link aria-label="تنظیم پرینترها" title="تنظیم پرینترها" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50" href="/dashboard/settings/printers/devices"><Icon name="settings" className="size-4" /><span className="hidden sm:inline">تنظیم چاپ</span></Link>
      <Link aria-label="صف و نتیجه چاپ" title="صف و نتیجه چاپ" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50" href="/dashboard/printers"><Icon name="print" className="size-4" /><span className="hidden sm:inline">صف چاپ</span></Link>
    </div>
    {docked && <div className="cashier-order-list"><h2 className="mb-2 flex items-center justify-between text-sm font-bold">سفارش‌های جاری <Badge>{toFa(active.length)}</Badge></h2>{orderList}</div>}
    </div>
    <Modal open={expanded} onClose={() => setExpanded(false)} title={`سفارش‌های جاری · ${toFa(active.length)}`} size="xl">
      {orderList}
    </Modal>
    <Modal open={!!selected} onClose={() => { if (!busy) setSelectedId(null); }} title={selected ? `سفارش #${toFa(selected.number)}` : "سفارش"} size="lg">
      {selected && <div className="space-y-4">
        <div className="flex flex-wrap gap-2">{stages.map((stage, index) => <span key={stage.label} className={`rounded-full px-3 py-2 text-xs ${index === workflowDisplayStageIndex(workflowPreset, selected.status) ? "bg-brand-600 text-white" : "bg-stone-100"}`}>{stage.label}</span>)}</div>
        <div className="rounded-xl bg-stone-50 p-3 text-sm leading-7"><b>{selected.customerName || "مشتری مهمان"}</b> <span dir="ltr">{selected.customerPhone}</span><p>{selected.tableName ?? "بدون میز"} · {selected.address}</p>{selected.note && <p>توضیحات: {selected.note}</p>}</div>
        <div className="max-h-64 space-y-2 overflow-y-auto">{selected.items.map((item) => <div key={item.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><b>{toFa(item.quantity)} × {item.name}</b><span>{formatPrice(item.lineTotal || item.price * item.quantity)}</span></div>{item.optionSnapshot?.map((option) => <p key={option.optionId} className="mt-1 text-xs text-stone-500">{option.groupName}: {option.optionName} ({option.priceDelta > 0 ? "+" : ""}{formatPrice(option.priceDelta)})</p>)}{item.note && <p>{item.note}</p>}</div>)}</div>
        <div className="flex justify-between font-bold"><span>مبلغ نهایی</span><span>{formatPrice(selected.total)}</span></div>
        <div className="flex flex-wrap gap-2">{["pending", "preparing", "ready", "served"].includes(selected.status) && <>
          {selected.status === "pending" && <Button disabled={busy} onClick={() => change("preparing")}>شروع آماده‌سازی</Button>}
          {selected.status === "preparing" && <Button disabled={busy} onClick={() => change("ready")}>آماده تحویل</Button>}
          {selected.status === "ready" && <Button disabled={busy} onClick={() => change("served")}>تحویل / سرو شد</Button>}
          {selected.status === "served" && selected.paymentStatus === "paid" && <Button disabled={busy} onClick={() => change("paid", selected.paymentMethod ?? "cash")}>تکمیل سفارش پرداخت‌شده</Button>}
          {selected.paymentMethod === "credit" ? <Link href="/dashboard/receivables"><Button variant="secondary">دریافت وجه از دفتر بدهکاران</Button></Link> : selected.paymentStatus !== "paid" ? <Button variant="secondary" disabled={busy} onClick={() => setSettling(true)}>دریافت وجه و تسویه</Button> : <Badge>وجه قبلاً دریافت شده</Badge>}
        </>}</div>
        {settling && <div className="space-y-3 rounded-xl border border-brand-300 p-3"><p className="text-sm">پس از دریافت واقعی وجه، تسویه را تأیید کنید.</p><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">نقدی</option><option value="pos">کارت‌خوان</option><option value="card">کارت‌به‌کارت</option></Select><Button disabled={busy} onClick={() => change("paid", method)}>تأیید دریافت {formatPrice(selected.total)}</Button></div>}
        {features.has("cloud_printer") && <div className="flex flex-wrap gap-2 border-t pt-3">{([['customer','فیش مشتری'],['kitchen','فیش آشپزخانه'],['cafe','نسخه کافه']] as const).map(([kind,label]) => <ManualOrderPrintButton key={kind} orderId={selected.id} kind={kind} label={label} disabled={busy} />)}</div>}
      </div>}
    </Modal>
  </>;
}
