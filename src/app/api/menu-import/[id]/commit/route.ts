import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, categories, menuImportJobs, products } from "@/db/schema";
import { HttpError, withAuth } from "@/lib/auth";
import { catalogSnapshot } from "@/lib/menu-import-service";

export const POST = withAuth<{ id: string }>(async (_req, auth, { id }) => {
  const jobId = Number(id);
  if (!Number.isSafeInteger(jobId) || jobId < 1) throw new HttpError(404, "پیش‌نمایش پیدا نشد.");
  const result = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, auth.business.id)).for("update");
    const [job] = await tx.select().from(menuImportJobs).where(and(eq(menuImportJobs.id, jobId), eq(menuImportJobs.businessId, auth.business.id))).for("update");
    if (!job) throw new HttpError(404, "پیش‌نمایش پیدا نشد.");
    if (job.status === "committed" && job.result) return job.result;
    if (job.rows.some((row) => row.errors.length)) throw new HttpError(400, "فایل دارای ردیف نامعتبر است؛ خطاها را اصلاح و فایل تازه پیش‌نمایش کنید.");
    const currentHash = await catalogSnapshot(tx, auth.business.id);
    if (currentHash !== job.snapshotHash) throw new HttpError(409, "کاتالوگ پس از پیش‌نمایش تغییر کرده است؛ فایل را دوباره بررسی کنید.");

    const currentCategories = await tx.select().from(categories).where(eq(categories.businessId, auth.business.id)).orderBy(asc(categories.id));
    const categoryIds = new Set<number>();
    const categoryByName = new Map(currentCategories.map((item) => [item.name.trim().toLocaleLowerCase(), item.id]));
    const productIds: number[] = [];
    let created = 0, skipped = 0;
    for (const row of job.rows) {
      if (row.duplicate) { skipped++; continue; }
      let categoryId: number | null = null;
      const normalizedCategory = row.category.trim().toLocaleLowerCase();
      if (normalizedCategory) {
        categoryId = categoryByName.get(normalizedCategory) ?? null;
        if (!categoryId) {
          const [newCategory] = await tx.insert(categories).values({ businessId: auth.business.id, name: row.category, sortOrder: currentCategories.length + categoryIds.size }).returning({ id: categories.id });
          categoryId = newCategory.id;
          categoryByName.set(normalizedCategory, categoryId);
          categoryIds.add(categoryId);
        }
      }
      const [product] = await tx.insert(products).values({
        businessId: auth.business.id,
        categoryId,
        externalId: row.externalId || null,
        name: row.name,
        description: row.description,
        price: row.priceToman,
        isAvailable: row.available,
      }).onConflictDoNothing().returning({ id: products.id });
      if (product) { created++; productIds.push(product.id); }
      else skipped++;
    }
    const committed = { created, skipped, productIds, categoryIds: [...categoryIds] };
    await tx.update(menuImportJobs).set({ status: "committed", result: committed, committedAt: new Date() }).where(eq(menuImportJobs.id, job.id));
    return committed;
  });
  return Response.json({ item: result }, { headers: { "Cache-Control": "no-store" } });
}, { feature: "menu_import", manager: true });
