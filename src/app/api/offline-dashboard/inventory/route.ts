import { errorResponse, readJson } from "@/lib/auth";
import { syncOfflineInventoryWaste } from "@/lib/offline-inventory";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    return Response.json(await syncOfflineInventoryWaste(req, await readJson(req, 64_000)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
