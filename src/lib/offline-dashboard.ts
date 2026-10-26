import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, categories, diningTables, offlineTerminals, offlineWorkspaceSnapshots, products } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { hasAny } from "@/lib/plans";
import { offlineAuth } from "@/lib/offline-pos";

const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 4_000_000;

type MenuPayload = {
  business: { id: number; name: string; slug: string; type: string; logoUrl: string; accentColor: string; taxPercent: number; servicePercent: number };
  categories: { id: number; parentCategoryId: number | null; name: string; description: string; emoji: string; imageUrl: string; sortOrder: number; isActive: boolean }[];
  products: { id: number; categoryId: number | null; name: string; description: string; videoUrl: string; price: number; sellingMode: string; yieldRatio: number; oldPrice: number | null; emoji: string; imageUrl: string; prepMinutes: number; isAvailable: boolean; isFeatured: boolean; modifierGroups: unknown; dietaryTags: string[]; allergenTags: string[] }[];
  tables: { id: number; name: string; zone: string; capacity: number; operationalStatus: string }[];
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function responseShape(row: typeof offlineWorkspaceSnapshots.$inferSelect) {
  return {
    schemaVersion: row.schemaVersion,
    dataset: row.dataset,
    businessId: row.businessId,
    revision: row.revision,
    snapshotId: row.id,
    issuedAt: row.issuedAt.toISOString(),
    validUntil: row.validUntil.toISOString(),
    payload: row.payload,
  };
}

export async function offlineDashboardSnapshot(req: Request, dataset: string) {
  if (dataset !== "menu") throw new HttpError(404, "این مجموعهٔ داده برای دریافت آفلاین تعریف نشده است");
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "دریافت دادهٔ محلی در اشتراک فعلی فعال نیست");

  return db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) {
      throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    }
    const [currentBusiness] = await tx.select({ id: businesses.id, name: businesses.name, slug: businesses.slug, type: businesses.type, logoUrl: businesses.logoUrl, accentColor: businesses.accentColor, taxPercent: businesses.taxPercent, servicePercent: businesses.servicePercent }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!currentBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const categoryRows = await tx.select({ id: categories.id, parentCategoryId: categories.parentCategoryId, name: categories.name, description: categories.description, emoji: categories.emoji, imageUrl: categories.imageUrl, sortOrder: categories.sortOrder, isActive: categories.isActive }).from(categories).where(eq(categories.businessId, business.id)).orderBy(asc(categories.sortOrder), asc(categories.id));
    const productRows = await tx.select({ id: products.id, categoryId: products.categoryId, name: products.name, description: products.description, videoUrl: products.videoUrl, price: products.price, sellingMode: products.sellingMode, yieldRatio: products.yieldRatio, oldPrice: products.oldPrice, emoji: products.emoji, imageUrl: products.imageUrl, prepMinutes: products.prepMinutes, isAvailable: products.isAvailable, isFeatured: products.isFeatured, modifierGroups: products.modifierGroups, dietaryTags: products.dietaryTags, allergenTags: products.allergenTags }).from(products).where(eq(products.businessId, business.id)).orderBy(asc(products.id));
    const tableRows = await tx.select({ id: diningTables.id, name: diningTables.name, zone: diningTables.zone, capacity: diningTables.capacity, operationalStatus: diningTables.operationalStatus }).from(diningTables).where(eq(diningTables.businessId, business.id)).orderBy(asc(diningTables.id));
    const payload: MenuPayload = { business: currentBusiness, categories: categoryRows, products: productRows, tables: tableRows };
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_SNAPSHOT_BYTES) throw new HttpError(413, "اطلاعات منو از سقف دریافت آفلاین بیشتر است؛ تصاویر باید از نشانی فایل بارگذاری‌شده باشند");
    const payloadHash = createHash("sha256").update(canonical(payload)).digest("hex");
    const [latest] = await tx.select().from(offlineWorkspaceSnapshots).where(and(eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.dataset, dataset))).orderBy(desc(offlineWorkspaceSnapshots.revision)).limit(1);
    const now = new Date();
    const validUntil = new Date(now.getTime() + SNAPSHOT_TTL_MS);

    if (latest?.payloadHash === payloadHash) {
      const [refreshed] = await tx.update(offlineWorkspaceSnapshots).set({ issuedAt: now, validUntil }).where(and(eq(offlineWorkspaceSnapshots.id, latest.id), eq(offlineWorkspaceSnapshots.terminalId, terminal.id), eq(offlineWorkspaceSnapshots.businessId, business.id))).returning();
      if (!refreshed) throw new HttpError(409, "تمدید نسخهٔ منوی محلی انجام نشد");
      return responseShape(refreshed);
    }

    const [saved] = await tx.insert(offlineWorkspaceSnapshots).values({ id: randomUUID(), terminalId: terminal.id, businessId: business.id, dataset, revision: (latest?.revision ?? 0) + 1, schemaVersion: 1, payloadHash, payload, issuedAt: now, validUntil }).returning();
    if (!saved) throw new HttpError(500, "ذخیرهٔ نسخهٔ منوی محلی انجام نشد");
    return responseShape(saved);
  }, { isolationLevel: "repeatable read" });
}
