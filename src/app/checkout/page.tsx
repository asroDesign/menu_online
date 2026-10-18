import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { SubscriptionCheckout } from "@/components/subscription-checkout";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; months?: string; invoiceId?: string }> }) {
  const query = await searchParams;
  const auth = await getAuth();
  if (!auth) {
    const params = new URLSearchParams();
    if (query.plan) params.set("plan", query.plan);
    if (query.months) params.set("months", query.months);
    if (query.invoiceId) params.set("invoiceId", query.invoiceId);
    const returnTo = `/checkout${params.size ? `?${params.toString()}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }
  return <SubscriptionCheckout initialPlan={query.plan} initialMonths={Number(query.months)} invoiceId={Number(query.invoiceId) || undefined} />;
}
