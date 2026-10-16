import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, errorResponse, readJson } from "@/lib/auth";
import { DEMO_EMAIL, ensureDemoData } from "@/lib/seed";
import { DEMO_ENABLED } from "@/lib/demo-mode";

const ACCOUNTS: Record<string, string> = {
  basic: "basic@menudigital.ir",
  premium: "premium@menudigital.ir",
  plus: DEMO_EMAIL,
  admin: "admin@menudigital.ir",
  support: "support@menudigital.ir",
  finance: "finance@menudigital.ir",
  courier: "courier@menudigital.ir",
  waiter: "waiter@menudigital.ir",
  cashier: "cashier@menudigital.ir",
  kitchen: "kitchen@menudigital.ir",
  warehouse: "warehouse@menudigital.ir",
  accountant: "accountant@menudigital.ir",
};

export async function POST(req: Request) {
  if (!DEMO_ENABLED) return Response.json({ error: "ورود دمو غیرفعال است" }, { status: 404 });
  try {
    const b = await readJson(req).catch(() => ({}) as Record<string, unknown>);
    await ensureDemoData();
    const email = ACCOUNTS[String(b.account ?? "plus")] ?? DEMO_EMAIL;
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) return Response.json({ error: "حساب دمو آماده نیست" }, { status: 500 });
    await createSession(user.id);
    return Response.json({ ok: true, admin: user.role === "admin" });
  } catch (e) {
    return errorResponse(e);
  }
}
