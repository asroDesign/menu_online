import { cookies } from "next/headers";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { normalizedPhone, requestOtp } from "@/lib/platform-sms";
import { REGISTRATION_FLOW_COOKIE, signRegistrationFlow } from "@/lib/registration-flow";

export async function POST(req: Request) {
  try {
    const b = await readJson(req);
    const phone = normalizedPhone(b.phone);
    const purpose = b.purpose === "register" ? "register" : "login";
    if (!phone) throw new HttpError(400, "شماره موبایل معتبر وارد کنید");
    await enforceRateLimit(req, "otp-request-ip", "all", 30, 60 * 60_000);
    const result = await requestOtp(phone, { purpose }, req);
    const jar = await cookies();
    if (purpose === "register") {
      const secret = process.env.OTP_SECRET ?? "";
      if (secret.length < 32) throw new HttpError(503, "ورود پیامکی به‌درستی پیکربندی نشده است");
      jar.set(REGISTRATION_FLOW_COOKIE, signRegistrationFlow({ challengeId: result.challengeId }, secret), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/auth",
        maxAge: 20 * 60,
      });
    } else {
      jar.set(REGISTRATION_FLOW_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth", maxAge: 0 });
    }
    return Response.json(result);
  } catch (e) { return errorResponse(e); }
}
