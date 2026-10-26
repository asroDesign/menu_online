import { errorResponse, readJson } from "@/lib/auth";
import { syncOfflineDashboardCommand } from "@/lib/offline-dashboard";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    return Response.json(await syncOfflineDashboardCommand(req, await readJson(req, 64_000)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
