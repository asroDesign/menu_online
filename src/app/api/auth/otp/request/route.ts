import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { normalizedPhone, requestOtp } from "@/lib/platform-sms";

export async function POST(req: Request) {
  try {
    const b = await readJson(req);
    const phone = normalizedPhone(b.phone);
    const purpose = b.purpose === "register" ? "register" : "login";
    if (!phone) throw new HttpError(400, "شماره موبایل معتبر وارد کنید");
    await enforceRateLimit(req, "otp-request-ip", "all", 30, 60 * 60_000);
    const name = String(b.name ?? "").trim().slice(0, 100);
    const businessName = String(b.businessName ?? "").trim().slice(0, 120);
    if (purpose === "register" && (!name || businessName.length < 2)) throw new HttpError(400, "نام و نام کسب‌وکار را وارد کنید");
    return Response.json(await requestOtp(phone, { purpose, name, businessName }, req));
  } catch (e) { return errorResponse(e); }
}
