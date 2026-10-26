import { errorResponse } from "@/lib/auth";
import { offlineCatalog } from "@/lib/offline-pos";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { return Response.json(await offlineCatalog(req), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return errorResponse(e); }
}
