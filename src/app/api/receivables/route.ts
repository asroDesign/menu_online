import { HttpError, readJson, withAuth } from "@/lib/auth";
import { createManualReceivable, listReceivables } from "@/lib/receivables";
import { endOfDayTehran, startOfDayTehran } from "@/lib/jalali";

const access = { feature: "accounting", manager: true, roles: ["accountant"] };

function datePart(value: string | null, end: boolean) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, "تاریخ فیلتر معتبر نیست");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new HttpError(400, "تاریخ فیلتر معتبر نیست");
  return end ? endOfDayTehran(date) : startOfDayTehran(date);
}

export const GET = withAuth(async (req, auth) => {
  const raw = new URL(req.url).searchParams.get("accountId");
  const accountId = raw === null ? undefined : Number(raw);
  if (raw !== null && (!Number.isSafeInteger(accountId) || Number(accountId) < 1)) throw new HttpError(400, "شناسه حساب معتبر نیست");
  const url = new URL(req.url);
  const from = datePart(url.searchParams.get("from"), false);
  const to = datePart(url.searchParams.get("to"), true);
  if (from && to && from > to) throw new HttpError(400, "ابتدای بازه باید پیش از انتهای آن باشد");
  if (from && to && to.getTime() - from.getTime() > 5 * 366 * 86_400_000) throw new HttpError(400, "بازهٔ جست‌وجو حداکثر پنج سال است");
  return Response.json({ items: await listReceivables(auth.business.id, accountId, { from, to }) }, { headers: { "Cache-Control": "no-store" } });
}, access);

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 8 * 1024);
  const item = await createManualReceivable(auth.business, auth.user.id, {
    accountId: Number(body.accountId), amount: Number(body.amount),
    dueAt: typeof body.dueAt === "string" ? body.dueAt : null,
    description: typeof body.description === "string" ? body.description : "",
  });
  return Response.json({ item }, { status: 201 });
}, access);
