import { errorResponse } from "@/lib/auth";
import { offlineDashboardSnapshot } from "@/lib/offline-dashboard";

export const dynamic = "force-dynamic";
export async function GET(req: Request, context: { params: Promise<{ dataset: string }> }) {
  try {
    const { dataset } = await context.params;
    return Response.json(await offlineDashboardSnapshot(req, dataset), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
