import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { affiliates } from "@/db/schema";
import { errorResponse, hashPassword, HttpError, readJson } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

const clean = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
const EMAIL = /^\S+@\S+\.\S+$/;

export async function POST(req: Request) {
  try {
    await enforceRateLimit(req, "affiliate-apply", "website", 5, 60 * 60_000);
    const b = await readJson(req);
    const name = clean(b.name, 100), email = clean(b.email, 150).toLowerCase(), phone = clean(b.phone, 30);
    const password = String(b.password ?? "");
    if (name.length < 2 || !EMAIL.test(email) || phone.length < 8 || password.length < 8) throw new HttpError(400, "نام، ایمیل، شماره تماس و گذرواژه حداقل ۸ کاراکتری را کامل کنید");
    const [exists] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.email, email));
    if (exists) throw new HttpError(409, "با این ایمیل قبلاً درخواست همکاری ثبت شده است");
    const referralCode = `M${randomBytes(5).toString("hex").toUpperCase()}`;
    const [item] = await db.insert(affiliates).values({ name, email, phone, passwordHash: hashPassword(password), referralCode, channel: clean(b.channel, 100), website: clean(b.website, 200), introduction: clean(b.introduction, 1500), status: "pending" }).returning({ id: affiliates.id });
    return Response.json({ item: { id: item.id, status: "pending" } }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
