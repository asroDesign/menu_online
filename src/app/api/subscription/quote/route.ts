import { withAuth } from "@/lib/auth";
import { subscriptionQuote } from "@/lib/subscription-checkout";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, { business }) => {
  const b = await req.json().catch(() => ({}));
  return Response.json(await subscriptionQuote(b.plan, b.months, b.couponCode, false, undefined, business.id));
}, { manager: true, allowUnpaid: true });
