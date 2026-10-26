import { errorResponse } from "@/lib/auth";
import { offlineOrderHistoryPage } from "@/lib/offline-dashboard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    return Response.json(await offlineOrderHistoryPage(req), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
