"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatNumber, formatPrice, toFa } from "@/lib/format";
import { PLAN_KEYS, planName } from "@/lib/plans";
import type { BillingTerm, PricedPlan } from "@/lib/plan-pricing";
import { Badge, Button, Card, Field, Icon, Input, Select, Skeleton, useToast } from "@/components/ui";

type PlanData = { plan: string; plans: PricedPlan[]; endsAt: string | null };
type Quote = { plan: string; months: 6 | 12; base: number; termDiscount: number; couponDiscount: number; amount: number; couponCode: string };
type Invoice = { id: number; number: number; amount: number; plan: string; months: number; discount: number; couponCode: string; createdAt: string };

export function SubscriptionCheckout({ initialPlan, initialMonths, invoiceId }: { initialPlan?: string; initialMonths?: number; invoiceId?: number }) {
  const toast = useToast();
  const [data, setData] = useState<PlanData | null>(null);
  const [gateways, setGateways] = useState<{ id: string; name: string }[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [plan, setPlan] = useState(initialPlan && PLAN_KEYS.includes(initialPlan as never) ? initialPlan : "premium");
  const [months, setMonths] = useState<BillingTerm>(initialMonths === 6 ? 6 : 12);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [provider, setProvider] = useState("");
  const [issuedInvoice, setIssuedInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fixedInvoice = invoiceId ? invoice : issuedInvoice;

  useEffect(() => {
    Promise.all([
      api<PlanData>("/api/plan"),
      api<{ gateways: { id: string; name: string }[] }>("/api/subscription/gateways"),
      invoiceId ? api<{ items: Invoice[] }>(`/api/subscription/invoices?id=${invoiceId}`) : Promise.resolve({ items: [] as Invoice[] }),
    ]).then(([p, g, i]) => {
      setData(p); setGateways(g.gateways); setProvider(g.gateways[0]?.id ?? "");
      if (invoiceId) setInvoice(i.items[0] ?? null);
      else if (initialPlan && PLAN_KEYS.includes(initialPlan as never)) setPlan(initialPlan);
    }).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  }, [invoiceId, initialPlan]);

  useEffect(() => {
    if (!data || invoiceId) return;
    setError("");
    api<Quote>("/api/subscription/quote", { method: "POST", body: { plan, months, couponCode: appliedCoupon } }).then(setQuote).catch((e) => { setQuote(null); setError((e as Error).message); });
  }, [data, plan, months, appliedCoupon, invoiceId]);

  const selected = useMemo(() => data?.plans.find((x) => x.key === plan), [data, plan]);
  async function applyCoupon() {
    setError(""); setBusy("coupon");
    try { const result = await api<Quote>("/api/subscription/quote", { method: "POST", body: { plan, months, couponCode: couponInput } }); setQuote(result); setAppliedCoupon(couponInput.trim().toUpperCase()); setError(""); toast(couponInput.trim() ? "کد تخفیف اعمال شد" : "کد تخفیف حذف شد"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }
  async function pay() {
    setError(""); setBusy("pay");
    try {
      let target = fixedInvoice;
      if (!target) {
        const result = await api<{ item: Invoice; paid: boolean }>("/api/subscription/checkout", { method: "POST", body: { plan, months, couponCode: appliedCoupon } });
        target = result.item; setIssuedInvoice(result.item);
        if (result.paid) { window.location.assign("/dashboard/plan?payment=success"); return; }
      }
      if (!provider) throw new Error("مدیر سامانه هنوز درگاهی برای پرداخت فعال نکرده است");
      const result = await api<{ url: string }>("/api/subscription/payment", { method: "POST", body: { invoiceId: target.id, provider } });
      window.location.assign(result.url);
    } catch (e) { setError((e as Error).message); setBusy(""); }
  }

  if (loading) return <main className="mx-auto max-w-4xl p-4 sm:p-8"><Skeleton className="h-96 rounded-3xl" /></main>;
  const amount = invoice ? invoice.amount : fixedInvoice?.amount ?? quote?.amount ?? selected?.terms[months].total ?? 0;
  const fixed = Boolean(invoiceId && invoice) || Boolean(issuedInvoice);
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12" dir="rtl">
      <header className="mb-6"><a href="/dashboard/plan" className="text-sm font-bold text-primary">← بازگشت به پلن‌ها</a><h1 className="mt-4 text-2xl font-black sm:text-3xl">پرداخت اشتراک</h1><p className="mt-2 text-sm text-base-content/60">فاکتور خرید یا تمدید پلن را بررسی و درگاه پرداخت را انتخاب کنید.</p></header>
      {fixedInvoice ? <Card className="mb-5 space-y-3 p-5"><div className="flex items-center justify-between"><h2 className="font-extrabold">فاکتور #{toFa(fixedInvoice.number)}</h2><Badge color="amber">در انتظار پرداخت</Badge></div><p>پلن {planName(fixedInvoice.plan)} · دوره {toFa(fixedInvoice.months)} ماهه</p>{fixedInvoice.couponCode && <p className="text-sm text-emerald-700">کد تخفیف: {fixedInvoice.couponCode}</p>}<p className="text-xl font-black">{formatPrice(fixedInvoice.amount)}</p></Card> : invoiceId ? <p className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error || "فاکتور پرداخت‌نشده پیدا نشد یا مهلت پرداخت آن پایان یافته است."}</p> : data && (
        <Card className="mb-5 space-y-5 p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><Field label="پلن"><Select value={plan} onChange={(e) => { setPlan(e.target.value); setAppliedCoupon(""); setCouponInput(""); setQuote(null); }}><option value="basic">{data.plans.find((p) => p.key === "basic")?.name ?? "پایه"}</option>{data.plans.filter((p) => p.key !== "basic").map((p) => <option key={p.key} value={p.key}>{p.name}{p.key === data.plan ? " · پلن فعلی" : ""}</option>)}</Select></Field><Field label="مدت اشتراک"><Select value={months} onChange={(e) => { setMonths(Number(e.target.value) as BillingTerm); setAppliedCoupon(""); setCouponInput(""); setQuote(null); }}><option value={6}>شش‌ماهه</option><option value={12}>سالانه</option></Select></Field></div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><Field label="کد تخفیف"><Input dir="ltr" className="text-left uppercase" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="کد را وارد کنید" /></Field><Button variant="secondary" onClick={applyCoupon} loading={busy === "coupon"}>اعمال کد</Button></div>
          {quote && <div className="space-y-2 rounded-2xl bg-base-200/60 p-4 text-sm"><div className="flex justify-between"><span>قیمت دوره</span><span>{formatNumber(quote.base)} تومان</span></div>{quote.termDiscount > 0 && <div className="flex justify-between text-emerald-700"><span>تخفیف دوره</span><span>− {formatNumber(quote.termDiscount)} تومان</span></div>}{quote.couponDiscount > 0 && <div className="flex justify-between text-emerald-700"><span>تخفیف کد {quote.couponCode}</span><span>− {formatNumber(quote.couponDiscount)} تومان</span></div>}<div className="flex justify-between border-t border-base-300 pt-2 text-base font-extrabold"><span>مبلغ قابل پرداخت</span><span>{formatNumber(quote.amount)} تومان</span></div></div>}
        </Card>
      )}
      {!fixed && !invoice && !data && <p className="rounded-xl bg-rose-50 p-4 text-rose-700">اطلاعات پلن بارگیری نشد.</p>}
      <Card className="space-y-4 p-5 sm:p-6"><h2 className="font-extrabold">روش پرداخت</h2>
        {gateways.length ? <div className="grid gap-3 sm:grid-cols-2">{gateways.map((g) => <label key={g.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${provider === g.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-base-300 hover:border-primary/40"}`}><input type="radio" name="payment-gateway" value={g.id} checked={provider === g.id} onChange={() => setProvider(g.id)} /><span className="flex size-10 items-center justify-center rounded-xl bg-base-200"><Icon name="wallet" className="size-5" /></span><span className="font-bold">{g.name}</span></label>)}</div> : <p className="rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-900">درگاه پرداخت آنلاین هنوز توسط مدیر سامانه فعال نشده است. لطفاً کمی بعد دوباره بررسی کنید یا با پشتیبانی تماس بگیرید.</p>}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-200 pt-4"><p className="text-sm text-base-content/60">مبلغ: <b className="text-base-content">{formatPrice(amount)}</b></p><Button size="lg" loading={busy === "pay"} disabled={(amount > 0 && !provider) || (Boolean(invoiceId) && !invoice)} onClick={pay}><Icon name="lock" className="size-4" />{amount === 0 ? "ثبت پلن رایگان" : "پرداخت و فعال‌سازی پلن"}</Button></div>
      </Card>
      <p className="mt-4 text-center text-xs leading-6 text-base-content/45">پس از تأیید پرداخت در درگاه، اشتراک شما به‌صورت خودکار فعال یا تمدید می‌شود.</p>
    </main>
  );
}
