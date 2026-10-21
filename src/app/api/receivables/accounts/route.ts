import { HttpError, readJson, withAuth } from "@/lib/auth";
import { createReceivableAccount, listReceivableAccounts } from "@/lib/receivables";

const access = { feature: "accounting", manager: true, roles: ["accountant"] };

export const GET = withAuth(async (_req, auth) =>
  Response.json({ items: await listReceivableAccounts(auth.business.id) }, { headers: { "Cache-Control": "no-store" } }), access);

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 8 * 1024);
  if (typeof body.name !== "string") throw new HttpError(400, "نام شخص یا سازمان را وارد کنید");
  const item = await createReceivableAccount(auth.business.id, auth.user.id, {
    name: body.name, type: typeof body.type === "string" ? body.type : "person",
    phone: typeof body.phone === "string" ? body.phone : "", note: typeof body.note === "string" ? body.note : "",
    customerId: body.customerId === undefined || body.customerId === null ? null : Number(body.customerId),
  });
  return Response.json({ item }, { status: 201 });
}, access);
