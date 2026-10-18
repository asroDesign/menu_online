import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://menupeak.ir").replace(/\/$/, "");
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/dashboard", "/affiliate/dashboard", "/affiliate/login"] }], sitemap: `${base}/sitemap.xml`, host: base };
}
