import { tablesCrud } from "@/lib/resources";
import { HttpError, withAuth } from "@/lib/auth";
import { deleteDiningTable } from "@/lib/table-lifecycle";

export const dynamic = "force-dynamic";
export const PATCH = tablesCrud.update;
export const DELETE = withAuth(async (_req, auth, params: { id: string }) => {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "شناسه میز معتبر نیست");
  return Response.json(await deleteDiningTable(auth.business.id, id));
}, { feature: ["self_order", "cashier_pos"], manager: true, roles: ["cashier"] });
