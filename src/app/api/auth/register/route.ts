import { errorResponse, HttpError } from "@/lib/auth";

/** Legacy email registration is disabled; new accounts must complete the verified phone flow. */
export async function POST() {
  try {
    throw new HttpError(410, "ثبت‌نام با شماره موبایل و کد تأیید انجام می‌شود؛ از صفحه ثبت‌نام استفاده کنید");
  } catch (error) {
    return errorResponse(error);
  }
}
