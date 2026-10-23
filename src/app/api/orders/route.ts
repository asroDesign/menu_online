import { parseCashierDebt } from "@/lib/cashier-debt-input";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { createOrder, listOrders, parseOrderInput, settleOrder, type OrderTransaction } from "@/lib/orders";
import { ensureAccounting } from "@/lib/accounting";
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
    let creditDetails: ReturnType<typeof parseCashierDebt> | undefined;
    if (raw.creditDetails) { try { creditDetails = parseCashierDebt(raw.creditDetails); } catch (error) { throw new HttpError(400, (error as Error).message); } }
    const input = parseOrderInput(creditDetails ? { ...raw, customerName: creditDetails.name, customerPhone: creditDetails.phone } : raw);
    if (input.payNow && !["cash", "pos", "card", "credit"].includes(input.payNow)) throw new HttpError(400, "روش پرداخت نامعتبر است");
    const requestedCashier = raw.source === "cashier";
    const source = auth.role === "cashier" || (requestedCashier && isManagerRole(auth.role)) ? "cashier" : "waiter";
    if (input.payNow === "credit" && source !== "cashier") throw new HttpError(403, "ثبت فروش نسیه فقط از صندوق مجاز است");
    if (source === "waiter" && (input.payNow || input.discountCode || input.manualDiscountAmount || input.useCashback || input.useMembership)) {
      throw new HttpError(403, "پنل گارسون فقط مجاز به ثبت سفارش است؛ پرداخت و تخفیف در صندوق انجام می‌شود");
    }
    if (input.manualDiscountAmount && source !== "cashier") throw new HttpError(403, "تخفیف دستی فقط در سفارش‌گیر صندوق در دسترس است");
    if (auth.role === "waiter") {
      const [member] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, auth.business.id), eq(staff.userId, auth.user.id), eq(staff.isActive, true)));
      input.waiterId = member?.id ?? null;
    }
    if (input.payNow === "credit" && input.appendTo) throw new HttpError(400, "ثبت نسیه برای افزودن به سفارش جاری ممکن نیست؛ ابتدا سفارش را جداگانه ثبت کنید");
    const order = input.payNow
      ? await (async () => {
        // Initialize the chart before opening the order transaction so no second connection waits on its advisory lock.
        await ensureAccounting(auth.business);
        return db.transaction(async (rawTx) => {
          const executor = rawTx as unknown as OrderTransaction;
          // Settlement below queues the creation/preparation workflow itself when
          // it transitions the new order. Do not queue that same workflow here too.
          const created = await createOrder(auth.business, input, source, auth.features, {
            actorId: auth.user.id, executor, deferPrint: input.payNow !== "credit",
          });
          await settleOrder(auth.business, auth.features, created.id, input.payNow!, false, {
            creditSale: input.payNow === "credit", creditDetails, actorId: auth.user.id, actorType: auth.role, executor,
          });
          return created;
        });
      })()
      : await createOrder(auth.business, input, source, auth.features, { actorId: auth.user.id });
    logInfo("order.created", { businessId: auth.business.id, orderId: order.id, source });
    const [item] = await listOrders(auth.business.id, { id: order.id });
    return Response.json({ item }, { status: 201 });
  },
  { feature: "cashier_pos", manager: true, roles: ["waiter", "cashier"] },
);
