import { HttpError, withAuth } from "@/lib/auth";
import { settleOrder } from "@/lib/orders";

export const POST = withAuth(async (_req, auth, params: { id: string }) => {
  const orderId = Number(params.id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) throw new HttpError(400, "شناسه سفارش معتبر نیست");
  await settleOrder(auth.business, auth.features, orderId, "credit", false, { creditSale: true, actorId: auth.user.id, actorType: "user" });
  return Response.json({ ok: true }, { status: 201 });
}, { feature: "accounting", manager: true, roles: ["accountant"] });
