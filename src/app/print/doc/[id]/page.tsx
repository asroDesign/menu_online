import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { accAccounts, accDocuments, accFiscalYears, accLines } from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { can, getAuth } from "@/lib/auth";
import { amountInWords, formatNumber, toFa } from "@/lib/format";
import { fmtJLong, fmtJ } from "@/lib/jalali";
import { chainOf } from "@/lib/accounting";

export const dynamic = "force-dynamic";
export const metadata = { title: "روکش سند حسابداری" };

const KIND: Record<string, string> = { general: "سند عمومی", opening: "سند افتتاحیه", closing: "سند اختتامیه" };
const SRC: Record<string, string> = { manual: "دستی", order: "سفارش فروش (خودکار)", inventory: "انبار (خودکار)", expense: "درآمد/هزینه (خودکار)", reversal: "برگشت سند", system: "سیستمی", payroll: "حقوق و دستمزد", receivable: "مطالبات", receivable_reversal: "برگشت وصول", cheque: "دفتر چک" };

export default async function PrintDoc({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!can(auth, "accounting")) redirect("/dashboard/plan?locked=accounting");
  const [doc] = await db.select().from(accDocuments).where(and(eq(accDocuments.id, Number(id)), eq(accDocuments.businessId, auth.business.id)));
  if (!doc) notFound();
  const [year] = await db.select().from(accFiscalYears).where(eq(accFiscalYears.id, doc.fiscalYearId));
  const accs = await db.select().from(accAccounts).where(eq(accAccounts.businessId, auth.business.id));
  const byId = new Map(accs.map((a) => [a.id, a]));
  const lines = await db.select().from(accLines).where(eq(accLines.documentId, doc.id)).orderBy(asc(accLines.id));
  const rows = lines.map((l) => {
    const a = byId.get(l.accountId)!;
    const ch = chainOf(a, byId);
    return { ...l, a, kol: ch.find((x) => x.level === "kol"), moein: ch.find((x) => x.level === "moein"), tafsili: a.level === "tafsili" ? a : null };
  });
  const td = rows.reduce((s, r) => s + r.debit, 0), tc = rows.reduce((s, r) => s + r.credit, 0);
  const reversedFrom = doc.reversedOf ? (await db.select({ n: accDocuments.number }).from(accDocuments).where(eq(accDocuments.id, doc.reversedOf)))[0]?.n : null;
  return (
    <div className="min-h-dvh bg-stone-100 p-4 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between">
        <Link href="/dashboard/accounting" className="text-sm font-semibold text-stone-600">← بازگشت به حسابداری</Link>
        <PrintButton />
      </div>
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow print:max-w-none print:rounded-none print:p-4 print:shadow-none" style={{ fontSize: 13 }}>
        <div className="flex items-start justify-between border-b-2 border-stone-800 pb-4">
          <div>
            <h1 className="text-xl font-black">{auth.business.name}</h1>
            <p className="mt-1 text-sm text-stone-600">{KIND[doc.kind] ?? "سند حسابداری"} {doc.status === "draft" && <b className="text-rose-600">(پیش‌نویس — غیرقطعی)</b>}</p>
          </div>
          <table className="text-sm"><tbody>
            <tr><td className="pe-3 text-stone-500">شماره سند:</td><td className="font-black">{toFa(doc.number)}</td></tr>
            <tr><td className="pe-3 text-stone-500">تاریخ:</td><td className="font-bold">{fmtJLong(doc.date)} ({fmtJ(doc.date)})</td></tr>
            <tr><td className="pe-3 text-stone-500">سال مالی:</td><td>{year?.title}</td></tr>
            <tr><td className="pe-3 text-stone-500">منبع:</td><td>{SRC[doc.source] ?? doc.source}</td></tr>
          </tbody></table>
        </div>
        <p className="my-4 text-sm leading-7"><b>شرح سند:</b> {doc.description || "—"}{reversedFrom ? ` (برگشت سند شماره ${toFa(reversedFrom)})` : ""}{doc.reversed ? " — این سند برگشت خورده است" : ""}</p>
        <table className="w-full border-collapse text-sm">
          <thead><tr className="bg-stone-100 print:bg-stone-200">
            {["ردیف", "کد", "حساب کل", "حساب معین", "تفصیلی", "شرح", "بدهکار", "بستانکار"].map((h) => <th key={h} className="border border-stone-400 p-2 text-center font-bold">{h}</th>)}
          </tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.id}>
              <td className="border border-stone-300 p-2 text-center">{toFa(i + 1)}</td>
              <td className="border border-stone-300 p-2 text-center">{toFa(r.a.code)}</td>
              <td className="border border-stone-300 p-2">{r.kol?.name}</td>
              <td className="border border-stone-300 p-2">{r.moein?.name}</td>
              <td className="border border-stone-300 p-2">{r.tafsili?.name ?? "—"}</td>
              <td className="border border-stone-300 p-2 text-xs">{r.description}</td>
              <td className="border border-stone-300 p-2 text-center font-semibold">{r.debit ? formatNumber(r.debit) : ""}</td>
              <td className="border border-stone-300 p-2 text-center font-semibold">{r.credit ? formatNumber(r.credit) : ""}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr className="bg-stone-100 font-black print:bg-stone-200"><td colSpan={6} className="border border-stone-400 p-2 text-center">جمع</td><td className="border border-stone-400 p-2 text-center">{formatNumber(td)}</td><td className="border border-stone-400 p-2 text-center">{formatNumber(tc)}</td></tr></tfoot>
        </table>
        <p className="mt-4 text-sm"><b>مبلغ به حروف:</b> {amountInWords(td)} تومان</p>
        <div className="mt-16 grid grid-cols-4 gap-4 text-center text-sm">
          {["تنظیم‌کننده", "حسابدار", "مدیر مالی", "مدیرعامل"].map((t) => (
            <div key={t} className="border-t border-stone-500 pt-2"><p className="font-bold">{t}</p><p className="mt-1 h-10 text-xs text-stone-400">{t === "تنظیم‌کننده" ? doc.createdBy : ""}</p></div>
          ))}
        </div>
        <p className="mt-6 text-center text-[10px] text-stone-400">چاپ‌شده توسط {auth.user.name} · {fmtJ(new Date())}</p>
      </div>
    </div>
  );
}
