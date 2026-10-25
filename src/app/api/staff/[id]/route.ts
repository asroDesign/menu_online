import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { staff, users } from "@/db/schema";
import { HttpError, hashPassword, readJson, withAuth } from "@/lib/auth";
import { STAFF_ROLE_LABELS } from "@/lib/roles";
import { staffPayrollPatch } from "@/lib/staff-payroll-profile";

export const PATCH = withAuth<{ id: string }>(
  async (req, auth, { id }) => {
    const b = await readJson(req);
    const [cur] = await db.select().from(staff).where(and(eq(staff.id, Number(id)), eq(staff.businessId, auth.business.id)));
    if (!cur) throw new HttpError(404, "پیدا نشد");
    const set: Record<string, unknown> = {};
    if (typeof b.name === "string" && b.name.trim()) set.name = b.name.trim().slice(0, 80);
    if (typeof b.phone === "string") set.phone = b.phone.trim().slice(0, 30);
    if (typeof b.role === "string") { if (!(b.role in STAFF_ROLE_LABELS)) throw new HttpError(400, "نقش نامعتبر است"); set.role = b.role; }
    if (typeof b.isActive === "boolean") set.isActive = b.isActive;
    try { Object.assign(set, staffPayrollPatch(b)); } catch (error) { throw new HttpError(400, (error as Error).message); }
    const startDate = String(set.employmentStartDate ?? cur.employmentStartDate ?? "");
    const endDate = String(set.employmentEndDate ?? cur.employmentEndDate ?? "");
    if (startDate && endDate && endDate < startDate) throw new HttpError(400, "تاریخ پایان همکاری نباید پیش از شروع به کار باشد");
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const password = typeof b.password === "string" ? b.password : "";
    let userId = cur.userId;
    if (userId) {
      const u: Record<string, unknown> = {};
      if (set.name) u.name = set.name;
      if (set.role) u.staffRole = set.role;
      if (email) { if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "ایمیل معتبر نیست"); u.email = email; }
      if (password) { if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد"); u.passwordHash = hashPassword(password); }
      if (Object.keys(u).length) await db.update(users).set(u).where(eq(users.id, userId));
    } else if (email || password) {
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "ایمیل ورود معتبر نیست");
      if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد");
      const [u] = await db.insert(users).values({ name: String(set.name ?? cur.name), email, passwordHash: hashPassword(password), role: "staff", businessId: auth.business.id, staffRole: String(set.role ?? cur.role) }).returning({ id: users.id });
      userId = u.id;
      set.userId = userId;
    }
    if (!Object.keys(set).length && !password && !email) throw new HttpError(400, "تغییری ارسال نشد");
    const [row] = Object.keys(set).length
      ? await db.update(staff).set(set).where(eq(staff.id, cur.id)).returning()
      : [cur];
    const [u] = userId ? await db.select({ e: users.email }).from(users).where(eq(users.id, userId)) : [];
    return Response.json({ item: { ...row, email: u?.e ?? "", hasLogin: !!userId } });
  },
  { feature: "cashier_pos", manager: true },
);

export const DELETE = withAuth<{ id: string }>(
  async (_req, auth, { id }) => {
    const [row] = await db.delete(staff).where(and(eq(staff.id, Number(id)), eq(staff.businessId, auth.business.id))).returning();
    if (!row) throw new HttpError(404, "پیدا نشد");
    if (row.userId) await db.delete(users).where(eq(users.id, row.userId));
    return Response.json({ ok: true });
  },
  { feature: "cashier_pos", manager: true },
);
