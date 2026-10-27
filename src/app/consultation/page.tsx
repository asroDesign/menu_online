import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LeadForm } from "@/components/marketing/lead-form";
import { SiteFooter } from "@/components/marketing/rich-content";
import { PLANS } from "@/lib/plans";
import { isBillingTerm, TERM_LABELS } from "@/lib/plan-pricing";
export const metadata: Metadata = { title: "درخواست مشاوره رایگان", description: "برای انتخاب امکانات مناسب کسب‌وکار خود، درخواست مشاوره ثبت کنید." };
export default async function ConsultationPage({searchParams}:{searchParams:Promise<{plan?:string;months?:string}>}) {
  const params=await searchParams;
  const plan=PLANS.find(p=>p.key===params.plan);
  const rawTerm = Number(params.months);
  const term = isBillingTerm(rawTerm) ? rawTerm : null;
  if (plan && term) redirect(`/checkout?plan=${plan.key}&months=${term}`);
  const selection=plan && term ? `درخواست پلن ${plan.name} · دوره ${TERM_LABELS[term]}` : "";
  return <main className="min-h-dvh bg-base-200/40"><header className="bg-primary px-5 py-14 text-primary-content"><div className="mx-auto max-w-5xl"><h1 className="text-4xl font-black">انتخاب بهتر، با یک گفت‌وگو</h1><p className="mt-3 max-w-2xl leading-8 opacity-85">نیازهای کسب‌وکارتان را بنویسید تا برای معرفی راهکار مناسب با شما تماس بگیریم.</p></div></header><section className="mx-auto max-w-3xl px-5 py-10">{selection && <p className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm font-bold">{selection}</p>}<LeadForm key={selection} kind="consultation" title="فرم درخواست مشاوره" initialSubject={selection}/></section><SiteFooter/></main>;
}
