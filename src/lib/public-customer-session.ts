import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { HttpError } from "@/lib/auth";

const COOKIE = "menu_customer_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

type Claims = { businessId: number; customerId: number; expiresAt: number };

function secret() {
  const value = process.env.OTP_SECRET ?? "";
  if (value.length < 32) throw new HttpError(503, "ورود مشتریان به‌درستی پیکربندی نشده است");
  return createHmac("sha256", value).update("menupeak-public-customer-session-v1").digest();
}

function cookiePath(slug: string) {
  return `/api/public/${encodeURIComponent(slug)}/customer`;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function parse(token: string | undefined): Claims | null {
  if (!token || token.length > 512) return null;
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return null;
  try {
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
    if (!Number.isSafeInteger(claims.businessId) || claims.businessId < 1 || !Number.isSafeInteger(claims.customerId) || claims.customerId < 1 || !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function createPublicCustomerSession(input: { slug: string; businessId: number; customerId: number }) {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ businessId: input.businessId, customerId: input.customerId, expiresAt } satisfies Claims)).toString("base64url");
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${signature(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: cookiePath(input.slug),
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function publicCustomerId(slug: string, businessId: number) {
  const jar = await cookies();
  const claims = parse(jar.get(COOKIE)?.value);
  return claims?.businessId === businessId ? claims.customerId : null;
}

export async function destroyPublicCustomerSession(slug: string) {
  const jar = await cookies();
  jar.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: cookiePath(slug),
    maxAge: 0,
  });
}
