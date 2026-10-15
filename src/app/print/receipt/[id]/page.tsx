import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { can, getAuth } from "@/lib/auth";
import { formatNumber, formatTime, toFa } from "@/lib/format";
import { fmtJ } from "@/lib/jalali";
import { listOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const metadata = { title: "رسید سفارش" };

/** 80mm thermal-printer receipt (works with any printer through the browser's print dialog). */
export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!can(auth, "cashier_pos")) redirect("/dashboard/plan?locked=cashier_pos");
  const [chk] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, Number(id)), eq(orders.businessId, auth.business.id)));
  if (!chk) notFound();
  const [o] = await listOrders(auth.business.id, { id: chk.id });
  const kind = o.type === "delivery" ? "ارسال" : o.type === "takeaway" ? "بیرون‌بر" : (o.tableName ?? "سالن");
  const row = (l: string, v: string, b = false) => <div className={`flex justify-between ${b ? "text-base font-black" : ""}`}><span>{l}</span><span>{v}</span></div>;
  return (
    <div className="min-h-dvh bg-stone-100 p-4 print:bg-white print:p-0">
      <style>{"@page{size:80mm auto;margin:3mm}"}</style>
      <div className="no-print mx-auto mb-4 flex max-w-sm justify-between"><a href="/dashboard/orders" className="text-sm font-semibold text-stone-600">← سفارش‌ها</a><PrintButton /></div>
      <div className="mx-auto w-[76mm] bg-white p-3 text-[12px] leading-6 shadow print:w-full print:shadow-none">
        <h1 className="text-center text-base font-black">{auth.business.name}</h1>
        {auth.business.phone && <p className="text-center text-[11px]">{auth.business.phone}</p>}
        <hr className="my-2 border-dashed border-stone-500" />
        {row("سفارش", `#${toFa(o.number)}`, true)}
        {row("تاریخ", `${fmtJ(o.createdAt)} ${formatTime(o.createdAt)}`)}
        {row("نوع", kind)}
        {o.customerName && row("مشتری", o.customerName)}
        {o.address && <p>آدرس: {o.address}</p>}
        <hr className="my-2 border-dashed border-stone-500" />
        {o.items.map((i) => <div key={i.id} className="flex justify-between gap-2"><span>{toFa(i.quantity)} × {i.name}</span><span>{formatNumber(i.price * i.quantity)}</span></div>)}
        <hr className="my-2 border-dashed border-stone-500" />
        {row("جمع اقلام", formatNumber(o.subtotal))}
        {o.discountAmount > 0 && row("تخفیف", `-${formatNumber(o.discountAmount)}`)}
        {o.deliveryFee > 0 && row("ارسال", formatNumber(o.deliveryFee))}
        {o.tax > 0 && row("مالیات", formatNumber(o.tax))}
        {o.service > 0 && row("خدمات", formatNumber(o.service))}
        {o.cashbackUsed > 0 && row("اعتبار کش‌بک", `-${formatNumber(o.cashbackUsed)}`)}
        <hr className="my-2 border-stone-700" />
        {row("مبلغ قابل پرداخت", `${formatNumber(o.total)} تومان`, true)}
        {o.paymentStatus === "paid" && <p className="mt-1 text-center font-bold">✔ پرداخت شد ({o.paymentMethod})</p>}
        {o.note && <p className="mt-2">توضیحات: {o.note}</p>}
        <p className="mt-3 text-center text-[11px]">از خرید شما سپاسگزاریم 🌸</p>
      </div>
    </div>
  );
}
