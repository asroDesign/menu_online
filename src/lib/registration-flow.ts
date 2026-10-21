import { createHmac, timingSafeEqual } from "node:crypto";

export const REGISTRATION_FLOW_COOKIE = "registration_flow";
export const REGISTRATION_FLOW_TTL_MS = 20 * 60_000;

export type RegistrationFlow = {
  challengeId: string;
  issuedAt: number;
};

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signRegistrationFlow(input: Omit<RegistrationFlow, "issuedAt">, secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error("Registration flow secret must be at least 32 characters");
  const payload = Buffer.from(JSON.stringify({ ...input, issuedAt: now })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyRegistrationFlow(token: string | undefined, secret: string, now = Date.now()): RegistrationFlow | null {
  if (!token || secret.length < 32) return null;
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra !== undefined) return null;
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<RegistrationFlow>;
    if (typeof value.challengeId !== "string" || !/^[a-f0-9-]{36}$/i.test(value.challengeId)) return null;
    if (!Number.isSafeInteger(value.issuedAt)) return null;
    const age = now - Number(value.issuedAt);
    if (age < -60_000 || age > REGISTRATION_FLOW_TTL_MS) return null;
    return { challengeId: value.challengeId, issuedAt: Number(value.issuedAt) };
  } catch {
    return null;
  }
}
