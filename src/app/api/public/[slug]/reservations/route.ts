import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { hasAny } from "@/lib/plans";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createReservation, getAvailableReservationTables, reservationPhone } from "@/lib/reservations";
import { logInfo } from "@/lib/logger";
import { isReadOnlyDemoSlug } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    if (isReadOnlyDemoSlug(slug)) throw new HttpError(404, "رستوران پیدا نشد");
    const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
    if (!biz || biz.isSuspended) throw new HttpError(404, "رستوران پیدا نشد");
    const features = await featuresOf(biz);
    if (!hasAny(features, "reservations")) throw new HttpError(403, "رزرو میز در تعرفه این رستوران فعال نیست");
    await enforceRateLimit(req, "public-reservation-availability", slug, 30, 60_000);
    const url = new URL(req.url);
    const startsAt = new Date(String(url.searchParams.get("startsAt") ?? ""));
    const guestCount = Math.floor(Number(url.searchParams.get("guestCount")));
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 30) throw new HttpError(400, "تعداد مهمان باید بین ۱ تا ۳۰ نفر باشد.");
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() + 30 * 60_000 || startsAt.getTime() > Date.now() + 90 * 86400_000)
      throw new HttpError(400, "زمان رزرو باید از نیم ساعت آینده تا ۹۰ روز آینده باشد.");
    const tables = await getAvailableReservationTables(biz, startsAt, guestCount);
    return Response.json({ items: tables }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    if (isReadOnlyDemoSlug(slug)) throw new HttpError(403, "منوی نمونه فقط برای پیش‌نمایش است و رزرو نمی‌پذیرد");
    const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
    if (!biz || biz.isSuspended) throw new HttpError(404, "رستوران پیدا نشد");
    const features = await featuresOf(biz);
    if (!hasAny(features, "reservations")) throw new HttpError(403, "رزرو میز در تعرفه این رستوران فعال نیست");
    await enforceRateLimit(req, "public-reservation", slug, 5, 60_000);
    await enforceRateLimit(req, "public-reservation-global", slug, 300, 60 * 60_000, false);
    const body = await readJson(req);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const phone = reservationPhone(typeof body.phone === "string" ? body.phone : "");
    const guestCount = Math.floor(Number(body.guestCount));
    const startsAt = new Date(String(body.startsAt ?? ""));
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
    const reservationType = ["normal", "occasion", "business"].includes(String(body.reservationType)) ? String(body.reservationType) as "normal" | "occasion" | "business" : "normal";
    const tableId = body.tableId == null ? undefined : Math.floor(Number(body.tableId));
    if (name.length < 2) throw new HttpError(400, "نام را وارد کنید.");
    if (phone.length < 10 || phone.length > 15) throw new HttpError(400, "شماره موبایل معتبر وارد کنید.");
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 30) throw new HttpError(400, "تعداد مهمان باید بین ۱ تا ۳۰ نفر باشد.");
    if (tableId !== undefined && (!Number.isSafeInteger(tableId) || tableId < 1)) throw new HttpError(400, "میز انتخاب‌شده معتبر نیست.");
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() + 30 * 60_000 || startsAt.getTime() > Date.now() + 90 * 86400_000)
      throw new HttpError(400, "زمان رزرو باید از نیم ساعت آینده تا ۹۰ روز آینده باشد.");
    const item = await createReservation(biz, { name, phone, guestCount, startsAt, note, reservationType, tableId });
    logInfo("reservation.created", { businessId: biz.id, reservationId: item.id, guestCount: item.guestCount, depositAmount: item.depositAmount });
    return Response.json({ item: { id: item.id, status: item.status, depositAmount: item.depositAmount, depositStatus: item.depositStatus, tableId: item.tableId, reservationType: item.reservationType } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
