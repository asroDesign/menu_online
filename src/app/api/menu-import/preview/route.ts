import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { menuImportJobs, products } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { catalogSnapshot, digest } from "@/lib/menu-import-service";
import { parseProductCsv } from "@/lib/menu-import";

const MAX_CSV_BYTES = 2 * 1024 * 1024;

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 7 * 1024 * 1024);
  const csv = typeof body.csv === "string" ? body.csv : "";
  const requestKey = typeof body.requestKey === "string" ? body.requestKey : "";
  if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) throw new HttpError(413, "حداکثر اندازه فایل ۲ مگابایت است.");
  if (!/^[0-9a-f-]{36}$/i.test(requestKey)) throw new HttpError(400, "شناسه پیش‌نمایش معتبر نیست.");
  await enforceRateLimit(req, "menu-import-preview", `${auth.business.id}:${auth.user.id}`, 12, 60 * 60_000, false);
  const sourceHash = digest(csv);
  const [prior] = await db.select().from(menuImportJobs).where(and(eq(menuImportJobs.businessId, auth.business.id), eq(menuImportJobs.requestKey, requestKey)));
  if (prior) {
    if (prior.sourceHash !== sourceHash) throw new HttpError(409, "این شناسه قبلاً برای فایل دیگری استفاده شده است.");
    return Response.json({ item: prior }, { headers: { "Cache-Control": "no-store" } });
  }
  const existing = await db.select({ externalId: products.externalId }).from(products).where(eq(products.businessId, auth.business.id));
  let rows;
  try { rows = parseProductCsv(csv, new Set(existing.map((row) => row.externalId).filter((id): id is string => !!id))); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "ساختار CSV معتبر نیست."); }
  const snapshotHash = await catalogSnapshot(db, auth.business.id);
  const [item] = await db.insert(menuImportJobs).values({
    businessId: auth.business.id,
    requestKey,
    sourceHash,
    snapshotHash,
    status: "preview",
    rows,
    createdBy: auth.user.id,
  }).onConflictDoNothing().returning();
  if (item) return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
  const [raced] = await db.select().from(menuImportJobs).where(and(eq(menuImportJobs.businessId, auth.business.id), eq(menuImportJobs.requestKey, requestKey)));
  if (!raced || raced.sourceHash !== sourceHash) throw new HttpError(409, "پیش‌نمایش هم‌زمان تغییر کرد؛ دوباره تلاش کنید.");
  return Response.json({ item: raced }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "menu_import", manager: true });
