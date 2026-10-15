import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { couriers } from "@/db/schema";
import { HttpError, type AuthContext } from "@/lib/auth";

export async function myCourier(auth: AuthContext) {
  const [c] = await db.select().from(couriers).where(and(eq(couriers.userId, auth.user.id), eq(couriers.businessId, auth.business.id)));
  if (!c) throw new HttpError(403, "حساب پیک پیدا نشد");
  return c;
}
