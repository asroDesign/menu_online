import { db } from "@/db";
import { leadRequests } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

const clean = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(req: Request) {
  try {
    await enforceRateLimit(req, "public-lead", "website", 8, 60_000);
    const b = await readJson(req);
    const kind = String(b.kind ?? "contact");
    if (!["contact", "consultation", "demo"].includes(kind)) throw new HttpError(400, "نوع درخواست معتبر نیست");
    const name = clean(b.name, 100);
    const phone = clean(b.phone, 30).replace(/[^\d+]/g, "");
    const email = clean(b.email, 150).toLowerCase();
    const businessName = clean(b.businessName, 120);
    const subject = clean(b.subject, 160);
    const message = clean(b.message, 3000);
    if (name.length < 2 || (!phone && !/^\S+@\S+\.\S+$/.test(email))) throw new HttpError(400, "نام و حداقل یک راه تماس معتبر وارد کنید");
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "ایمیل معتبر نیست");
    if (kind === "consultation" && !phone) throw new HttpError(400, "برای درخواست مشاوره شماره تماس لازم است");
    const preferredAt = b.preferredAt ? new Date(String(b.preferredAt)) : null;
    if (preferredAt && Number.isNaN(preferredAt.getTime())) throw new HttpError(400, "زمان درخواستی معتبر نیست");
    const [item] = await db.insert(leadRequests).values({ kind, name, phone, email, businessName, subject, message, preferredAt, source: "website" }).returning({ id: leadRequests.id, createdAt: leadRequests.createdAt });
    return Response.json({ item }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
