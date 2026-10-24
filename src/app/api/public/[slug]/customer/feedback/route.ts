import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, customerFeedback, customers } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getPublicMenu } from "@/lib/public-menu";
import { publicCustomerId } from "@/lib/public-customer-session";
import { customerFeedbackEnabled, parseCustomerFeedbackInput } from "@/lib/customer-feedback-core";

type Context = { params: Promise<{ slug: string }> };

async function verifiedContext(slug: string) {
  const [business] = await db.select({ id: businesses.id, settings: businesses.settings })
    .from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (!business || !await getPublicMenu(slug)) throw new HttpError(404, "منو پیدا نشد");
  if (!customerFeedbackEnabled(business.settings)) throw new HttpError(404, "این بخش در دسترس نیست");
  const customerId = await publicCustomerId(slug, business.id);
  if (!customerId) throw new HttpError(401, "برای ارسال پیشنهاد یا شکایت ابتدا با شماره موبایل وارد پروفایل شوید");
  const [customer] = await db.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.businessId, business.id))).limit(1);
  if (!customer) throw new HttpError(401, "نشست مشتری معتبر نیست؛ دوباره وارد شوید");
  return { business, customer };
}

export async function GET(req: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const { business, customer } = await verifiedContext(slug);
    await enforceRateLimit(req, "customer-feedback-read", `${business.id}:${customer.id}`, 60, 60_000, false);
    const items = await db.select({
      id: customerFeedback.id,
      type: customerFeedback.type,
      message: customerFeedback.message,
      status: customerFeedback.status,
      createdAt: customerFeedback.createdAt,
    }).from(customerFeedback).where(and(
      eq(customerFeedback.businessId, business.id),
      eq(customerFeedback.customerId, customer.id),
    )).orderBy(desc(customerFeedback.createdAt), desc(customerFeedback.id)).limit(10);
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const { business, customer } = await verifiedContext(slug);
    await enforceRateLimit(req, "customer-feedback-submit", `${business.id}:${customer.id}`, 5, 24 * 60 * 60_000, false);
    const input = parseCustomerFeedbackInput(await readJson(req, 8 * 1024));
    if (!input) throw new HttpError(400, "نوع پیام را انتخاب کنید و متن ۱۰ تا ۱۵۰۰ نویسه‌ای بنویسید");
    const [item] = await db.insert(customerFeedback).values({
      businessId: business.id,
      customerId: customer.id,
      ...input,
    }).returning({
      id: customerFeedback.id,
      type: customerFeedback.type,
      message: customerFeedback.message,
      status: customerFeedback.status,
      createdAt: customerFeedback.createdAt,
    });
    return Response.json({ item, message: "پیام شما برای مدیریت رستوران ارسال شد" }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
