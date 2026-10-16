import { eq } from "drizzle-orm";
import { db } from "@/db";
import { affiliates } from "@/db/schema";
import { createAffiliateSession } from "@/lib/affiliate-auth";
import { errorResponse, HttpError, readJson, verifyPassword } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const b = await readJson(req);
    const email = String(b.email ?? "").trim().toLowerCase();
    await enforceRateLimit(req, "affiliate-login", email || "unknown", 8, 15 * 60_000);
    const [row] = await db.select().from(affiliates).where(eq(affiliates.email, email));
    if (!row || !verifyPassword(String(b.password ?? ""), row.passwordHash)) throw new HttpError(401, "ایمیل یا گذرواژه صحیح نیست");
    if (row.status !== "active") throw new HttpError(403, row.status === "pending" ? "درخواست همکاری شما هنوز تأیید نشده است" : "حساب همکاری فروش فعال نیست");
    await createAffiliateSession(row.id);
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
