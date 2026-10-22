import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { getPublicMenu } from "@/lib/public-menu";
import { enforceRateLimit } from "@/lib/rate-limit";
import { normalizedPhone, requestCustomerOtp } from "@/lib/platform-sms";

type Context = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
    if (!business) throw new HttpError(404, "منو پیدا نشد");
    const body = await readJson(req);
    const phone = normalizedPhone(body.phone);
    if (!phone) throw new HttpError(400, "شماره موبایل معتبر وارد کنید");
    await enforceRateLimit(req, "customer-otp-preflight", String(business.id), 60, 60_000);
    if (!await getPublicMenu(slug)) throw new HttpError(404, "منو پیدا نشد");
    const result = await requestCustomerOtp(phone, business.id, req);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
