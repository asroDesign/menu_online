import { errorResponse, readJson } from "@/lib/auth";
import { syncOfflineSale } from "@/lib/offline-pos";
export async function POST(req: Request) {
  try { return Response.json(await syncOfflineSale(req, await readJson(req, 64_000))); }
  catch (e) { return errorResponse(e); }
}
