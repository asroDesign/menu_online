import { HttpError, readJson, withAuth } from "@/lib/auth";
import { listOrders, queuePrintJobs } from "@/lib/orders";
import { enforceRateLimit } from "@/lib/rate-limit";

export const POST = withAuth<{ id: string }>(async (req, auth, { id }) => {
  await enforceRateLimit(req, "manual-order-print", `${auth.business.id}:${auth.user.id}`, 20, 60_000);
  const body = await readJson(req);
  if (!["customer", "kitchen", "cafe"].includes(String(body.kind))) throw new HttpError(400, "نوع فیش نامعتبر است");
  const orderId = Number(id);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) throw new HttpError(400, "شماره سفارش نامعتبر است");
  const [order] = await listOrders(auth.business.id, { id: orderId });
  if (!order) throw new HttpError(404, "سفارش پیدا نشد");
  const count = await queuePrintJobs(auth.business, orderId, auth.features, false, undefined, undefined, "settled", body.kind as "customer" | "kitchen" | "cafe");
  if (!count) throw new HttpError(409, "پرینتر متناسب با این فیش تعریف نشده است؛ تنظیمات پرینتر و دسته‌بندی‌ها را بررسی کنید");
  return Response.json({ count });
}, { feature: "cloud_printer", manager: true, roles: ["cashier"] });
