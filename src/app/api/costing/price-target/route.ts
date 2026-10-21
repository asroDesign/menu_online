import { HttpError, readJson, withAuth } from "@/lib/auth";
import { applyPriceTarget, getPriceTargetSnapshot } from "@/lib/price-target";

export const GET = withAuth(async (req, auth) => {
  const raw = new URL(req.url).searchParams.get("productId");
  const productId = Number(raw);
  if (!raw || !Number.isSafeInteger(productId) || productId < 1) throw new HttpError(400, "شناسه محصول معتبر نیست");
  return Response.json({ item: await getPriceTargetSnapshot(auth.business.id, productId) }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "costing", manager: true, roles: ["accountant"] });

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 8 * 1024);
  if (typeof body.snapshotHash !== "string" || typeof body.targetType !== "string") throw new HttpError(400, "دادهٔ محاسبه قیمت ناقص است");
  const result = await applyPriceTarget(auth.business, auth.user.id, {
    productId: Number(body.productId), targetType: body.targetType,
    targetPercent: Number(body.targetPercent), snapshotHash: body.snapshotHash,
  });
  return Response.json(result);
}, { feature: "costing", manager: true });
