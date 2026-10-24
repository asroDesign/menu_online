import { and, asc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { diningTables, reservations } from "@/db/schema";
import { HttpError, type Business } from "@/lib/auth";
import { isOpenForDuration } from "@/lib/business-time";
import type { Settings } from "@/lib/plans";

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";

export function reservationPhone(value: string) {
  return value.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/\D/g, "");
}

export type ReservationTableOption = { id: number; name: string; zone: string; capacity: number };

function reservationConfig(biz: Business) {
  const settings = (biz.settings ?? {}) as Settings;
  const config = settings.reservations ?? { enabled: true, requireDeposit: false, depositPerGuest: 0, durationMinutes: 90 };
  if (config.enabled === false) throw new HttpError(403, "رزرو آنلاین برای این رستوران فعال نیست");
  const durationMinutes = Math.min(480, Math.max(30, config.durationMinutes ?? 90));
  if (config.requireDeposit && Math.max(0, config.depositPerGuest ?? 0) < 1000)
    throw new HttpError(400, "رستوران هنوز مبلغ پیش‌پرداخت را تنظیم نکرده است؛ لطفاً تلفنی رزرو کنید.");
  return { settings, config, durationMinutes };
}

export async function getAvailableReservationTables(biz: Business, startsAt: Date, guestCount: number): Promise<ReservationTableOption[]> {
  const { settings, durationMinutes } = reservationConfig(biz);
  if (!isOpenForDuration(settings, startsAt, durationMinutes)) throw new HttpError(400, "زمان انتخاب‌شده با ساعت کاری رستوران هم‌خوانی ندارد.");
  const endAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const checkFrom = new Date(startsAt.getTime() - 8 * 60 * 60_000);
  const [tables, booked] = await Promise.all([
    db.select({ id: diningTables.id, name: diningTables.name, zone: diningTables.zone, capacity: diningTables.capacity })
      .from(diningTables)
      .where(and(eq(diningTables.businessId, biz.id), eq(diningTables.operationalStatus, "available"), gte(diningTables.capacity, guestCount)))
      .orderBy(asc(diningTables.capacity), asc(diningTables.id)),
    db.select({ tableId: reservations.tableId, startsAt: reservations.startsAt, durationMinutes: reservations.durationMinutes })
      .from(reservations)
      .where(and(eq(reservations.businessId, biz.id), inArray(reservations.status, ["requested", "confirmed"]), lt(reservations.startsAt, endAt), gt(reservations.startsAt, checkFrom))),
  ]);
  return tables.filter((table) => !booked.some((reservation) => {
    const reservedEnd = reservation.startsAt.getTime() + reservation.durationMinutes * 60_000;
    return reservation.tableId === table.id && reservation.startsAt < endAt && reservedEnd > startsAt.getTime();
  }));
}

export async function createReservation(biz: Business, input: { name: string; phone: string; guestCount: number; startsAt: Date; note: string; reservationType: "normal" | "occasion" | "business"; tableId?: number }) {
  const settings = (biz.settings ?? {}) as Settings;
  const { config, durationMinutes } = reservationConfig(biz);
  const depositRequired = !!config.requireDeposit;
  const depositPerGuest = Math.max(0, config.depositPerGuest ?? 0);
  if (depositPerGuest * input.guestCount > 2_147_483_647) throw new HttpError(400, "مبلغ پیش‌پرداخت این رزرو از سقف مجاز بیشتر است.");
  if (!isOpenForDuration(settings, input.startsAt, durationMinutes)) throw new HttpError(400, "زمان انتخاب‌شده با ساعت کاری رستوران هم‌خوانی ندارد.");

  const endAt = new Date(input.startsAt.getTime() + durationMinutes * 60_000);
  const checkFrom = new Date(input.startsAt.getTime() - 8 * 60 * 60_000);
  return db.transaction(async (tx) => {
    const tables = await tx.select({ id: diningTables.id, capacity: diningTables.capacity, operationalStatus: diningTables.operationalStatus })
      .from(diningTables)
      .where(eq(diningTables.businessId, biz.id))
      .orderBy(asc(diningTables.capacity), asc(diningTables.id))
      .for("update");
    const candidates = tables.filter((table) => table.capacity >= input.guestCount && table.operationalStatus === "available" && (input.tableId === undefined || table.id === input.tableId));
    if (candidates.length === 0) throw new HttpError(400, "میز قابل رزرو با ظرفیت این تعداد نفر در سرویس نیست.");
    const booked = await tx.select({ tableId: reservations.tableId, startsAt: reservations.startsAt, durationMinutes: reservations.durationMinutes })
      .from(reservations)
      .where(and(
        eq(reservations.businessId, biz.id),
        inArray(reservations.status, ["requested", "confirmed"]),
        lt(reservations.startsAt, endAt),
        gt(reservations.startsAt, checkFrom),
      ));
    const table = candidates.find((candidate) => !booked.some((reservation) => {
      const reservedEnd = reservation.startsAt.getTime() + reservation.durationMinutes * 60_000;
      return reservation.tableId === candidate.id && reservation.startsAt < endAt && reservedEnd > input.startsAt.getTime();
    }));
    if (!table) throw new HttpError(409, "برای این زمان میز خالی وجود ندارد؛ زمان دیگری انتخاب کنید.");
    const depositAmount = depositRequired ? depositPerGuest * input.guestCount : 0;
    const [row] = await tx.insert(reservations).values({
      businessId: biz.id,
      tableId: table.id,
      customerName: input.name,
      customerPhone: input.phone,
      guestCount: input.guestCount,
      reservationType: input.reservationType,
      startsAt: input.startsAt,
      durationMinutes,
      status: "requested",
      depositAmount,
      depositStatus: depositRequired ? "pending" : "not_required",
      note: input.note,
    }).returning();
    return row;
  });
}
