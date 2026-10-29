import { SystemErrorScreen } from "@/components/system-error-screen";
import { DEFAULT_PLATFORM_BRANDING, getPlatformBranding } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export default async function NotFound() {
  const branding = await getPlatformBranding().catch(() => DEFAULT_PLATFORM_BRANDING);
  return <SystemErrorScreen variant="not-found" initialBranding={branding} />;
}
