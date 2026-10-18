import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, gt, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, otpChallenges, platformSmsCampaigns, platformSmsLogs, users } from "@/db/schema";
import { getManagerNotifications, getSetting } from "@/lib/app-settings";
import { planName } from "@/lib/plans";
import { HttpError } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fromJ, toJ } from "@/lib/jalali";

export type PatternConfig = { kavenegarId: string; smsirId: string; params: string[] };
export type PlatformSmsConfig = {
  enabled: boolean;
  provider: "smsir" | "kavenegar";
  smsirApiKey: string;
  kavenegarApiKey: string;
  renewalDays: number;
  templates: { otp: PatternConfig; renewal: PatternConfig; occasion: PatternConfig; adminAlert: PatternConfig };
};
const blankPattern = (): PatternConfig => ({ kavenegarId: "", smsirId: "", params: ["code"] });
const DEFAULTS: PlatformSmsConfig = { enabled: false, provider: "kavenegar", smsirApiKey: "", kavenegarApiKey: "", renewalDays: 7, templates: { otp: blankPattern(), renewal: { kavenegarId: "", smsirId: "", params: ["business", "plan", "days"] }, occasion: { kavenegarId: "", smsirId: "", params: ["business", "plan", "occasion"] }, adminAlert: { kavenegarId: "", smsirId: "", params: ["event", "name", "phone", "details"] } } };

export async function getPlatformSms(): Promise<PlatformSmsConfig> {
  const raw = await getSetting<Partial<PlatformSmsConfig>>("platformSms", {});
  const provider = raw.provider === "smsir" ? "smsir" : "kavenegar";
  const legacyConfigured = provider === "smsir" ? Boolean(raw.smsirApiKey) : Boolean(raw.kavenegarApiKey);
  return {
    ...DEFAULTS,
    ...raw,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : legacyConfigured,
    provider,
    templates: { ...DEFAULTS.templates, ...(raw.templates ?? {}) },
  } as PlatformSmsConfig;
}

export function normalizedPhone(raw: unknown) {
  const digits = String(raw ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
  const local = digits.startsWith("98") ? `0${digits.slice(2)}` : digits.length === 10 && digits.startsWith("9") ? `0${digits}` : digits;
  return /^09\d{9}$/.test(local) ? local : "";
}

const toTemplateKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
async function sendPattern(phone: string, kind: keyof PlatformSmsConfig["templates"], values: Record<string, string>) {
  const cfg = await getPlatformSms();
  if (!cfg.enabled) return { status: "failed" as const, detail: "پنل پیامک مرکزی غیرفعال است", provider: cfg.provider };
  const pattern = cfg.templates[kind];
  if (cfg.provider === "smsir") {
    if (!cfg.smsirApiKey || !pattern.smsirId) return { status: "failed" as const, detail: "کلید یا شناسه الگوی sms.ir تنظیم نشده است", provider: cfg.provider };
    try {
      const res = await fetch("https://api.sms.ir/v1/send/verify", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": cfg.smsirApiKey }, body: JSON.stringify({ mobile: phone, templateId: Number(pattern.smsirId), parameters: pattern.params.map((name) => ({ name, value: String(values[toTemplateKey(name)] ?? "").slice(0, 100) })) }), signal: AbortSignal.timeout(15000) });
      const data: any = await res.json().catch(() => ({}));
      return data?.status === 1 ? { status: "sent" as const, detail: `messageId: ${data?.data?.messageId ?? "-"}`, provider: cfg.provider } : { status: "failed" as const, detail: `sms.ir: ${data?.message ?? res.status}`, provider: cfg.provider };
    } catch (e) { return { status: "failed" as const, detail: `خطای شبکه: ${(e as Error).message}`, provider: cfg.provider }; }
  }
  if (!cfg.kavenegarApiKey || !pattern.kavenegarId) return { status: "failed" as const, detail: "کلید یا شناسه الگوی کاوه‌نگار تنظیم نشده است", provider: cfg.provider };
  try {
    const keyNames = ["token", "token2", "token3", "token10", "token20"];
    const body = new URLSearchParams({ receptor: phone, template: pattern.kavenegarId });
    pattern.params.slice(0, 5).forEach((name, i) => body.set(keyNames[i], String(values[toTemplateKey(name)] ?? "").slice(0, 100)));
    const res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(cfg.kavenegarApiKey)}/verify/lookup.json`, { method: "POST", body, signal: AbortSignal.timeout(15000) });
    const data: any = await res.json().catch(() => ({}));
    return data?.return?.status === 200 ? { status: "sent" as const, detail: `messageid: ${data?.entries?.[0]?.messageid ?? "-"}`, provider: cfg.provider } : { status: "failed" as const, detail: `کاوه‌نگار: ${data?.return?.message ?? res.status}`, provider: cfg.provider };
  } catch (e) { return { status: "failed" as const, detail: `خطای شبکه: ${(e as Error).message}`, provider: cfg.provider }; }
}

const hashCode = (id: string, code: string) => createHmac("sha256", process.env.OTP_SECRET || "").update(`${id}:${code}`).digest();

export async function requestOtp(phone: string, input: { purpose: "login" | "register"; name?: string; businessName?: string }, req: Request) {
  const cfg = await getPlatformSms();
  if (!cfg.enabled) throw new HttpError(503, "پنل پیامک مرکزی غیرفعال است");
  if (!process.env.OTP_SECRET || process.env.OTP_SECRET.length < 32) throw new HttpError(503, "برای فعال‌سازی ورود پیامکی، OTP_SECRET را در فایل .env با یک مقدار تصادفی حداقل ۳۲ نویسه‌ای تنظیم کنید");
  const user = (await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1))[0];
  // Never issue an OTP for an unregistered phone; the login endpoint reports that explicitly.
  if (input.purpose === "register" && user) throw new HttpError(409, "این شماره قبلاً حساب کاربری دارد");
  if (input.purpose === "login" && !user) throw new HttpError(404, "حسابی با این شماره پیدا نشد");
  const identity = `${input.purpose}:${phone}`;
  const [lastChallenge] = await db.select({ expiresAt: otpChallenges.expiresAt }).from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), eq(otpChallenges.purpose, input.purpose)))
    .orderBy(desc(otpChallenges.createdAt)).limit(1);
  const lastSentAt = lastChallenge ? lastChallenge.expiresAt.getTime() - 5 * 60_000 : 0;
  const retryIn = lastChallenge ? Math.ceil((lastSentAt + 60_000 - Date.now()) / 1000) : 0;
  if (retryIn > 0) throw new HttpError(429, `برای ارسال دوباره کد ${retryIn} ثانیه دیگر صبر کنید.`, { "Retry-After": String(retryIn) });
  try {
    await enforceRateLimit(req, "otp-request-cooldown", identity, 1, 60_000, false);
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) throw new HttpError(429, "برای ارسال دوباره کد باید یک دقیقه صبر کنید.", { "Retry-After": "60" });
    throw error;
  }
  await enforceRateLimit(req, "otp-request-phone", identity, 4, 15 * 60_000);
  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [challenge] = await db.insert(otpChallenges).values({ id, phone, codeHash: hashCode(id, code).toString("hex"), purpose: input.purpose, name: input.name ?? "", businessName: input.businessName ?? "", expiresAt: new Date(Date.now() + 5 * 60_000) }).returning({ id: otpChallenges.id });
  const result = await sendPattern(phone, "otp", { code });
  await db.insert(platformSmsLogs).values({ businessId: null, phone, kind: "otp", periodKey: `otp:${id}`, provider: cfg.provider, status: result.status, detail: result.detail.slice(0, 300) });
  if (result.status !== "sent") { await db.delete(otpChallenges).where(eq(otpChallenges.id, id)); throw new HttpError(503, result.detail); }
  const sentAt = new Date();
  await db.update(otpChallenges).set({ expiresAt: new Date(sentAt.getTime() + 5 * 60_000) }).where(eq(otpChallenges.id, id));
  return { challengeId: challenge.id, expiresIn: 300, resendAfter: 60 };
}

export async function verifyOtp(id: string, code: string) {
  if (!process.env.OTP_SECRET || process.env.OTP_SECRET.length < 32) throw new HttpError(503, "برای فعال‌سازی ورود پیامکی، OTP_SECRET را در فایل .env با یک مقدار تصادفی حداقل ۳۲ نویسه‌ای تنظیم کنید");
  const [challenge] = await db.select().from(otpChallenges).where(and(eq(otpChallenges.id, id), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date()))).limit(1);
  if (!challenge || challenge.attempts >= 5) throw new HttpError(400, "کد اعتبارسنجی معتبر نیست یا منقضی شده است");
  await db.update(otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(otpChallenges.id, challenge.id));
  const savedHash = Buffer.from(challenge.codeHash, "hex"); const suppliedHash = hashCode(id, code);
  if (savedHash.length !== suppliedHash.length || !timingSafeEqual(savedHash, suppliedHash)) throw new HttpError(400, "کد اعتبارسنجی اشتباه است");
  const [used] = await db.update(otpChallenges).set({ consumedAt: new Date() }).where(and(eq(otpChallenges.id, id), isNull(otpChallenges.consumedAt))).returning();
  if (!used) throw new HttpError(400, "این کد قبلاً استفاده شده است");
  return challenge;
}

export type ManagerAlertKind = "demo" | "plan_request" | "plan_sale";
const MANAGER_ALERT_LABEL: Record<ManagerAlertKind, string> = {
  demo: "درخواست دموی رایگان",
  plan_request: "درخواست پلن",
  plan_sale: "فروش پلن",
};

/** Send an optional manager alert without allowing SMS failures to interrupt a customer flow. */
export async function notifyPlatformManager(input: { kind: ManagerAlertKind; name: string; phone: string; details: string }) {
  try {
    const [notifications, cfg] = await Promise.all([getManagerNotifications(), getPlatformSms()]);
    const managerPhone = normalizedPhone(notifications.phone);
    if (!managerPhone || !cfg.enabled) return "skipped" as const;
    const result = await sendPattern(managerPhone, "adminAlert", {
      event: MANAGER_ALERT_LABEL[input.kind],
      name: input.name.slice(0, 100),
      phone: input.phone.slice(0, 30) || "ثبت نشده",
      details: input.details.slice(0, 100),
    });
    await db.insert(platformSmsLogs).values({
      businessId: null,
      phone: managerPhone,
      kind: `manager_${input.kind}`,
      periodKey: randomUUID(),
      provider: result.provider,
      status: result.status,
      detail: result.detail.slice(0, 300),
    });
    return result.status;
  } catch (error) {
    console.error("platform manager SMS notification failed", error);
    return "failed" as const;
  }
}

async function sendLogged(businessId: number | null, phone: string, kind: string, periodKey: string, template: "renewal" | "occasion", values: Record<string, string>) {
  const cfg = await getPlatformSms();
  const [log] = await db.insert(platformSmsLogs).values({ businessId, phone, kind, periodKey, provider: cfg.provider, status: "sending", detail: "" }).onConflictDoNothing().returning({ id: platformSmsLogs.id });
  if (!log) return "skipped" as const;
  const result = await sendPattern(phone, template, values);
  await db.update(platformSmsLogs).set({ status: result.status, detail: result.detail.slice(0, 300) }).where(eq(platformSmsLogs.id, log.id));
  return result.status;
}

async function sendCampaign(campaign: typeof platformSmsCampaigns.$inferSelect) {
  const cfg = await getPlatformSms();
  const rows = await db.select({ business: businesses, phone: users.phone }).from(businesses).innerJoin(users, eq(users.id, businesses.userId)).where(and(eq(businesses.isSuspended, false), ne(users.role, "admin"), eq(users.isActive, true), isNotNull(users.phone)));
  let sent = 0, failed = 0;
  const periodKey = `campaign:${campaign.id}`;
  for (const row of rows) {
    if (!row.phone) continue;
    const status = await sendLogged(row.business.id, row.phone, "occasion", periodKey, "occasion", { business: row.business.name, occasion: campaign.title, plan: planName(row.business.plan) });
    if (status === "sent") sent++; else failed++;
  }
  await db.update(platformSmsCampaigns).set({ status: failed > 0 && sent === 0 ? "failed" : "sent", sentCount: sent, failedCount: failed }).where(eq(platformSmsCampaigns.id, campaign.id));
  return { sent, failed };
}

/** Idempotent schedule runner for main-platform campaigns and renewal notices. */
export async function runPlatformSmsAutomations() {
  const cfg = await getPlatformSms();
  if (!cfg.enabled) return { campaigns: 0, reminders: 0 };
  const due = await db.update(platformSmsCampaigns).set({ status: "sending" }).where(and(eq(platformSmsCampaigns.status, "scheduled"), lte(platformSmsCampaigns.scheduledAt, new Date()))).returning();
  for (const campaign of due) await sendCampaign(campaign);
  const target = toJ(new Date(Date.now() + Math.max(1, cfg.renewalDays) * 86400_000));
  const start = fromJ(target.jy, target.jm, target.jd, 0, 0, 0);
  const end = new Date(start.getTime() + 86400_000);
  const expiring = await db.select({ business: businesses, phone: users.phone }).from(businesses).innerJoin(users, eq(users.id, businesses.userId)).where(and(eq(businesses.isSuspended, false), ne(businesses.plan, "basic"), ne(users.role, "admin"), eq(users.isActive, true), isNotNull(users.phone), isNotNull(businesses.subscriptionEndsAt), gte(businesses.subscriptionEndsAt, start), lt(businesses.subscriptionEndsAt, end)));
  let reminders = 0;
  const dayKey = `${target.jy}-${String(target.jm).padStart(2, "0")}-${String(target.jd).padStart(2, "0")}`;
  for (const row of expiring) {
    if (!row.phone) continue;
    const [already] = await db.select({ id: platformSmsLogs.id }).from(platformSmsLogs).where(and(eq(platformSmsLogs.businessId, row.business.id), eq(platformSmsLogs.kind, "renewal"), eq(platformSmsLogs.periodKey, dayKey))).limit(1);
    if (already) continue;
    const status = await sendLogged(row.business.id, row.phone, "renewal", dayKey, "renewal", { business: row.business.name, plan: planName(row.business.plan), days: String(cfg.renewalDays) });
    if (status === "sent") reminders++;
  }
  return { campaigns: due.length, reminders };
}
