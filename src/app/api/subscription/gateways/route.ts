import { withAuth } from "@/lib/auth";
import { getSetting } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export const GET = withAuth(async () => {
  const config = await getSetting("platformPayments", { zarinpalEnabled: false, zarinpalMerchantId: "", zibalEnabled: false, zibalMerchantId: "" });
  return Response.json({ gateways: [{ id: "zarinpal", name: "زرین‌پال", enabled: config.zarinpalEnabled && !!config.zarinpalMerchantId }, { id: "zibal", name: "زیبال", enabled: config.zibalEnabled && !!config.zibalMerchantId }].filter((x) => x.enabled) });
}, { manager: true, allowUnpaid: true });
