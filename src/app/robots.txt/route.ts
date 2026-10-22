import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-static";

export function GET() {
  const base = getSiteUrl();
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /dashboard",
    "Disallow: /affiliate/dashboard",
    "Disallow: /affiliate/login",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    `Host: ${new URL(base).host}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
