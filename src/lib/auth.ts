import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, or } from "drizzle-orm";
import { db } from "@/db";
import { businesses, couriers, sessions, staff, users } from "@/db/schema";
import { activeTrialOf, featuresOf } from "@/lib/entitlements";
import { hasAny, type FeatureMap } from "@/lib/plans";
import { isManagerRole, restrictByRole } from "@/lib/roles";
import { permsOf, type AdminPerm } from "@/lib/admin-meta";
import { logError } from "@/lib/logger";

const COOKIE = "sid";
const SESSION_DAYS = 30;
const secureCookie = process.env.NODE_ENV === "production";

export type Business = typeof businesses.$inferSelect;
export type AuthContext = {
  user: { id: number; name: string; email: string; role: string; staffRole: string | null };
  /** effective role: owner | manager | waiter | cashier | chef | warehouse | accountant */
  role: string;
  business: Business;
  features: FeatureMap;
  /** features of the plan before the role restriction (used to decide lock icons) */
  planFeatures: FeatureMap;
  trialActive: boolean;
  trialEndsAt: Date | null;
  trialPlan: string | null;
};

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === test.length && timingSafeEqual(expected, test);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: number, ttlMs = SESSION_DAYS * 86400_000) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(sessions).values({ id: sha(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookie, path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha(token)));
  jar.delete(COOKIE);
}

const ADMIN_COOKIE = "admin_sid";

/** Admin "log in as" — keeps the admin's own session in a second cookie so they can return. */
export async function startImpersonation(userId: number) {
  const jar = await cookies();
  const cur = jar.get(COOKIE)?.value;
  if (!cur) throw new HttpError(401, "ابتدا وارد شوید");
  if (!jar.get(ADMIN_COOKIE)) jar.set(ADMIN_COOKIE, cur, { httpOnly: true, sameSite: "lax", secure: secureCookie, path: "/", maxAge: 8 * 3600 });
  await createSession(userId, 2 * 3600_000);
}
export async function endImpersonation() {
  const jar = await cookies();
  const adm = jar.get(ADMIN_COOKIE)?.value;
  if (!adm) return false;
  const [s] = await db.select().from(sessions).where(and(eq(sessions.id, sha(adm)), gt(sessions.expiresAt, new Date())));
  const cur = jar.get(COOKIE)?.value;
  if (cur && sha(cur) === sha(adm)) { jar.delete(ADMIN_COOKIE); return true; } // already back on the admin session
  if (cur) await db.delete(sessions).where(eq(sessions.id, sha(cur)));
  jar.delete(ADMIN_COOKIE);
  if (!s) { jar.delete(COOKIE); return false; }
  jar.set(COOKIE, adm, { httpOnly: true, sameSite: "lax", secure: secureCookie, path: "/", expires: s.expiresAt });
  return true;
}
export async function isImpersonating() {
  return !!(await cookies()).get(ADMIN_COOKIE)?.value;
}

export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      user: { id: users.id, name: users.name, email: users.email, role: users.role, staffRole: users.staffRole, active: users.isActive },
      business: businesses,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(businesses, or(eq(businesses.userId, users.id), eq(businesses.id, users.businessId)))
    .where(and(eq(sessions.id, sha(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || !row.user.active) return null;
  let role = row.user.role === "staff" ? (row.user.staffRole ?? "waiter") : "owner";
  if (row.user.role === "staff") {
    const [st] = await db.select({ a: staff.isActive }).from(staff).where(and(eq(staff.userId, row.user.id), eq(staff.businessId, row.business.id)));
    if (!st || !st.a) return null;
  }
  if (row.user.role === "courier") {
    const [c] = await db.select({ id: couriers.id }).from(couriers).where(and(eq(couriers.userId, row.user.id), eq(couriers.businessId, row.business.id)));
    if (!c) return null;
    role = "courier";
  }
  if (!row.user.role) role = "owner";
  const trial = row.business.plan === "pending" ? await activeTrialOf(row.business.id) : undefined;
  const planFeatures = await featuresOf(row.business);
  const { active: _a, ...user } = row.user;
  return { user, business: row.business, role, planFeatures, features: restrictByRole(planFeatures, role), trialActive: !!trial, trialEndsAt: trial?.endsAt ?? null, trialPlan: trial?.plan ?? null };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers?: HeadersInit,
  ) {
    super(message);
  }
}

export const can = (auth: { features: FeatureMap }, key: string | string[]) => hasAny(auth.features, key);

export function requireFeature(auth: { features: FeatureMap }, key: string | string[]) {
  if (!can(auth, key)) throw new HttpError(403, "این امکان در پلن شما فعال نیست؛ برای استفاده پلن خود را ارتقا دهید.");
}

export const adminDept = (auth: { user: { staffRole: string | null } }) => auth.user.staffRole ?? "super";
export const adminCan = (auth: AuthContext, perm: AdminPerm) => auth.user.role === "admin" && permsOf(adminDept(auth)).includes(perm);

export function requireAdmin(auth: AuthContext) {
  if (auth.user.role !== "admin") throw new HttpError(403, "دسترسی فقط برای مدیر سامانه است");
}

type Ctx<P> = { params: Promise<P> };

/** Wrap an API handler: enforces authentication + plan entitlement, and converts thrown errors to JSON. */
export function withAuth<P = Record<string, string>>(
  handler: (req: Request, auth: AuthContext, params: P) => Promise<Response>,
  opts: { feature?: string | string[]; admin?: boolean; manager?: boolean; roles?: string[]; courierOk?: boolean; perm?: AdminPerm; allowUnpaid?: boolean } = {},
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const auth = await getAuth();
      if (!auth) throw new HttpError(401, "ابتدا وارد حساب کاربری شوید");
      if (auth.business.isSuspended && auth.user.role !== "admin")
        throw new HttpError(403, "حساب شما توسط مدیر سامانه مسدود شده است");
      if (auth.business.plan === "pending" && auth.user.role !== "admin" && !auth.trialActive && !opts.allowUnpaid)
        throw new HttpError(402, "برای دسترسی به پنل، ابتدا پلن را انتخاب و پرداخت کنید");
      if (auth.role === "courier" && !opts.courierOk) throw new HttpError(403, "دسترسی پیک فقط به پنل پیک محدود است");
      if (opts.admin) requireAdmin(auth);
      if (opts.perm && !adminCan(auth, opts.perm)) throw new HttpError(403, "شما به این بخش از پنل مدیریت دسترسی ندارید");
      if (opts.manager && !isManagerRole(auth.role) && !(opts.roles ?? []).includes(auth.role))
        throw new HttpError(403, "این عملیات فقط برای مدیر رستوران مجاز است");
      if (opts.feature) requireFeature(auth, opts.feature);
      return await handler(req, auth, await ctx.params);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status, headers: e.headers });
  if ((e as { code?: string })?.code === "23505")
    return Response.json({ error: "این مقدار قبلاً ثبت شده است (تکراری)" }, { status: 409 });
  let cause: unknown = e;
  let isStaffScheduleSchemaError = false;
  let isWaiterServiceRequestSchemaError = false;
  for (let depth = 0; depth < 4 && cause; depth++) {
    const current = cause as { code?: unknown; message?: unknown; cause?: unknown };
    if (["42P01", "42703"].includes(String(current.code ?? "")) && /staff_(?:schedules|leave_requests|shift_templates|shift_swap_requests|attendance)/i.test(String(current.message ?? ""))) {
      isStaffScheduleSchemaError = true;
      break;
    }
    if (["42P01", "42703"].includes(String(current.code ?? "")) && /waiter_service_requests/i.test(String(current.message ?? ""))) {
      isWaiterServiceRequestSchemaError = true;
      break;
    }
    cause = current.cause;
  }
  if (isStaffScheduleSchemaError) {
    logError("api.staff_schedule_migration_required", e);
    return Response.json({ error: "ساختار پایگاه دادهٔ مدیریت شیفت به‌روز نیست؛ migrationهای 0040 و 0041 را روی همین پایگاه داده اجرا کنید." }, { status: 503 });
  }
  if (isWaiterServiceRequestSchemaError) {
    logError("api.waiter_service_requests_migration_required", e);
    return Response.json({ error: "ساختار درخواست گارسون به‌روز نیست؛ migration 0042 را روی همین پایگاه داده اجرا کنید." }, { status: 503 });
  }
  logError("api.unhandled_error", e);
  return Response.json({ error: "خطای داخلی سرور" }, { status: 500 });
}

async function readRequestText(req: Request, maxBytes?: number) {
  if (!maxBytes) return req.text();
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new HttpError(413, "اندازه درخواست بیش از حد مجاز است");
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      try { await reader.cancel(); } catch { /* the size limit already determines the response */ }
      throw new HttpError(413, "اندازه درخواست بیش از حد مجاز است");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function readJson(req: Request, maxBytes?: number): Promise<Record<string, unknown>> {
  try {
    const text = await readRequestText(req, maxBytes);
    const body = JSON.parse(text);
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "درخواست نامعتبر است");
  }
}
