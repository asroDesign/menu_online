import { errorResponse, readJson } from "@/lib/auth";
import { syncOfflineReceivablePayment } from "@/lib/offline-receivables";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    return Response.json(await syncOfflineReceivablePayment(req, await readJson(req, 16_000)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
