import type { MetadataRoute } from "next";
import { getPublicPosts, getPublicTutorials } from "@/lib/marketing-content";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://menudigital.ir").replace(/\/$/, "");
  const [posts, tutorials] = await Promise.all([getPublicPosts(1000), getPublicTutorials(1000)]);
  const staticRoutes = ["", "/plans", "/about", "/contact", "/consultation", "/terms", "/demo", "/faq", "/blog", "/tutorials", "/testimonials"];
  return [
    ...staticRoutes.map((path) => ({ url: `${base}${path || "/"}`, lastModified: new Date(), changeFrequency: path === "/blog" || path === "/tutorials" ? "daily" as const : "monthly" as const, priority: path === "" ? 1 : 0.6 })),
    ...posts.filter((x) => !x.noIndex).map((x) => ({ url: `${base}/blog/${x.slug}`, lastModified: x.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...tutorials.filter((x) => !x.noIndex).map((x) => ({ url: `${base}/tutorials/${x.slug}`, lastModified: x.updatedAt, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
