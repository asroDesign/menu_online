"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { PlatformBranding } from "@/lib/app-settings";
import { DEFAULT_BRAND_COLOR, setRootBrandTheme } from "@/lib/brand-color";

const DEFAULT_PLATFORM_BRANDING: PlatformBranding = { siteName: "منوی دیجیتال", logoUrl: "", brandColor: DEFAULT_BRAND_COLOR };
let brandingRequest: Promise<PlatformBranding> | null = null;

function readPlatformBranding() {
  if (!brandingRequest) {
    // Branding is public and changes infrequently. The endpoint uses a
    // revalidating Cache-Control policy so this request does not disable BFCache.
    brandingRequest = fetch("/api/public/branding")
      .then((response) => response.ok ? response.json() as Promise<PlatformBranding> : null)
      .then((value) => value?.siteName ? { siteName: value.siteName, logoUrl: value.logoUrl ?? "", brandColor: value.brandColor ?? DEFAULT_BRAND_COLOR } : DEFAULT_PLATFORM_BRANDING)
      .catch(() => DEFAULT_PLATFORM_BRANDING);
  }
  return brandingRequest;
}

export function usePlatformBranding() {
  const [branding, setBranding] = useState(DEFAULT_PLATFORM_BRANDING);

  useEffect(() => {
    let active = true;
    const load = () => { void readPlatformBranding().then((value) => { if (active) setBranding(value); }); };
    load();
    window.addEventListener("platform-branding-updated", load);
    return () => { active = false; window.removeEventListener("platform-branding-updated", load); };
  }, []);

  return branding;
}

export function notifyPlatformBrandingUpdated() {
  if (typeof window !== "undefined") {
    brandingRequest = null;
    window.dispatchEvent(new Event("platform-branding-updated"));
  }
}

export function BrandLogo({ url, alt, className, fallback }: { url?: string | null; alt: string; className: string; fallback: ReactNode }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} onError={() => setFailedUrl(url)} />;
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
