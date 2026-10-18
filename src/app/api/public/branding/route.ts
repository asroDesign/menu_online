import { getPlatformBranding } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const branding = await getPlatformBranding();
  return Response.json(branding, { headers: { "Cache-Control": "no-store" } });
}
