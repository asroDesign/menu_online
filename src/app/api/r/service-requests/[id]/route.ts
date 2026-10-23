import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { waiterServiceRequests } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";

export const PATCH = withAuth<{ id: string }>(async (req, { business }, { id }) => {
  const body = await readJson(req);
  if (body.action !== "resolve") throw new HttpError(400, "عملیات درخواست معتبر نیست");
  const [item] = await db.update(waiterServiceRequests)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(
      eq(waiterServiceRequests.id, Number(id)),
      eq(waiterServiceRequests.businessId, business.id),
      eq(waiterServiceRequests.status, "open"),
    )).returning({ id: waiterServiceRequests.id });
  if (!item) throw new HttpError(404, "درخواست باز پیدا نشد");
  return Response.json({ item: { ...item, status: "resolved" } });
}, { feature: "waiter_call", manager: true, roles: ["waiter", "cashier"] });
