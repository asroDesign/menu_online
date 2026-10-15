import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, calls, devices, orders, pagers, posRequests, printJobs } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { featuresOf } from "@/lib/entitlements";
import { listOrders, normPhone } from "@/lib/orders";
import { approvePosRequest, expirePosRequests } from "@/lib/pos";
import { hasAny } from "@/lib/plans";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ code: string; action: string }> };

async function handle(req: Request, ctx: Ctx) {
  try {
    const { code, action } = await ctx.params;
    const [dev] = await db.select().from(devices).where(eq(devices.code, code));
    if (!dev) throw new HttpError(404, "دستگاه پیدا نشد");
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, dev.businessId));
    if (!biz || biz.isSuspended) throw new HttpError(403, "دسترسی مسدود است");
    const features = await featuresOf(biz);
    const need = (k: string, kinds: string[]) => {
      if (!hasAny(features, k)) throw new HttpError(403, "این امکان در پلن فعال نیست");
      if (!kinds.includes(dev.kind)) throw new HttpError(403, "این دستگاه مجاز به این عملیات نیست");
    };
    await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, dev.id));
    const body = req.method === "POST" ? await readJson(req) : {};

    switch (action) {
      case "ping":
        return Response.json({ ok: true, device: dev.name, business: biz.name });
      case "jobs": {
        need("cloud_printer", ["printer"]);
        const jobs = await db.select().from(printJobs).where(and(eq(printJobs.deviceId, dev.id), eq(printJobs.status, "pending"))).orderBy(printJobs.id).limit(20);
        if (jobs.length) await db.update(printJobs).set({ status: "printed", printedAt: new Date() }).where(inArray(printJobs.id, jobs.map((j) => j.id)));
        return Response.json({ jobs: jobs.map((j) => ({ id: j.id, orderId: j.orderId, content: j.content })) });
      }
      case "orders": {
        need("tablet_pos", ["tablet", "pos"]);
        if (req.method === "POST") {
          const st = String(body.status);
          if (!["preparing", "ready", "served"].includes(st)) throw new HttpError(400, "وضعیت نامعتبر است");
          const [r] = await db.update(orders).set({ status: st, updatedAt: new Date() }).where(and(eq(orders.id, Number(body.orderId)), eq(orders.businessId, biz.id))).returning({ id: orders.id });
          if (!r) throw new HttpError(404, "سفارش پیدا نشد");
          return Response.json({ ok: true });
        }
        const list = await listOrders(biz.id, { statuses: ["pending", "preparing", "ready"], limit: 60 });
        return Response.json({ business: biz.name, device: dev.name, orders: list.reverse() });
      }
      case "pager": {
        // food-court pager transmitter: GET = rings waiting to be sent, POST {ids} = acknowledge
        need("foodcourt_pager", ["pager"]);
        if (req.method === "POST") {
          const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger);
          if (ids.length) await db.update(pagers).set({ ringSentAt: new Date() }).where(and(eq(pagers.businessId, biz.id), inArray(pagers.id, ids)));
          return Response.json({ ok: true, acked: ids.length });
        }
        const rows = await db.select({ id: pagers.id, number: pagers.number }).from(pagers).where(and(eq(pagers.businessId, biz.id), eq(pagers.status, "ringing"), sql`${pagers.ringRequestedAt} is not null`, or(isNull(pagers.ringSentAt), sql`${pagers.ringSentAt} < ${pagers.ringRequestedAt}`))).orderBy(asc(pagers.ringRequestedAt)).limit(20);
        return Response.json({ rings: rows });
      }
      case "pos": {
        // card terminal bridge: GET = take pending payment requests (each is handed out ONCE, never re-sent),
        // POST {requestId,status,refNo,detail} = result
        need("tablet_pos", ["pos"]);
        await expirePosRequests(biz.id);
        if (req.method === "POST") {
          const st = String(body.status);
          if (!["approved", "failed", "canceled"].includes(st)) throw new HttpError(400, "وضعیت نامعتبر است");
          const [r] = await db.select().from(posRequests).where(and(eq(posRequests.id, Number(body.requestId)), eq(posRequests.businessId, biz.id)));
          if (!r) throw new HttpError(404, "درخواست پیدا نشد");
          if (r.status === "approved") throw new HttpError(400, "این درخواست قبلاً نهایی شده است");
          if (st === "approved") await approvePosRequest(biz, features, r, String(body.refNo ?? ""));
          else if (r.status === "pending") await db.update(posRequests).set({ status: st, refNo: String(body.refNo ?? "").slice(0, 40), detail: String(body.detail ?? "").slice(0, 200), updatedAt: new Date() }).where(eq(posRequests.id, r.id));
          return Response.json({ ok: true });
        }
        const cand = await db.select({ id: posRequests.id }).from(posRequests).where(and(eq(posRequests.businessId, biz.id), eq(posRequests.status, "pending"), isNull(posRequests.pickedAt), or(isNull(posRequests.deviceId), eq(posRequests.deviceId, dev.id)))).orderBy(asc(posRequests.id)).limit(5);
        const taken = cand.length ? await db.update(posRequests).set({ pickedAt: new Date(), updatedAt: new Date() }).where(and(inArray(posRequests.id, cand.map((c) => c.id)), isNull(posRequests.pickedAt), eq(posRequests.status, "pending"))).returning() : [];
        const nums = taken.length ? await db.select({ id: orders.id, number: orders.number }).from(orders).where(inArray(orders.id, taken.map((t) => t.orderId))) : [];
        return Response.json({ requests: taken.map((r) => ({ id: r.id, orderNumber: nums.find((n) => n.id === r.orderId)?.number ?? 0, amountToman: r.amount, amountRial: r.amount * 10 })) });
      }
      case "call": {
        need("caller_id", ["caller_id"]);
        const phone = normPhone(String(body.phone ?? ""));
        if (phone.length < 10) throw new HttpError(400, "شماره نامعتبر است");
        await db.insert(calls).values({ businessId: biz.id, phone });
        return Response.json({ ok: true });
      }
      case "weight": {
        need("scale", ["scale"]);
        const v = Number(body.value);
        if (!Number.isFinite(v) || v < 0) throw new HttpError(400, "مقدار نامعتبر است");
        await db.update(devices).set({ lastValue: v }).where(eq(devices.id, dev.id));
        return Response.json({ ok: true });
      }
    }
    throw new HttpError(404, "عملیات ناشناخته");
  } catch (e) {
    return errorResponse(e);
  }
}
export const GET = handle;
export const POST = handle;
void desc;
