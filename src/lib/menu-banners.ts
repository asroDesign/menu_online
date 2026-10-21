import type { MenuPromoBanner } from "@/lib/plans";

const LOCAL_IMAGE = /^\/api\/files\/[a-f0-9]{24}$/;

function safeHref(value: unknown) {
  if (typeof value !== "string") return "";
  const href = value.trim().slice(0, 500);
  if (!href) return "";
  if (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\")) return href;
  try {
    const url = new URL(href);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Validate tenant-managed menu banners before saving or exposing them publicly. */
export function cleanMenuPromoBanners(value: unknown): MenuPromoBanner[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const imageUrl = typeof row.imageUrl === "string" && LOCAL_IMAGE.test(row.imageUrl) ? row.imageUrl : "";
    const title = typeof row.title === "string" ? row.title.trim().slice(0, 80) : "";
    if (!imageUrl || !title) return [];
    const rawId = typeof row.id === "string" ? row.id.trim().slice(0, 40) : "";
    return [{
      id: /^[a-zA-Z0-9_-]+$/.test(rawId) ? rawId : `banner-${index + 1}`,
      title,
      imageUrl,
      href: safeHref(row.href),
      enabled: row.enabled !== false,
    }];
  });
}

export function visibleMenuPromoBanners(value: unknown) {
  return cleanMenuPromoBanners(value).filter((banner) => banner.enabled);
}
