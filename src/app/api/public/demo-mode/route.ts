import { DEMO_ENABLED } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";
export const GET = () => Response.json({ enabled: DEMO_ENABLED }, { headers: { "Cache-Control": "no-store" } });
