import { eq } from "drizzle-orm";
import { db } from "@/db";
import { couriers } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { myCourier } from "@/lib/courier";

/** Courier toggles their own availability (on shift / off shift). */
export const PATCH = withAuth(
  async (req, auth) => {
    const me = await myCourier(auth);
    const b = await readJson(req);
    if (!["available", "busy", "off"].includes(String(b.status))) throw new HttpError(400, "وضعیت نامعتبر است");
    await db.update(couriers).set({ status: String(b.status) }).where(eq(couriers.id, me.id));
    return Response.json({ ok: true, status: b.status });
  },
  { feature: "courier", courierOk: true },
);
