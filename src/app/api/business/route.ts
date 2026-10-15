import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { HttpError, readJson, requireFeature, withAuth, type AuthContext } from "@/lib/auth";
import { LANGS } from "@/lib/plans";

export function publicBiz<T extends { settings: unknown }>(b: T): T {
  const st = { ...((b.settings ?? {}) as Record<string, unknown>) };
  const sms = st.sms as { apiKey?: string } | undefined;
  if (sms) st.sms = { ...sms, apiKey: "", apiKeySet: !!sms.apiKey };
  return { ...b, settings: st };
}

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, { business, user, features }) =>
  Response.json({ item: publicBiz(business), user, features }),
);

const SETTING_FEATURE: Record<string, string> = {
  miniSite: "mini_site",
  languages: "translation",
  pointsPerToman: "loyalty",
  cashbackPercent: "cashback",
  ipg: "ipg",
  installment: "installment",
  smsSender: "sms",
  kiosk: "kiosk",
  segments: "loyalty",
  sms: "sms",
  cashbackEnabled: "cashback",
  cashbackMinOrder: "cashback",
  cashbackMaxRedeemPercent: "cashback",
  baleBot: "bale",
  crossSellAuto: "cross_sell",
};

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

function cleanSetting(key: string, v: unknown, auth: AuthContext, cur: Record<string, unknown>): unknown {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  switch (key) {
    case "miniSite": {
      const custom = auth.features.mini_site === "custom";
      return {
        heroTitle: s(o.heroTitle, 120),
        heroSubtitle: s(o.heroSubtitle, 240),
        about: s(o.about, 1500),
        hours: s(o.hours, 200),
        showMenuButton: o.showMenuButton !== false,
        gallery: Array.isArray(o.gallery) ? o.gallery.map((x) => s(x, 400)).filter(Boolean).slice(0, 8) : [],
        heroImage: custom ? s(o.heroImage, 400) : "",
        sections: custom && Array.isArray(o.sections)
          ? o.sections.map((x) => ({ title: s((x as Record<string, unknown>).title, 80), text: s((x as Record<string, unknown>).text, 800) })).filter((x) => x.title).slice(0, 6)
          : [],
      };
    }
    case "languages": {
      const arr = Array.isArray(v) ? v.map(String).filter((l) => l in LANGS) : [];
      return [...new Set(["fa", ...arr])];
    }
    case "pointsPerToman":
      return Math.min(100_000_000, Math.max(1000, Math.round(Number(v)) || 10000));
    case "cashbackEnabled":
      return Boolean(v);
    case "cashbackMinOrder":
      return Math.min(1_000_000_000, Math.max(0, Math.round(Number(v)) || 0));
    case "cashbackMaxRedeemPercent":
      return Math.min(100, Math.max(1, Math.round(Number(v)) || 100));
    case "sms": {
      const old = (cur.sms ?? {}) as Record<string, unknown>;
      const key = typeof o.apiKey === "string" && o.apiKey.trim() ? o.apiKey.trim().slice(0, 200) : String(old.apiKey ?? "");
      return {
        provider: o.provider === "smsir" ? "smsir" : "kavenegar",
        apiKey: key,
        sender: s(o.sender, 30),
        origin: /^https?:\/\/[^\s]+$/.test(String(o.origin ?? "")) ? String(o.origin).slice(0, 120) : String(old.origin ?? ""),
        birthdayAuto: Boolean(o.birthdayAuto),
        birthdayTemplateId: Number(o.birthdayTemplateId) > 0 ? Math.round(Number(o.birthdayTemplateId)) : undefined,
        birthdayCode: s(o.birthdayCode, 30).toUpperCase(),
        birthdayDiscount: s(o.birthdayDiscount, 25),
      };
    }
    case "cashbackPercent":
      return Math.min(50, Math.max(0, Math.round(Number(v)) || 0));
    case "kiosk":
      return {
        template: ["classic", "photo", "simple", "dark", "wizard"].includes(String(o.template)) ? String(o.template) : "classic",
        welcomeTitle: s(o.welcomeTitle, 80),
        welcomeSubtitle: s(o.welcomeSubtitle, 160),
        idleSeconds: Math.min(600, Math.max(30, Math.round(Number(o.idleSeconds)) || 90)),
        allowCounter: o.allowCounter !== false,
        allowOnline: Boolean(o.allowOnline),
        askPhone: o.askPhone !== false,
        allowPos: Boolean(o.allowPos),
        posDeviceId: Number(o.posDeviceId) > 0 ? Math.round(Number(o.posDeviceId)) : undefined,
      };
    case "segments": {
      const n = (x: unknown, d: number, max: number) => Math.min(max, Math.max(1, Math.round(Number(x)) || d));
      return { vipSpent: n(o.vipSpent, 5_000_000, 1e11), vipOrders: n(o.vipOrders, 8, 1000), loyalSpent: n(o.loyalSpent, 2_000_000, 1e11), loyalOrders: n(o.loyalOrders, 4, 1000), atRiskDays: n(o.atRiskDays, 45, 1000), lostDays: n(o.lostDays, 90, 3000) };
    }
    case "ipg":
      return {
        provider: "zarinpal",
        merchantId: s(o.merchantId, 80),
        sandbox: o.sandbox !== false,
      };
    case "installment":
      return { snappay: Boolean(o.snappay), digipay: Boolean(o.digipay) };
    case "smsSender":
    case "baleBot":
      return s(v, 40);
    case "crossSellAuto":
      return Boolean(v);
  }
  return undefined;
}

export const PATCH = withAuth(async (req, auth) => {
  // (manager only – see options below)
  const { business } = auth;
  const b = await readJson(req);
  const set: Record<string, unknown> = {};
  const str = (k: string, max: number, required = false) => {
    if (typeof b[k] !== "string") return;
    const v = (b[k] as string).trim().slice(0, max);
    if (required && !v) throw new HttpError(400, "نام کسب‌وکار الزامی است");
    set[k] = v;
  };
  str("name", 80, true);
  str("description", 400);
  str("phone", 30);
  str("address", 200);
  str("instagram", 60);
  str("logoEmoji", 8);
  str("type", 20);
  if (typeof b.accentColor === "string") {
    if (!/^#[0-9a-fA-F]{6}$/.test(b.accentColor)) throw new HttpError(400, "رنگ نامعتبر است");
    set.accentColor = b.accentColor;
  }
  if (typeof b.slug === "string") {
    const slug = b.slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{3,30}$/.test(slug))
      throw new HttpError(400, "آدرس منو فقط شامل حروف انگلیسی کوچک، عدد و خط تیره (۳ تا ۳۰ کاراکتر) باشد");
    if (slug !== business.slug) {
      const [dup] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug));
      if (dup) throw new HttpError(409, "این آدرس قبلاً استفاده شده است");
    }
    set.slug = slug;
  }
  for (const k of ["taxPercent", "servicePercent"]) {
    if (k in b) set[k] = Math.min(100, Math.max(0, Math.round(Number(b[k]) || 0)));
  }
  if ("acceptOrders" in b) set.acceptOrders = Boolean(b.acceptOrders);
  for (const k of ["lat", "lng"] as const) {
    if (k in b) {
      if (b[k] === null || b[k] === "") set[k] = null;
      else { const n = Number(b[k]); if (!Number.isFinite(n) || Math.abs(n) > 180) throw new HttpError(400, "مختصات نامعتبر است"); set[k] = n; }
    }
  }
  if (b.settings && typeof b.settings === "object") {
    const cur = { ...(business.settings as Record<string, unknown>) };
    for (const [k, v] of Object.entries(b.settings as Record<string, unknown>)) {
      const feature = SETTING_FEATURE[k];
      if (!feature) continue;
      requireFeature(auth, feature);
      cur[k] = cleanSetting(k, v, auth, cur);
    }
    set.settings = cur;
  }
  if (Object.keys(set).length === 0) throw new HttpError(400, "تغییری ارسال نشد");
  const [row] = await db.update(businesses).set(set).where(eq(businesses.id, business.id)).returning();
  return Response.json({ item: publicBiz(row) });
}, { manager: true });
