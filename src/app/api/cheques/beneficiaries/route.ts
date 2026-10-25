import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chequeBeneficiaries } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { normalizeIranianDigits, normalizeIranianMobile } from "@/lib/cheque-reminders-core";

const options = { feature: "cheque_register", manager: true, roles: ["accountant"] };

function validNationalId(value: string) {
  if (!/^\d{10}$/.test(value) || /^([0-9])\1{9}$/.test(value)) return false;
  const check = Number(value[9]);
  const sum = value.slice(0, 9).split("").reduce((total, digit, index) => total + Number(digit) * (10 - index), 0) % 11;
  return sum < 2 ? check === sum : check === 11 - sum;
}

export const GET = withAuth(async (_req, auth) => {
  const items = await db.select({
    id: chequeBeneficiaries.id,
    fullName: chequeBeneficiaries.fullName,
    nationalId: chequeBeneficiaries.nationalId,
    phone: chequeBeneficiaries.phone,
  }).from(chequeBeneficiaries)
    .where(eq(chequeBeneficiaries.businessId, auth.business.id))
    .orderBy(asc(chequeBeneficiaries.fullName))
    .limit(500);
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}, options);

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 4 * 1024);
  const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const nationalId = normalizeIranianDigits(body.nationalId).replace(/\D/g, "");
  const phone = normalizeIranianMobile(body.phone);
  if (fullName.length < 2) throw new HttpError(400, "نام و نام خانوادگی ذی‌نفع را وارد کنید.");
  if (nationalId && !validNationalId(nationalId)) throw new HttpError(400, "کد ملی ذی‌نفع معتبر نیست.");
  if (body.phone && !phone) throw new HttpError(400, "شماره تلفن ذی‌نفع معتبر نیست.");
  const [item] = await db.insert(chequeBeneficiaries).values({
    businessId: auth.business.id,
    fullName,
    nationalId,
    phone,
  }).onConflictDoNothing().returning({
    id: chequeBeneficiaries.id,
    fullName: chequeBeneficiaries.fullName,
    nationalId: chequeBeneficiaries.nationalId,
    phone: chequeBeneficiaries.phone,
  });
  if (!item) throw new HttpError(409, "ذی‌نفعی با این کد ملی قبلاً ثبت شده است.");
  return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, options);
