import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { pricePlan, type PriceSettings } from "@/lib/plan-pricing";
import { PLANS } from "@/lib/plans";
import { DEFAULT_BRAND_COLOR, normalizeBrandColor } from "@/lib/brand-color";

export type SupportInfo = { phone: string; email: string; hours: string };
export type BillingInfo = { bank: string; owner: string; card: string; sheba: string; note: string };
export type PlatformBranding = { siteName: string; logoUrl: string; brandColor: string };
export type ManagerNotificationSettings = { phone: string };

export const DEFAULT_PLATFORM_BRANDING: PlatformBranding = { siteName: "منوی دیجیتال", logoUrl: "", brandColor: DEFAULT_BRAND_COLOR };

export async function getSetting<T extends object>(key: string, def: T): Promise<T> {
  const [r] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return { ...def, ...((r?.value ?? {}) as T) };
}
export async function setSetting(key: string, value: Record<string, unknown>) {
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function getPlanList() {
  const o = await getSetting<Record<string, PriceSettings>>("planPrices", {});
  return PLANS.map(p => pricePlan(p, o[p.key]));
}

export const getSupport = () => getSetting<SupportInfo>("support", { phone: "", email: "", hours: "۲۴ ساعته" });
export const getBilling = () => getSetting<BillingInfo>("billing", { bank: "", owner: "", card: "", sheba: "", note: "" });
export const getManagerNotifications = () => getSetting<ManagerNotificationSettings>("managerNotifications", { phone: "" });
export async function getPlatformBranding(): Promise<PlatformBranding> {
  const saved = await getSetting<PlatformBranding>("platformBranding", DEFAULT_PLATFORM_BRANDING);
  const siteName = typeof saved.siteName === "string" ? saved.siteName.trim().slice(0, 80) : "";
  const logoUrl = typeof saved.logoUrl === "string" && /^\/api\/files\/[a-f0-9]{24}$/.test(saved.logoUrl) ? saved.logoUrl : "";
  const brandColor = normalizeBrandColor(saved.brandColor) ?? DEFAULT_BRAND_COLOR;
  return { siteName: siteName || DEFAULT_PLATFORM_BRANDING.siteName, logoUrl, brandColor };
}
