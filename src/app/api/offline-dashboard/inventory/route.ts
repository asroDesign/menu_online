import { errorResponse, readJson } from "@/lib/auth";
import { syncOfflineInventoryMovement, syncOfflineInventoryReceive, syncOfflineInventoryWaste } from "@/lib/offline-inventory";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const command = await readJson(req, 256_000);
    const action = command && typeof command === "object" && "action" in command ? command.action : null;
    const response = action === "receive"
      ? await syncOfflineInventoryReceive(req, command)
      : action === "movement"
        ? await syncOfflineInventoryMovement(req, command)
        : await syncOfflineInventoryWaste(req, command);
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
