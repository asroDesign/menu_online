"use client";

import { useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Coffee, Plus, ReceiptText, ShoppingBag, Utensils } from "lucide-react";

const products = [
  { id: "shake", name: "شیک شکلات", price: 320_000, icon: Coffee },
  { id: "latte", name: "لاته", price: 95_000, icon: Coffee },
  { id: "mojito", name: "موهیتو", price: 110_000, icon: ShoppingBag },
] as const;

type OrderStatus = "new" | "preparing" | "ready" | "served";
type DemoOrder = { id: number; productId: (typeof products)[number]["id"]; status: OrderStatus };

const statusLabels: Record<OrderStatus, string> = {
  new: "جدید",
  preparing: "در حال آماده‌سازی",
  ready: "آمادهٔ تحویل",
  served: "تحویل شد",
};

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  new: "preparing",
  preparing: "ready",
  ready: "served",
};

const money = new Intl.NumberFormat("fa-IR");

export function PosProductDemo() {
  const [selected, setSelected] = useState<(typeof products)[number]["id"]>("shake");
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  function addOrder() {
    setOrders((current) => [...current, { id: current.reduce((max, order) => Math.max(max, order.id), 100) + 1, productId: selected, status: "new" }]);
  }

  function advanceOrder(id: number) {
    setOrders((current) => current.map((order) => order.id === id && nextStatus[order.status] ? { ...order, status: nextStatus[order.status]! } : order));
  }

  const todayTotal = orders.reduce((sum, order) => sum + (products.find((item) => item.id === order.productId)?.price ?? 0), 0);

  return <div className="mt-8 overflow-hidden rounded-[1.75rem] border border-emerald-100 bg-[#f3faf6] p-2 shadow-[0_24px_70px_rgba(14,72,52,.1)] sm:p-4">
    <div className="grid gap-3 lg:grid-cols-[.78fr_1.22fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="منوی نمونه">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3"><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><Coffee size={17}/></span><span><b className="block text-xs">کافه نمونه</b><small className="text-[10px] text-slate-500">منوی دیجیتال · میز ۴</small></span></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-800">پیش‌نمایش</span></div>
        <div className="mt-4"><h3 className="text-sm font-black">یک نوشیدنی انتخاب کنید</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">انتخاب شما در این نمونه به صندوق نمایشی اضافه می‌شود.</p></div>
        <div className="mt-3 space-y-2">{products.map(({ id, name, price, icon: Icon })=><label key={id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selected===id?"border-emerald-300 bg-emerald-50/70 shadow-sm":"border-slate-200 hover:border-emerald-200"}`}><input type="radio" name="pos-demo-product" className="radio radio-sm radio-success" checked={selected===id} onChange={()=>setSelected(id)}/><span className="grid size-9 place-items-center rounded-xl bg-white text-emerald-800 shadow-sm"><Icon size={17}/></span><span className="min-w-0 flex-1"><b className="block text-xs">{name}</b><small className="mt-1 block text-[10px] text-slate-500">یک عدد · منوی نمونه</small></span><b className="whitespace-nowrap text-[10px]">{money.format(price)} تومان</b></label>)}</div>
        <button type="button" onClick={addOrder} className="btn mt-4 min-h-11 w-full border-0 bg-[#086447] text-xs font-extrabold text-white hover:bg-[#07553c]"><Plus size={15}/> ثبت سفارش نمونه</button>
        <p className="mt-2 text-center text-[9px] leading-5 text-slate-400">ثبت محلی در پیش‌نمایش؛ اطلاعاتی به سامانه ارسال نمی‌شود.</p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="صندوق نمایشی">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-5"><div><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-700"><ReceiptText size={17}/></span><div><b className="block text-xs">صندوق نمونه</b><small className="text-[10px] text-slate-500">نمای زندهٔ همین صفحه</small></div></div></div><div className="rounded-xl bg-emerald-50 px-3 py-2 text-left"><small className="block text-[9px] font-semibold text-emerald-800">فروش این پیش‌نمایش</small><b className="mt-0.5 block text-sm text-emerald-950">{money.format(todayTotal)} <small className="text-[9px]">تومان</small></b></div></div>
        <div className="grid gap-2 bg-slate-50/75 p-3 sm:grid-cols-3 sm:p-4">{(["new","preparing","ready"] as const).map((status) => {
          const visibleOrders = orders.filter((order) => status === "ready" ? order.status === "ready" || order.status === "served" : order.status === status);
          const style = status === "new" ? "border-amber-200 bg-amber-50/60" : status === "preparing" ? "border-sky-200 bg-sky-50/60" : "border-emerald-200 bg-emerald-50/60";
          return <div key={status} className={`min-h-40 rounded-xl border p-3 ${style}`}><div className="flex items-center justify-between gap-2"><b className="text-[10px]">{statusLabels[status]}</b><span className="grid min-w-6 place-items-center rounded-full bg-white/85 px-1.5 py-1 text-[9px] font-black">{money.format(visibleOrders.length)}</span></div><div className="mt-2 space-y-2">{visibleOrders.map((order) => {
            const item = products.find((entry) => entry.id === order.productId) ?? products[0];
            const upcoming = nextStatus[order.status];
            return <article key={order.id} className="rounded-xl border border-white bg-white p-2.5 shadow-sm"><div className="flex items-start justify-between gap-2"><div><b className="block text-[10px]">#{money.format(order.id)} · میز ۴</b><span className="mt-1 block text-[10px] text-slate-600">{item.name} × ۱</span></div><span className="text-[9px] font-bold text-slate-500">{money.format(item.price)}</span></div>{upcoming?<button type="button" onClick={()=>advanceOrder(order.id)} className="mt-2 inline-flex min-h-7 w-full items-center justify-center gap-1 rounded-lg bg-slate-900 px-2 text-[9px] font-bold text-white hover:bg-slate-700">{upcoming==="preparing"?"شروع آماده‌سازی":upcoming==="ready"?"آماده شد":"تحویل شد"}<ArrowLeft size={12}/></button>:<span className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700"><CheckCircle2 size={12}/> {statusLabels.served}</span>}</article>;
          })}</div>{status==="new"&&visibleOrders.length===0&&<div className="mt-4 rounded-lg border border-dashed border-amber-200 px-2 py-3 text-center text-[9px] text-slate-500">سفارشی نیست؛ از منوی نمونه انتخاب کنید.</div>}</div>;
        })}</div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 text-[9px] text-slate-500 sm:px-5"><span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-500"/> جدید</span><span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-500"/> آماده‌سازی</span><span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-600"/> آماده/تحویل</span><span className="ms-auto inline-flex items-center gap-1"><Utensils size={12}/> گردش نمایشی سفارش</span></div>
      </section>
    </div>
  </div>;
}
