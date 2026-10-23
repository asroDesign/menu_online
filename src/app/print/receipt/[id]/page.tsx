import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { can, getAuth } from "@/lib/auth";
import { formatNumber, formatTime, toFa } from "@/lib/format";
import { fmtJ } from "@/lib/jalali";
import { normalizePrinterSettings } from "@/lib/printer-policy";
import { listOrders, settingsOf } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const metadata = { title: "رسید سفارش" };

/** 80mm thermal-printer receipt (works with any printer through the browser's print dialog). */
export default async function Receipt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ reprint?: string }> }) {
  const { id } = await params;
  const isReprint = (await searchParams)?.reprint === "1";
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!can(auth, "cashier_pos")) redirect("/dashboard/plan?locked=cashier_pos");
  const [chk] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, Number(id)), eq(orders.businessId, auth.business.id)));
  if (!chk) notFound();
  const [o] = await listOrders(auth.business.id, { id: chk.id });
  const printSettings = normalizePrinterSettings(settingsOf(auth.business).printerSettings);
  const kind = o.type === "delivery" ? "ارسال" : o.type === "takeaway" ? "بیرون‌بر" : (o.tableName ?? "سالن");
  const row = (l: string, v: string, b = false) => <div className={`flex justify-between gap-2 ${b ? "text-sm font-black" : "text-[11px]"}`}><span>{l}</span><span className="text-end tabular-nums">{v}</span></div>;
  return (
    <div className="min-h-dvh bg-stone-100 p-4 print:bg-white print:p-0">
      <style>{`@page{size:80mm auto;margin:3mm}.receipt-frame{border:1px solid #78716c;border-radius:7px;padding:7px;margin-bottom:7px;break-inside:avoid}.receipt-items{width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px;line-height:1.55}.receipt-items th,.receipt-items td{border:1px solid #a8a29e;padding:4px 3px;vertical-align:top;overflow-wrap:anywhere}.receipt-items th{background:#f5f5f4;font-weight:800}.receipt-items .numeric{white-space:nowrap;text-align:center;font-variant-numeric:tabular-nums}@media print{.receipt-frame{border-color:#444;border-radius:0}.receipt-items th{background:#eee!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-sm justify-between"><Link href="/dashboard/orders" className="text-sm font-semibold text-stone-600">← سفارش‌ها</Link><PrintButton /></div>
      <div dir="rtl" className="mx-auto w-[76mm] bg-white p-2 text-[12px] leading-5 shadow print:w-full print:shadow-none">
        <header className="receipt-frame text-center">
          <h1 className="text-sm font-black">{auth.business.name}</h1>
          {printSettings.receiptHeader && <p className="mt-1 whitespace-pre-wrap border-t border-dashed border-stone-400 pt-1 text-[10px] leading-4">{printSettings.receiptHeader}</p>}
          {auth.business.phone && <p className="mt-1 text-[10px]">{auth.business.phone}</p>}
        </header>
        <section className="receipt-frame space-y-1">
          {row("شماره سفارش", `#${toFa(o.number)}`, true)}
          {isReprint && <p className="border-y border-dashed border-stone-300 py-1 text-center text-[9px] font-bold">چاپ مجدد · اطلاعات ثبت‌شدهٔ سفارش</p>}
          {row("تاریخ", `${fmtJ(o.createdAt)} ${formatTime(o.createdAt)}`)}
          {row("نوع سفارش", kind)}
          {o.customerName && row("مشتری", o.customerName)}
          {o.address && <p className="break-words text-[10px]">نشانی: {o.address}</p>}
        </section>
        <table className="receipt-items mb-2">
          <colgroup><col style={{ width: "58%" }} /><col style={{ width: "14%" }} /><col style={{ width: "28%" }} /></colgroup>
          <thead><tr><th className="text-start">شرح کالا</th><th>تعداد</th><th>مبلغ</th></tr></thead>
          <tbody>{o.items.map((item) => <tr key={item.id}>
            <td><p className="font-bold">{item.name}</p>{item.weightGrams != null && <p className="text-[9px]">وزن خالص: {formatNumber(item.weightGrams)} گرم</p>}{item.optionSnapshot?.map((option) => <p key={option.optionId} className="text-[9px]">{option.groupName}: {option.optionName}{option.priceDelta ? ` · ${option.priceDelta > 0 ? "+" : "−"}${formatNumber(Math.abs(option.priceDelta))} تومان` : ""}</p>)}{item.note && <p className="text-[9px]">{item.note}</p>}</td>
            <td className="numeric">{toFa(item.quantity)}</td>
            <td className="numeric">{formatNumber(item.lineTotal ?? item.price * item.quantity)}</td>
          </tr>)}</tbody>
        </table>
        <section className="receipt-frame space-y-1">
          {row("جمع اقلام", formatNumber(o.subtotal))}
          {o.membershipDiscount > 0 && row(`مزیت عضویت · ${o.membershipSnapshot?.tierName ?? "سطح مشتری"}`, `−${formatNumber(o.membershipDiscount)}`)}
          {o.discountAmount > o.membershipDiscount && row(o.discountCode ? `تخفیف · ${o.discountCode}` : "تخفیف", `−${formatNumber(o.discountAmount - o.membershipDiscount)}`)}
          {o.deliveryFee > 0 && row("هزینه ارسال", formatNumber(o.deliveryFee))}
          {o.tax > 0 && row("مالیات", formatNumber(o.tax))}
          {o.service > 0 && row("خدمات", formatNumber(o.service))}
          {o.cashbackUsed > 0 && row("اعتبار کش‌بک", `−${formatNumber(o.cashbackUsed)}`)}
          <div className="border-t border-dashed border-stone-500 pt-1">{row("مبلغ قابل پرداخت", `${formatNumber(o.total)} تومان`, true)}</div>
          {o.paymentStatus === "paid" && <p className="mt-1 border-t border-dashed border-stone-300 pt-1 text-center text-[10px] font-bold">پرداخت شد · {o.paymentMethod}</p>}
        </section>
        {o.note && <section className="receipt-frame break-words text-[10px]"><b>توضیحات</b><p>{o.note}</p></section>}
        <footer className="receipt-frame text-center text-[10px]">
          {printSettings.receiptFooter && <p className="whitespace-pre-wrap">{printSettings.receiptFooter}</p>}
          {!printSettings.receiptFooter && <p className="font-bold">از خرید شما سپاسگزاریم</p>}
        </footer>
      </div>
    </div>
  );
}
