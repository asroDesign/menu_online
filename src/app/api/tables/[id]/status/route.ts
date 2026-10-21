import { HttpError, readJson, withAuth } from "@/lib/auth";
import { transitionTable } from "@/lib/table-lifecycle";

export const POST = withAuth(async (req, auth, params: { id: string }) => {
  const tableId = Number(params.id);
  if (!Number.isSafeInteger(tableId) || tableId < 1) throw new HttpError(400, "شناسه میز معتبر نیست");
  const body = await readJson(req, 4 * 1024);
  if (typeof body.status !== "string") throw new HttpError(400, "وضعیت میز را انتخاب کنید");
  const result = await transitionTable(auth.business.id, tableId, auth.user.id, body.status, typeof body.reason === "string" ? body.reason : "");
  return Response.json(result);
}, { feature: ["self_order", "cashier_pos"], manager: true, roles: ["cashier"] });
