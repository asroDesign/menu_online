import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/auth";
import { publicCustomerData } from "@/lib/public-customer-data";
import { destroyPublicCustomerSession, publicCustomerId } from "@/lib/public-customer-session";
import { enforceRateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ slug: string }> };

async function currentCustomer(slug: string, req: Request) {
  const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (!business) throw new HttpError(404, "منو پیدا نشد");
  const customerId = await publicCustomerId(slug, business.id);
  if (!customerId) throw new HttpError(401, "برای مشاهده حساب مشتری وارد شوید");
  await enforceRateLimit(req, "customer-session-read", `${business.id}:${customerId}`, 120, 60_000, false);
  const profile = await publicCustomerData(business.id, customerId);
  if (!profile) throw new HttpError(401, "نشست مشتری معتبر نیست؛ دوباره وارد شوید");
  return profile;
}

export async function GET(req: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const profile = await currentCustomer(slug, req);
    return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_req: Request, { params }: Context) {
  try {
    const { slug } = await params;
    await destroyPublicCustomerSession(slug);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
