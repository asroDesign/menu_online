import { HttpError, withAuth } from "@/lib/auth";
import { receivableStatement } from "@/lib/receivables";

export const GET = withAuth(async (_req, auth, params: { id: string }) => {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "شناسه طلب معتبر نیست");
  return Response.json(await receivableStatement(auth.business.id, id), { headers: { "Cache-Control": "no-store" } });
}, { feature: "accounting", manager: true, roles: ["accountant"] });
