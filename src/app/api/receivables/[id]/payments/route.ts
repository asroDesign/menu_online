import { HttpError, readJson, withAuth } from "@/lib/auth";
import { recordReceivablePayment } from "@/lib/receivables";

export const POST = withAuth(async (req, auth, params: { id: string }) => {
  const receivableId = Number(params.id);
  if (!Number.isSafeInteger(receivableId) || receivableId < 1) throw new HttpError(400, "شناسه طلب معتبر نیست");
  const body = await readJson(req, 8 * 1024);
  if (typeof body.idempotencyKey !== "string" || typeof body.method !== "string") throw new HttpError(400, "اطلاعات دریافت ناقص است");
  const result = await recordReceivablePayment(auth.business, auth.user.id, receivableId, {
    amount: Number(body.amount), method: body.method,
    bankAccountId: body.bankAccountId === undefined || body.bankAccountId === null ? null : Number(body.bankAccountId),
    idempotencyKey: body.idempotencyKey, note: typeof body.note === "string" ? body.note : "",
  });
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}, { feature: "accounting", manager: true, roles: ["accountant"] });
