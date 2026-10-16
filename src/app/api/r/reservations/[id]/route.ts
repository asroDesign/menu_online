import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { logInfo, logWarn } from "@/lib/logger";
import { sendReservationStatusSms } from "@/lib/sms";

export const dynamic = "force-dynamic";

async function notifyReservationStatus(business: Parameters<typeof sendReservationStatusSms>[0], phone: string, reservationId: number, status: "confirmed" | "cancelled") {
  try {
    const result = await sendReservationStatusSms(business, phone, status);
    if (result.status === "sent") logInfo("reservation.sms_sent", { businessId: business.id, reservationId, status });
    else logWarn("reservation.sms_not_sent", { businessId: business.id, reservationId, status, reason: result.detail });
    return result;
  } catch (error) {
    logWarn("reservation.sms_error", { businessId: business.id, reservationId, status, error: error instanceof Error ? error.message : String(error) });
    return { status: "failed" as const, detail: "خطا در ارسال پیامک؛ وضعیت رزرو ذخیره شد" };
  }
}

export const PATCH = withAuth<{ id: string }>(async (req, auth, { id }) => {
  const reservationId = Number(id);
  if (!Number.isInteger(reservationId) || reservationId < 1) throw new HttpError(400, "شناسه رزرو نامعتبر است");
  const body = await readJson(req);
  const [current] = await db.select().from(reservations).where(and(eq(reservations.id, reservationId), eq(reservations.businessId, auth.business.id)));
  if (!current) throw new HttpError(404, "رزرو پیدا نشد");
  if (["cancelled", "completed", "no_show"].includes(current.status)) throw new HttpError(400, "رزرو بسته شده و قابل ویرایش نیست");

  if (body.depositPaid === true) {
    if (current.depositAmount <= 0 || current.depositStatus !== "pending") throw new HttpError(400, "این رزرو پیش‌پرداخت معوق ندارد");
    const method = ["cash", "bank", "card"].includes(String(body.depositMethod)) ? String(body.depositMethod) : "cash";
    const [updated] = await db.update(reservations).set({ depositStatus: "paid", depositMethod: method, status: "confirmed", updatedAt: new Date() })
      .where(and(eq(reservations.id, reservationId), eq(reservations.businessId, auth.business.id), eq(reservations.depositStatus, "pending"), inArray(reservations.status, ["requested", "confirmed"]))).returning();
    if (!updated) throw new HttpError(409, "وضعیت پیش‌پرداخت هم‌زمان تغییر کرده است؛ فهرست را تازه کنید.");
    logInfo("reservation.deposit_recorded", { businessId: auth.business.id, reservationId, method });
    const smsNotification = current.status !== "confirmed" ? await notifyReservationStatus(auth.business, updated.customerPhone, reservationId, "confirmed") : undefined;
    return Response.json({ item: { ...updated, smsNotification } });
  }

  const status = String(body.status ?? "");
  if (!["confirmed", "cancelled", "completed", "no_show"].includes(status)) throw new HttpError(400, "وضعیت رزرو نامعتبر است");
  if (status === "confirmed" && current.depositStatus === "pending") throw new HttpError(400, "ابتدا دریافت پیش‌پرداخت را ثبت کنید.");
  const [updated] = await db.update(reservations).set({ status, updatedAt: new Date() })
    .where(and(eq(reservations.id, reservationId), eq(reservations.businessId, auth.business.id), eq(reservations.status, current.status))).returning();
  if (!updated) throw new HttpError(409, "وضعیت رزرو هم‌زمان تغییر کرده است؛ فهرست را تازه کنید.");
  logInfo("reservation.status_changed", { businessId: auth.business.id, reservationId, status });
  const smsNotification = current.status !== status && (status === "confirmed" || status === "cancelled")
    ? await notifyReservationStatus(auth.business, updated.customerPhone, reservationId, status)
    : undefined;
  return Response.json({ item: { ...updated, smsNotification } });
}, { manager: true, feature: "reservations" });
