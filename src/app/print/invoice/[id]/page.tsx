import { EmojiIcon , IconText} from "@/components/ui";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { businesses, subscriptionInvoices, users } from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { getBilling } from "@/lib/app-settings";
import { adminCan, getAuth } from "@/lib/auth";
import { amountInWords, formatNumber, toFa } from "@/lib/format";
import { fmtJ, fmtJLong } from "@/lib/jalali";
import { planName } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "فاکتور اشتراک" };

const ST: Record<string, string> = { unpaid: "پرداخت‌نشده", paid: "پرداخت‌شده", void: "باطل" };

export default async function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const [r] = await db.select({ i: subscriptionInvoices, b: businesses, owner: users.name }).from(subscriptionInvoices).innerJoin(businesses, eq(businesses.id, subscriptionInvoices.businessId)).innerJoin(users, eq(users.id, businesses.userId)).where(eq(subscriptionInvoices.id, Number(id)));
  if (!r) notFound();
  // platform staff (accounting) or the customer who owns the invoice
  if (!(auth.user.role === "admin" && adminCan(auth, "accounting")) && auth.business.id !== r.b.id) redirect("/dashboard");
  const bill = await getBilling();
  const i = r.i;
  return (
    <div className="min-h-dvh bg-stone-100 p-4 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center justify-between"><a href="javascript:history.back()" className="text-sm font-semibold text-stone-600">← بازگشت</a><PrintButton /></div>
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-10 shadow print:max-w-none print:rounded-none print:shadow-none">
        <div className="flex items-start justify-between border-b-2 border-stone-800 pb-5"><div><h1 className="text-2xl font-black"><IconText>{<EmojiIcon emoji="" />}</IconText> منوی دیجیتال</h1><p className="mt-1 text-sm text-stone-600">فاکتور فروش اشتراک نرم‌افزار</p></div>
          <table className="text-sm"><tbody><tr><td className="pe-3 text-stone-500">شماره فاکتور:</td><td className="font-black">{toFa(i.number)}</td></tr><tr><td className="pe-3 text-stone-500">تاریخ صدور:</td><td className="font-bold">{fmtJLong(i.createdAt)}</td></tr><tr><td className="pe-3 text-stone-500">وضعیت:</td><td className="font-bold">{ST[i.status]}</td></tr></tbody></table></div>
        <div className="my-6 grid gap-4 text-sm sm:grid-cols-2"><div className="rounded-xl bg-stone-50 p-4"><p className="text-xs font-bold text-stone-500">خریدار</p><p className="mt-1 text-base font-extrabold">{r.b.name}</p><p>{r.owner}</p>{r.b.phone && <p>{r.b.phone}</p>}{r.b.address && <p className="text-stone-600">{r.b.address}</p>}</div>
          <div className="rounded-xl bg-stone-50 p-4"><p className="text-xs font-bold text-stone-500">دوره‌ی اشتراک</p><p className="mt-1 font-bold">{i.periodStart ? `${fmtJ(i.periodStart)} تا ${fmtJ(i.periodEnd ?? i.periodStart)}` : `${toFa(i.months)} ماه (پس از پرداخت فعال می‌شود)`}</p>{i.paidAt && <p className="mt-1 text-stone-600">پرداخت: {fmtJ(i.paidAt)}{i.refNo && ` · پیگیری ${i.refNo}`}</p>}</div></div>
        <table className="w-full border-collapse text-sm"><thead><tr className="bg-stone-100"><th className="border border-stone-300 p-2.5 text-start">شرح</th><th className="border border-stone-300 p-2.5">مدت</th><th className="border border-stone-300 p-2.5 text-end">مبلغ (تومان)</th></tr></thead>
          <tbody><tr><td className="border border-stone-300 p-2.5">اشتراک نرم‌افزار — پلن {planName(i.plan)}{i.note && <span className="block text-xs text-stone-500">{i.note}</span>}</td><td className="border border-stone-300 p-2.5 text-center">{toFa(i.months)} ماه</td><td className="border border-stone-300 p-2.5 text-end">{formatNumber(i.amount + i.discount)}</td></tr>
            {i.discount > 0 && <tr><td colSpan={2} className="border border-stone-300 p-2.5">تخفیف</td><td className="border border-stone-300 p-2.5 text-end text-rose-600">-{formatNumber(i.discount)}</td></tr>}
            <tr className="bg-stone-100 font-black"><td colSpan={2} className="border border-stone-300 p-2.5">مبلغ قابل پرداخت</td><td className="border border-stone-300 p-2.5 text-end">{formatNumber(i.amount)}</td></tr></tbody></table>
        <p className="mt-3 text-sm"><b>به حروف:</b> {amountInWords(i.amount)} تومان</p>
        {i.status !== "paid" && (bill.card || bill.sheba) && <div className="mt-6 rounded-xl border-2 border-dashed border-stone-300 p-4 text-sm leading-8"><p className="font-bold">اطلاعات پرداخت</p>{bill.bank && <p>بانک {bill.bank}{bill.owner && ` — به نام ${bill.owner}`}</p>}{bill.card && <p dir="ltr" style={{ textAlign: "start" }}>کارت: {bill.card}</p>}{bill.sheba && <p dir="ltr" style={{ textAlign: "start" }}>شبا: {bill.sheba}</p>}{bill.note && <p className="text-xs text-stone-500">{bill.note}</p>}</div>}
        <p className="mt-10 text-center text-[11px] text-stone-400">این فاکتور توسط سامانه صادر شده است.</p>
      </div>
    </div>
  );
}
