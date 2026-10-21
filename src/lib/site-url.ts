const DEFAULT_SITE_URL = "https://menupeak.ir";

export function getSiteUrl(configured = process.env.NEXT_PUBLIC_SITE_URL) {
  try {
    return new URL(configured || DEFAULT_SITE_URL).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}
