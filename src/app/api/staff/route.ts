import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { staff, users } from "@/db/schema";
import { HttpError, hashPassword, readJson, withAuth } from "@/lib/auth";
import { STAFF_ROLE_LABELS, isManagerRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (_req, auth) => {
    const rows = await db.select({ s: staff, email: users.email }).from(staff).leftJoin(users, eq(users.id, staff.userId)).where(eq(staff.businessId, auth.business.id)).orderBy(desc(staff.id));
    const mgr = isManagerRole(auth.role);
    return Response.json({ items: rows.map((r) => ({ ...r.s, email: mgr ? (r.email ?? "") : "", hasLogin: !!r.s.userId })).reverse() });
  },
  { feature: ["cashier_pos", "accounting"] },
);

export const POST = withAuth(
  async (req, auth) => {
    const b = await readJson(req);
    const name = String(b.name ?? "").trim().slice(0, 80);
    const role = String(b.role ?? "waiter");
    if (!name) throw new HttpError(400, "نام را وارد کنید");
    if (!(role in STAFF_ROLE_LABELS)) throw new HttpError(400, "نقش نامعتبر است");
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    let userId: number | null = null;
    if (email || password) {
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "ایمیل ورود معتبر نیست");
      if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد");
      const [u] = await db.insert(users).values({ name, email, passwordHash: hashPassword(password), role: "staff", businessId: auth.business.id, staffRole: role }).returning({ id: users.id });
      userId = u.id;
    }
    const [row] = await db.insert(staff).values({ businessId: auth.business.id, name, role, phone: String(b.phone ?? "").trim().slice(0, 30), userId }).returning();
    return Response.json({ item: { ...row, email, hasLogin: !!userId } }, { status: 201 });
  },
  { feature: "cashier_pos", manager: true },
);
