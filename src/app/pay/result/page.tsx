import Link from "next/link";
import { toFa } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "نتیجه پرداخت" };

export default async function PayResult({ searchParams }: { searchParams: Promise<{ ok?: string; msg?: string; slug?: string; n?: string; ref?: string }> }) {
  const q = await searchParams;
  const ok = q.ok === "1";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f6f5f3] p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl ring-1 ring-stone-100">
        <div className="text-6xl">{ok ? "✅" : "❌"}</div>
        <h1 className="mt-4 text-xl font-extrabold">{ok ? "پرداخت با موفقیت انجام شد" : "پرداخت ناموفق بود"}</h1>
        {q.n && <p className="mt-3 text-sm text-stone-600">شماره سفارش: <b>#{toFa(q.n)}</b></p>}
        {q.ref && <p className="mt-1 text-xs text-stone-500">کد پیگیری: <span dir="ltr">{q.ref}</span></p>}
        {!ok && q.msg && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{q.msg}</p>}
        {q.slug && <Link href={`/m/${q.slug}`} className="mt-6 inline-block rounded-xl bg-stone-900 px-6 py-3 text-sm font-bold text-white">بازگشت به منو</Link>}
      </div>
    </div>
  );
}
