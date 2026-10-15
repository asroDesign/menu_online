import { createOrder, listOrders, parseOrderInput, settleOrder } from "@/lib/orders";
import { HttpError, readJson, withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (req, { business }) => {
    const url = new URL(req.url);
    const statuses = url.searchParams.get("status")?.split(",").filter(Boolean);
    const limit = Math.min(500, Number(url.searchParams.get("limit")) || 200);
    return Response.json({ items: await listOrders(business.id, { statuses, limit }) });
  },
  { feature: "cashier_pos" },
);

export const POST = withAuth(
  async (req, auth) => {
    const raw = await readJson(req);
    const input = parseOrderInput(raw);
    if (input.payNow && !["cash", "pos", "card"].includes(input.payNow)) throw new HttpError(400, "روش پرداخت نامعتبر است");
    const source = raw.source === "cashier" ? "cashier" : "waiter";
    const order = await createOrder(auth.business, input, source, auth.features);
    if (input.payNow) await settleOrder(auth.business, auth.features, order.id, input.payNow, false);
    const [item] = await listOrders(auth.business.id, { id: order.id });
    return Response.json({ item }, { status: 201 });
  },
  { feature: "cashier_pos", manager: true, roles: ["waiter", "cashier"] },
);
