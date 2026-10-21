"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { PlatformBranding } from "@/lib/app-settings";
import { DEFAULT_BRAND_COLOR, setRootBrandTheme } from "@/lib/brand-color";

const DEFAULT_PLATFORM_BRANDING: PlatformBranding = { siteName: "منوی دیجیتال", logoUrl: "", brandColor: DEFAULT_BRAND_COLOR };

export function usePlatformBranding() {
  const [branding, setBranding] = useState(DEFAULT_PLATFORM_BRANDING);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch("/api/public/branding", { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<PlatformBranding> : null)
        .then((value) => { if (active && value?.siteName) setBranding({ siteName: value.siteName, logoUrl: value.logoUrl ?? "", brandColor: value.brandColor ?? DEFAULT_BRAND_COLOR }); })
        .catch(() => {});
    };
    load();
    window.addEventListener("platform-branding-updated", load);
    return () => { active = false; window.removeEventListener("platform-branding-updated", load); };
  }, []);

  return branding;
}

export function notifyPlatformBrandingUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("platform-branding-updated"));
}

export function BrandLogo({ url, alt, className, fallback }: { url?: string | null; alt: string; className: string; fallback: ReactNode }) {
  if (!url) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}

export function PlatformSiteName() {
  const branding = usePlatformBranding();
  return <>{branding.siteName}</>;
}

export function PlatformBrandingRuntime() {
  const branding = usePlatformBranding();
  const pathname = usePathname();
  const previousName = useRef(DEFAULT_PLATFORM_BRANDING.siteName);
  const originalFavicon = useRef<string | null | undefined>(undefined);
  const createdFavicon = useRef(false);

  useEffect(() => {
    setRootBrandTheme(branding.brandColor);
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", branding.brandColor);
    const title = document.title;
    const oldName = previousName.current;
    if (title.includes(oldName)) document.title = title.replaceAll(oldName, branding.siteName);
    else if (title.includes(DEFAULT_PLATFORM_BRANDING.siteName)) document.title = title.replaceAll(DEFAULT_PLATFORM_BRANDING.siteName, branding.siteName);
    previousName.current = branding.siteName;

    let icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (originalFavicon.current === undefined) originalFavicon.current = icon?.href ?? null;
    if (!icon && branding.logoUrl) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.append(icon);
      createdFavicon.current = true;
    }
    if (icon && branding.logoUrl) icon.href = branding.logoUrl;
    else if (icon && createdFavicon.current) icon.remove();
    else if (icon && originalFavicon.current) icon.href = originalFavicon.current;
  }, [branding, pathname]);

  return null;
}
