import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, categories, customerRewardCampaigns, customerRewardClaims, diningTables, offlineTerminals, offlineWorkspaceCommands, offlineWorkspaceSnapshots, products } from "@/db/schema";
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

type MenuCommand = {
  schemaVersion: 1;
  id: string;
  businessId: number;
  module: "menu";
  action: "update_product" | "update_category";
  baseDataset: "menu";
  baseSnapshotId: string;
  baseRevision: number;
  payload: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseMenuCommand(raw: unknown): MenuCommand {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.module !== "menu" || !["update_product", "update_category"].includes(String(raw.action))) {
    throw new HttpError(400, "قالب فرمان منوی آفلاین معتبر نیست");
  }
  if (typeof raw.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.id)) throw new HttpError(400, "شناسه فرمان معتبر نیست");
  if (!Number.isSafeInteger(raw.businessId) || Number(raw.businessId) < 1) throw new HttpError(400, "کسب‌وکار فرمان معتبر نیست");
  if (raw.baseDataset !== "menu" || typeof raw.baseSnapshotId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.baseSnapshotId)) throw new HttpError(400, "snapshot پایهٔ فرمان معتبر نیست");
  if (!Number.isSafeInteger(raw.baseRevision) || Number(raw.baseRevision) < 1) throw new HttpError(400, "نسخه پایهٔ فرمان معتبر نیست");
  if (!isRecord(raw.payload)) throw new HttpError(400, "محتوای فرمان معتبر نیست");
  const action = raw.action as MenuCommand["action"];
  const payload = raw.payload;
  const patch = payload.patch;
  const expectedId = action === "update_product" ? payload.productId : payload.categoryId;
  if (!Number.isSafeInteger(expectedId) || Number(expectedId) < 1 || !isRecord(patch)) throw new HttpError(400, "شناسه یا تغییرات منو معتبر نیست");
  const allowed = action === "update_product" ? ["name", "description", "price", "isAvailable"] : ["name", "description", "isActive", "sortOrder"];
  const keys = Object.keys(patch);
  if (!keys.length || keys.some((key) => !allowed.includes(key))) throw new HttpError(400, "فرمان فقط می‌تواند فیلدهای مجاز منو را تغییر دهد");
  if ("name" in patch && (typeof patch.name !== "string" || !patch.name.trim() || patch.name.trim().length > (action === "update_product" ? 100 : 60))) throw new HttpError(400, "نام منو معتبر نیست");
  if ("description" in patch && (typeof patch.description !== "string" || patch.description.length > (action === "update_product" ? 400 : 500))) throw new HttpError(400, "توضیح منو معتبر نیست");
  if ("price" in patch && (!Number.isSafeInteger(patch.price) || Number(patch.price) < 0 || Number(patch.price) > 100_000_000)) throw new HttpError(400, "قیمت محصول معتبر نیست");
  if ("isAvailable" in patch && typeof patch.isAvailable !== "boolean") throw new HttpError(400, "وضعیت موجودی محصول معتبر نیست");
  if ("isActive" in patch && typeof patch.isActive !== "boolean") throw new HttpError(400, "وضعیت دسته‌بندی معتبر نیست");
  if ("sortOrder" in patch && (!Number.isSafeInteger(patch.sortOrder) || Number(patch.sortOrder) < 0 || Number(patch.sortOrder) > 10_000)) throw new HttpError(400, "ترتیب دسته‌بندی معتبر نیست");
  return raw as unknown as MenuCommand;
}

export async function syncOfflineDashboardCommand(req: Request, raw: unknown) {
  const command = parseMenuCommand(raw);
  const { terminal, business, features } = await offlineAuth(req);
  if (!hasAny(features, "cashier_pos")) throw new HttpError(403, "همگام‌سازی پنل آفلاین در اشتراک فعلی فعال نیست");
  if (command.businessId !== business.id) throw new HttpError(403, "فرمان متعلق به کسب‌وکار این دستگاه نیست");
  const payloadHash = createHash("sha256").update(canonical(command)).digest("hex");

  const outcome = await db.transaction(async (tx) => {
    const [lockedTerminal] = await tx.select().from(offlineTerminals).where(eq(offlineTerminals.id, terminal.id)).for("update");
    if (!lockedTerminal || lockedTerminal.revokedAt || lockedTerminal.businessId !== business.id) throw new HttpError(401, "دسترسی این صندوق لغو شده است");
    const [currentBusiness] = await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, business.id), eq(businesses.isSuspended, false)));
    if (!currentBusiness) throw new HttpError(403, "کسب‌وکار فعال نیست");

    const [previous] = await tx.select().from(offlineWorkspaceCommands).where(eq(offlineWorkspaceCommands.id, command.id)).for("update");
    if (previous) {
      if (previous.terminalId !== terminal.id || previous.businessId !== business.id || previous.payloadHash !== payloadHash) {
        return { httpStatus: 409, response: { commandId: command.id, state: "conflict", receipt: "", error: "شناسه فرمان قبلاً با محتوای دیگری ثبت شده است" } };
      }
      return { httpStatus: previous.httpStatus, response: previous.result };
    }

    const snapshot = await tx.select().from(offlineWorkspaceSnapshots).where(and(
      eq(offlineWorkspaceSnapshots.id, command.baseSnapshotId),
      eq(offlineWorkspaceSnapshots.terminalId, terminal.id),
      eq(offlineWorkspaceSnapshots.businessId, business.id),
      eq(offlineWorkspaceSnapshots.dataset, "menu"),
      eq(offlineWorkspaceSnapshots.revision, command.baseRevision),
    )).for("update").then((rows) => rows[0]);

    const record = async (state: "applied" | "conflict" | "rejected", httpStatus: 200 | 409 | 422, error = "", receipt = "") => {
      const response = { commandId: command.id, state, receipt, ...(error ? { error } : {}) };
      await tx.insert(offlineWorkspaceCommands).values({
        id: command.id, terminalId: terminal.id, businessId: business.id, actorId: terminal.createdBy,
        module: command.module, action: command.action, payloadHash, payload: command as unknown as Record<string, unknown>,
        state, httpStatus, error, receipt, result: response,
      });
      return { httpStatus, response };
    };

    if (!snapshot || snapshot.validUntil <= new Date()) return record("conflict", 409, "snapshot منوی مبنا پیدا نشد یا اعتبارش پایان یافته است");
    const targetId = Number(command.action === "update_product" ? command.payload.productId : command.payload.categoryId);
    const patch = command.payload.patch as Record<string, unknown>;

    if (command.action === "update_product") {
      const [current] = await tx.select({ id: products.id, name: products.name, description: products.description, price: products.price, isAvailable: products.isAvailable })
        .from(products).where(and(eq(products.id, targetId), eq(products.businessId, business.id))).for("update");
      const baseRows = (snapshot.payload.products as Record<string, unknown>[] | undefined) ?? [];
      const base = baseRows.find((row) => row.id === targetId);
      if (!current || !base) return record("conflict", 409, "محصول در snapshot مبنا یا سرور پیدا نشد");
      if (Object.keys(patch).some((key) => canonical(current[key as keyof typeof current]) !== canonical(base[key]))) {
        return record("conflict", 409, "محصول از زمان دریافت snapshot تغییر کرده است؛ نسخهٔ تازه دریافت و تغییر را دوباره بررسی کنید");
      }
      const nextPrice = Number(patch.price ?? current.price);
      const nextAvailability = Boolean(patch.isAvailable ?? current.isAvailable);
      if (nextPrice <= 0 || !nextAvailability) {
        const [[campaign], [claim]] = await Promise.all([
          tx.select({ id: customerRewardCampaigns.id }).from(customerRewardCampaigns).where(and(eq(customerRewardCampaigns.businessId, business.id), eq(customerRewardCampaigns.productId, targetId), eq(customerRewardCampaigns.isActive, true))).limit(1),
          tx.select({ id: customerRewardClaims.id }).from(customerRewardClaims).where(and(eq(customerRewardClaims.businessId, business.id), eq(customerRewardClaims.productId, targetId), eq(customerRewardClaims.status, "active"))).limit(1),
        ]);
        if (campaign || claim) return record("rejected", 422, "این محصول جایزهٔ فعال دارد و نمی‌تواند ناموجود یا بدون قیمت شود");
      }
      await tx.update(products).set(patch as Partial<typeof products.$inferInsert>).where(and(eq(products.id, targetId), eq(products.businessId, business.id)));
    } else {
      const [current] = await tx.select({ id: categories.id, name: categories.name, description: categories.description, isActive: categories.isActive, sortOrder: categories.sortOrder })
        .from(categories).where(and(eq(categories.id, targetId), eq(categories.businessId, business.id))).for("update");
      const baseRows = (snapshot.payload.categories as Record<string, unknown>[] | undefined) ?? [];
      const base = baseRows.find((row) => row.id === targetId);
      if (!current || !base) return record("conflict", 409, "دسته‌بندی در snapshot مبنا یا سرور پیدا نشد");
      if (Object.keys(patch).some((key) => canonical(current[key as keyof typeof current]) !== canonical(base[key]))) {
        return record("conflict", 409, "دسته‌بندی از زمان دریافت snapshot تغییر کرده است؛ نسخهٔ تازه دریافت و تغییر را دوباره بررسی کنید");
      }
      await tx.update(categories).set(patch as Partial<typeof categories.$inferInsert>).where(and(eq(categories.id, targetId), eq(categories.businessId, business.id)));
    }

    return record("applied", 200, "", randomUUID());
  }, { isolationLevel: "repeatable read" });

  if (outcome.httpStatus !== 200) {
    const error = typeof outcome.response.error === "string" ? outcome.response.error : "فرمان پنل آفلاین اعمال نشد";
    throw new HttpError(outcome.httpStatus, error);
  }
  return outcome.response;
}
