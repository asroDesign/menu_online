import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, payrollItems, payrollRuns } from "@/db/schema";
import { getAuth, can } from "@/lib/auth";
import { fmtJ, fromJ, jMonthLength } from "@/lib/jalali";
import { formatPrice, toFa } from "@/lib/format";
import { PrintTrigger } from "@/components/print-trigger";

export const dynamic = "force-dynamic";

export default async function PayrollPayslipPage({ params }: { params: Promise<{ runId: string; staffId: string }> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!can(auth, "payroll") || !["owner", "manager", "accountant"].includes(auth.role)) redirect("/dashboard");
  const { runId: runText, staffId: staffText } = await params;
  const runId = Number(runText), staffId = Number(staffText);
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(staffId) || runId < 1 || staffId < 1) notFound();
  const [[run], [item], [business]] = await Promise.all([
    db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.businessId, auth.business.id))).limit(1),
    db.select().from(payrollItems).where(and(eq(payrollItems.runId, runId), eq(payrollItems.staffId, staffId), eq(payrollItems.businessId, auth.business.id))).limit(1),
    db.select().from(businesses).where(eq(businesses.id, auth.business.id)).limit(1),
  ]);
  if (!run || !item || !business) notFound();
  const person = item.staffSnapshot as Record<string, any>;
  const periodStart = fromJ(run.jalaliYear, run.jalaliMonth, 1);
  const periodEnd = fromJ(run.jalaliYear, run.jalaliMonth, jMonthLength(run.jalaliYear, run.jalaliMonth));
  const money = (amount: number) => formatPrice(Number(amount) || 0);
  const rows = [
    ...item.earnings.map((entry) => ({ label: entry.label, amount: Number(entry.amountToman), type: "earning" })),
    ...item.deductions.map((entry) => ({ label: entry.label, amount: Number(entry.amountToman), type: "deduction" })),
  ];
  return <main dir="rtl" className="min-h-screen bg-slate-100 p-3 text-slate-900 sm:p-8">
    <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2"><Link href="/dashboard/payroll" className="text-sm font-bold text-slate-600 hover:text-slate-900">بازگشت به حقوق و دستمزد</Link><PrintTrigger label="چاپ / ذخیره PDF"/></div>
    <article className="mx-auto min-h-[277mm] max-w-[210mm] rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10 print:min-h-0 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-4 border-b-2 border-emerald-800 pb-5">
        <div><p className="text-xs font-bold text-emerald-800">فیش حقوق و دستمزد</p><h1 className="mt-2 text-xl font-black sm:text-2xl">{business.name}</h1><p className="mt-2 text-xs leading-6 text-slate-500">دوره: {fmtJ(periodStart)} تا {fmtJ(periodEnd)} · ماه {toFa(run.jalaliMonth)} سال {toFa(run.jalaliYear)}</p></div>
        <div className="text-left text-[11px] leading-6 text-slate-500"><p>شناسه کسب‌وکار: {toFa(business.id)}</p><p>شماره سند: {run.salaryDocumentId ? toFa(run.salaryDocumentId) : "پیش‌نویس"}</p><p>وضعیت: {run.status === "approved" ? "قطعی" : "پیش‌نویس"}</p></div>
      </header>
      <section className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-3">
        {[["نام و نام خانوادگی", person.name], ["نام پدر", person.fatherName], ["کد ملی", person.nationalId], ["شماره بیمه", person.insuranceNumber], ["عنوان شغلی", person.jobTitle], ["کد شغل بیمه", person.jobCode], ["تاریخ شروع به کار", person.employmentStartDate], ["شماره حساب", person.bankAccountNumber], ["شماره شبا", person.iban], ["صاحب حساب", person.bankAccountName]].map(([label, value]) => <div key={label}><span className="block text-[10px] text-slate-500">{label}</span><b className="mt-1 block break-all">{value || "—"}</b></div>)}
      </section>
      <section className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["کارکرد", `${(item.workMinutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ساعت`], ["اضافه‌کاری", `${(item.overtimeMinutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ساعت`], ["جمعه‌کاری", `${(item.fridayMinutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ساعت`], ["شب‌کاری", `${(item.nightMinutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ساعت`], ["تعطیل‌کاری", `${(item.holidayMinutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ساعت`], ["مرخصی", `${(item.leaveMinutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ساعت`], ["مرخصی بدون حقوق", `${(item.unpaidLeaveMinutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ساعت`], ["کسر ساعت", `${(item.shortMinutes / 60).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ساعت`]].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 p-2.5"><span className="text-[10px] text-slate-500">{label}</span><b className="mt-1 block text-xs">{value}</b></div>)}
      </section>
      <table className="mt-5 w-full border-collapse text-xs">
        <thead><tr className="bg-emerald-900 text-white"><th className="border border-emerald-900 p-2.5 text-right">شرح</th><th className="w-20 border border-emerald-900 p-2.5">نوع</th><th className="w-40 border border-emerald-900 p-2.5 text-left">مبلغ (تومان)</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row.type}-${index}`} className={index % 2 ? "bg-slate-50" : "bg-white"}><td className="border border-slate-200 p-2.5">{row.label}</td><td className="border border-slate-200 p-2.5 text-center">{row.type === "earning" ? "دریافتی" : "کسری"}</td><td className="border border-slate-200 p-2.5 text-left font-semibold">{toFa(row.amount.toLocaleString("en-US"))}</td></tr>)}</tbody>
      </table>
      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-slate-200 p-4 text-xs"><p className="flex justify-between"><span>حقوق ناخالص</span><b>{money(item.grossToman)}</b></p><p className="flex justify-between"><span>بیمه سهم کارمند</span><b>{money(item.employeeInsuranceToman)}</b></p><p className="flex justify-between"><span>مالیات حقوق</span><b>{money(item.incomeTaxToman)}</b></p><p className="flex justify-between"><span>کسورات ثبت‌شده</span><b>{money(item.penaltyToman)}</b></p><p className="flex justify-between border-t border-slate-200 pt-2 text-sm"><strong>خالص پرداختنی</strong><strong>{money(item.netToman)}</strong></p></div>
        <div className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs"><div><p className="font-bold">هزینه بیمه سهم کارفرما</p><p className="mt-1">{money(item.employerInsuranceToman)}</p><p className="mt-4 leading-6 text-slate-600">این فیش بر اساس داده‌ها و تنظیمات ثبت‌شده در سامانه صادر شده است. امضا و مهر کارفرما در صورت نیاز به نسخه رسمی اضافه شود.</p></div><div className="mt-8 flex justify-between gap-4 text-center"><div className="flex-1 border-t border-slate-300 pt-2">امضای کارمند</div><div className="flex-1 border-t border-slate-300 pt-2">مهر و امضای کارفرما</div></div></div>
      </section>
      {Array.isArray(person.warnings) && person.warnings.length > 0 && <aside className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[10px] leading-5 print:hidden"><b>هشدارهای بررسی</b><ul className="mt-1 list-inside list-disc">{person.warnings.map((warning: string, index: number) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></aside>}
      <footer className="mt-8 border-t border-slate-200 pt-3 text-center text-[9px] text-slate-400">این نسخه، چاپ اطلاعات ثبت‌شده در سامانه است و جایگزین فرم مورد تأیید بانک/مرجع دریافت‌کننده نیست.</footer>
    </article>
    <style>{`@page{size:A4;margin:12mm}@media print{html,body{background:#fff!important}.no-print{display:none!important}main{padding:0!important;background:#fff!important}article{width:100%;min-height:0!important}}`}</style>
  </main>;
}
