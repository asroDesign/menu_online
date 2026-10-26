import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { hasAny } from "@/lib/plans";
import { logInfo } from "@/lib/logger";
import { offlineAuth } from "@/lib/offline-pos";
import { createReservation, reservationPhone } from "@/lib/reservations";
import { syncOfflineReservationStatus } from "@/lib/offline-reservations";

export const dynamic = "force-dynamic";

type Command = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "reservations";
  action: "create";
  baseDataset: "reservations";
  baseSnapshotId: "";
  baseRevision: 0;
  payload: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function parseCommand(raw: unknown): Command {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.module !== "reservations" || raw.action !== "create") throw new HttpError(400, "قالب درخواست رزرو آفلاین معتبر نیست");
  const commandKeys = ["schemaVersion", "id", "businessId", "module", "action", "baseDataset", "baseSnapshotId", "baseRevision", "payload"];
  if (Object.keys(raw).some((key) => !commandKeys.includes(key))) throw new HttpError(400, "فرمان رزرو فیلد ناشناخته دارد");
  if (typeof raw.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.id)) throw new HttpError(400, "شناسهٔ فرمان رزرو معتبر نیست");
  if (!Number.isSafeInteger(raw.businessId) || Number(raw.businessId) < 1) throw new HttpError(400, "کسب‌وکار فرمان رزرو معتبر نیست");
  if (raw.baseDataset !== "reservations" || raw.baseSnapshotId !== "" || raw.baseRevision !== 0 || !isRecord(raw.payload)) throw new HttpError(400, "ساختار پایهٔ فرمان رزرو معتبر نیست");

  const payload = raw.payload;
  const payloadKeys = ["name", "phone", "guestCount", "startsAt", "note", "reservationType", "tableId"];
  if (Object.keys(payload).some((key) => !payloadKeys.includes(key))) throw new HttpError(400, "درخواست رزرو فیلد ناشناخته دارد");
  if (typeof payload.name !== "string" || payload.name.trim().length < 2 || payload.name.trim().length > 80) throw new HttpError(400, "نام مشتری معتبر نیست");
  if (typeof payload.phone !== "string" || reservationPhone(payload.phone).length < 10 || reservationPhone(payload.phone).length > 15) throw new HttpError(400, "شمارهٔ موبایل مشتری معتبر نیست");
  if (!Number.isSafeInteger(payload.guestCount) || Number(payload.guestCount) < 1 || Number(payload.guestCount) > 30) throw new HttpError(400, "تعداد مهمان باید بین ۱ تا ۳۰ نفر باشد");
  if (typeof payload.startsAt !== "string" || !Number.isFinite(new Date(payload.startsAt).getTime())) throw new HttpError(400, "زمان رزرو معتبر نیست");
  if (typeof payload.note !== "string" || payload.note.length > 300) throw new HttpError(400, "توضیح رزرو معتبر نیست");
  if (!["normal", "occasion", "business"].includes(String(payload.reservationType))) throw new HttpError(400, "نوع رزرو معتبر نیست");
  if (payload.tableId != null && (!Number.isSafeInteger(payload.tableId) || Number(payload.tableId) < 1)) throw new HttpError(400, "میز انتخاب‌شده معتبر نیست");
  return raw as unknown as Command;
}

export async function POST(req: Request) {
  try {
    const raw = await readJson(req, 64_000);
    if (raw && typeof raw === "object" && !Array.isArray(raw) && "action" in raw && raw.action === "set_status") {
      return Response.json(await syncOfflineReservationStatus(req, raw), { headers: { "Cache-Control": "no-store" } });
    }
    const command = parseCommand(raw);
    const { terminal, business, features } = await offlineAuth(req);
    if (command.businessId !== business.id) throw new HttpError(403, "درخواست رزرو متعلق به کسب‌وکار این صندوق نیست");
    const commandHash = createHash("sha256").update(canonical(command)).digest("hex");
    const [previous] = await db.select().from(reservations).where(and(eq(reservations.businessId, business.id), eq(reservations.sourceCommandId, command.id))).limit(1);
    if (previous) {
      if (previous.sourceCommandHash !== commandHash) throw new HttpError(409, "شناسهٔ درخواست رزرو قبلاً با اطلاعات دیگری ثبت شده است");
      logInfo("offline.reservation_sync_replayed", { businessId: business.id, terminalId: terminal.id, reservationId: previous.id, commandId: command.id });
      return Response.json({ commandId: command.id, state: "applied", receipt: "reservation-" + previous.id, reservationId: previous.id }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "همگام‌سازی صندوق آفلاین در اشتراک فعلی فعال نیست");
    if (!hasAny(features, "reservations")) throw new HttpError(403, "رزرو میز در اشتراک فعلی فعال نیست");

    const startsAt = new Date(command.payload.startsAt as string);
    const item = await createReservation(business, {
      name: (command.payload.name as string).trim(),
      phone: reservationPhone(command.payload.phone as string),
      guestCount: Number(command.payload.guestCount),
      startsAt,
      note: (command.payload.note as string).trim(),
      reservationType: command.payload.reservationType as "normal" | "occasion" | "business",
      ...(command.payload.tableId == null ? {} : { tableId: Number(command.payload.tableId) }),
    }, { id: command.id, hash: commandHash });
    const receipt = `reservation-${item.id}`;
    logInfo("offline.reservation_synced", { businessId: business.id, terminalId: terminal.id, reservationId: item.id, commandId: command.id });
    return Response.json({ commandId: command.id, state: "applied", receipt, reservationId: item.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
