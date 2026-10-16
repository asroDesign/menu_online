import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { createOrder, listOrders, parseOrderInput, settleOrder } from "@/lib/orders";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { isManagerRole } from "@/lib/roles";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (req, auth) => {
    const url = new URL(req.url);
    const deleted = url.searchParams.get("deleted") === "true";
    if (deleted && !isManagerRole(auth.role)) throw new HttpError(403, "مشاهده‌ی سفارش‌های حذف‌شده فقط برای مدیر رستوران مجاز است");
    const statuses = url.searchParams.get("status")?.split(",").filter(Boolean);
    const limit = Math.min(500, Number(url.searchParams.get("limit")) || 200);
    return Response.json({ items: await listOrders(auth.business.id, { statuses, limit, deleted }) });
  },
  { feature: "cashier_pos" },
);

export const POST = withAuth(
  async (req, auth) => {
    await enforceRateLimit(req, "staff-order", `${auth.business.id}:${auth.user.id}`, 30, 60_000);
    const raw = await readJson(req);
    const input = parseOrderInput(raw);
    if (input.payNow && !["cash", "pos", "card"].includes(input.payNow)) throw new HttpError(400, "روش پرداخت نامعتبر است");
    const requestedCashier = raw.source === "cashier";
    const source = auth.role === "cashier" || (requestedCashier && isManagerRole(auth.role)) ? "cashier" : "waiter";
    if (source === "waiter" && (input.payNow || input.discountCode || input.manualDiscountAmount || input.useCashback)) {
      throw new HttpError(403, "پنل گارسون فقط مجاز به ثبت سفارش است؛ پرداخت و تخفیف در صندوق انجام می‌شود");
    }
    if (input.manualDiscountAmount && source !== "cashier") throw new HttpError(403, "تخفیف دستی فقط در سفارش‌گیر صندوق در دسترس است");
    if (auth.role === "waiter") {
      const [member] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, auth.business.id), eq(staff.userId, auth.user.id), eq(staff.isActive, true)));
      input.waiterId = member?.id ?? null;
    }
    const order = await createOrder(auth.business, input, source, auth.features);
    if (input.payNow) await settleOrder(auth.business, auth.features, order.id, input.payNow, false);
    logInfo("order.created", { businessId: auth.business.id, orderId: order.id, source });
    const [item] = await listOrders(auth.business.id, { id: order.id });
    return Response.json({ item }, { status: 201 });
  },
  { feature: "cashier_pos", manager: true, roles: ["waiter", "cashier"] },
);
