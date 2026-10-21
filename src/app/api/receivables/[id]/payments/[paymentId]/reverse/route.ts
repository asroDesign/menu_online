import { HttpError, readJson, withAuth } from "@/lib/auth";
import { reverseReceivablePayment } from "@/lib/receivables";

export const POST = withAuth(async (req, auth, params: { id: string; paymentId: string }) => {
  const receivableId = Number(params.id);
  const paymentId = Number(params.paymentId);
  if (!Number.isSafeInteger(receivableId) || receivableId < 1 || !Number.isSafeInteger(paymentId) || paymentId < 1)
    throw new HttpError(400, "شناسه طلب یا دریافت معتبر نیست");
  const body = await readJson(req, 8 * 1024);
  if (typeof body.idempotencyKey !== "string") throw new HttpError(400, "شناسه یکتای برگشت معتبر نیست");
  const result = await reverseReceivablePayment(auth.business, auth.user.id, receivableId, paymentId, {
    amount: Number(body.amount), idempotencyKey: body.idempotencyKey,
    reason: typeof body.reason === "string" ? body.reason : "",
  });
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}, { feature: "accounting", manager: true, roles: ["accountant"] });
