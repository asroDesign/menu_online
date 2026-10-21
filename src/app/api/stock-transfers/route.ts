import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, stockMovements, stockTransferLines, stockTransfers } from "@/db/schema";
import { HttpError, readJson, withAuth } from "@/lib/auth";
import { isManagerRole } from "@/lib/roles";

const allowed = { feature: "stock_movements", manager: true, roles: ["warehouse", "accountant"] };

export const GET = withAuth(async (_req, auth) => {
  const transfers = await db.select().from(stockTransfers).where(eq(stockTransfers.businessId, auth.business.id)).orderBy(desc(stockTransfers.createdAt)).limit(100);
  const lines = transfers.length ? await db.select().from(stockTransferLines).where(inArray(stockTransferLines.transferId, transfers.map((row) => row.id))) : [];
  const ids = [...new Set(lines.flatMap((line) => [line.sourceItemId, line.destinationItemId]))];
  const items = ids.length ? await db.select({ id: inventoryItems.id, name: inventoryItems.name, unit: inventoryItems.unit }).from(inventoryItems).where(and(eq(inventoryItems.businessId, auth.business.id), inArray(inventoryItems.id, ids))) : [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const result = transfers.map((transfer) => ({ ...transfer, lines: lines.filter((line) => line.transferId === transfer.id).map((line) => ({ ...line, source: byId.get(line.sourceItemId), destination: byId.get(line.destinationItemId) })) }));
  return Response.json({ items: result }, { headers: { "Cache-Control": "no-store" } });
}, allowed);

export const POST = withAuth(async (req, auth) => {
  const body = await readJson(req, 32 * 1024);
  const requestKey = typeof body.requestKey === "string" ? body.requestKey : "";
  if (!/^[0-9a-f-]{36}$/i.test(requestKey)) throw new HttpError(400, "شناسه درخواست معتبر نیست.");
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100) throw new HttpError(400, "یک تا ۱۰۰ قلم انتقال وارد کنید.");
  const lines = body.lines.map((raw) => {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const sourceItemId = Number(row.sourceItemId), destinationItemId = Number(row.destinationItemId), quantity = Number(row.quantity);
    if (!Number.isSafeInteger(sourceItemId) || !Number.isSafeInteger(destinationItemId) || sourceItemId < 1 || destinationItemId < 1 || sourceItemId === destinationItemId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000)
      throw new HttpError(400, "یکی از اقلام یا مقدار انتقال معتبر نیست.");
    return { sourceItemId, destinationItemId, quantity };
  });
  if (new Set(lines.map((line) => `${line.sourceItemId}:${line.destinationItemId}`)).size !== lines.length) throw new HttpError(400, "برای هر مسیر انتقال فقط یک ردیف ثبت کنید.");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const itemIds = [...new Set(lines.flatMap((line) => [line.sourceItemId, line.destinationItemId]))];
  const catalog = await db.select({ id: inventoryItems.id, businessId: inventoryItems.businessId, warehouseId: inventoryItems.warehouseId, name: inventoryItems.name, unit: inventoryItems.unit, costPerUnit: inventoryItems.costPerUnit })
    .from(inventoryItems).where(and(eq(inventoryItems.businessId, auth.business.id), inArray(inventoryItems.id, itemIds)));
  const byId = new Map(catalog.map((item) => [item.id, item]));
  if (catalog.length !== itemIds.length) throw new HttpError(400, "همه اقلام باید متعلق به همین کسب‌وکار باشند.");
  for (const line of lines) {
    const source = byId.get(line.sourceItemId)!, destination = byId.get(line.destinationItemId)!;
    if (source.unit !== destination.unit) throw new HttpError(400, `واحد «${source.name}» با انبار مقصد یکسان نیست.`);
    if (!source.warehouseId || !destination.warehouseId || source.warehouseId === destination.warehouseId || source.name.trim().toLocaleLowerCase() !== destination.name.trim().toLocaleLowerCase())
      throw new HttpError(400, "مبدأ و مقصد باید دو قلم هم‌نام در دو انبار متفاوت باشند.");
  }

  const result = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [existing] = await tx.select().from(stockTransfers).where(and(eq(stockTransfers.businessId, auth.business.id), eq(stockTransfers.requestKey, requestKey))).for("update");
    if (existing) return { transfer: existing, replay: true };
    const [transfer] = await tx.insert(stockTransfers).values({ businessId: auth.business.id, requestKey, note, createdBy: auth.user.id }).returning();
    for (const line of lines) await tx.insert(stockTransferLines).values({ transferId: transfer.id, ...line, unitCost: byId.get(line.sourceItemId)!.costPerUnit });
    return { transfer, replay: false };
  });
  return Response.json({ id: result.transfer.id, status: result.transfer.status, replay: result.replay }, { status: result.replay ? 200 : 201 });
}, { feature: "stock_movements", manager: true, roles: ["warehouse"] });

export const PATCH = withAuth(async (req, auth) => {
  if (!isManagerRole(auth.role)) throw new HttpError(403, "تأیید یا رد انتقال فقط برای مدیر مجاز است.");
  const body = await readJson(req, 4 * 1024);
  const id = Number(body.id), action = body.action;
  if (!Number.isSafeInteger(id) || id < 1 || !["approve", "reject"].includes(String(action))) throw new HttpError(400, "درخواست تصمیم‌گیری معتبر نیست.");
  const transfer = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    const [current] = await tx.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.businessId, auth.business.id))).for("update");
    if (!current) throw new HttpError(404, "درخواست انتقال پیدا نشد.");
    if (current.status !== "pending") throw new HttpError(409, "این درخواست قبلاً بررسی شده است.");
    const lines = await tx.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, current.id));
    if (action === "reject") {
      const [saved] = await tx.update(stockTransfers).set({ status: "rejected", decidedBy: auth.user.id, decidedAt: new Date() }).where(and(eq(stockTransfers.id, current.id), eq(stockTransfers.status, "pending"))).returning();
      return saved;
    }
    const ids = [...new Set(lines.flatMap((line) => [line.sourceItemId, line.destinationItemId]))].sort((a, b) => a - b);
    const locked = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.businessId, auth.business.id), inArray(inventoryItems.id, ids))).orderBy(inventoryItems.id).for("update");
    const balances = new Map(locked.map((item) => [item.id, item.stock]));
    const movementBalances = new Map(balances);
    if (locked.length !== ids.length) throw new HttpError(409, "یکی از اقلام انتقال حذف شده یا تغییر کرده است.");
    for (const line of lines) {
      const source = locked.find((item) => item.id === line.sourceItemId)!;
      const destination = locked.find((item) => item.id === line.destinationItemId)!;
      if (source.businessId !== destination.businessId || source.unit !== destination.unit) throw new HttpError(409, "اقلام انتقال دیگر سازگار نیستند.");
      if (!source.warehouseId || !destination.warehouseId || source.warehouseId === destination.warehouseId || source.name.trim().toLocaleLowerCase() !== destination.name.trim().toLocaleLowerCase()) throw new HttpError(409, "مبدأ و مقصد دیگر اقلام هم‌نام در دو انبار متفاوت نیستند.");
      const sourceBalance = balances.get(source.id)!;
      if (sourceBalance < line.quantity) throw new HttpError(409, `موجودی ${source.name} برای انتقال کافی نیست.`);
      balances.set(source.id, sourceBalance - line.quantity);
      balances.set(destination.id, balances.get(destination.id)! + line.quantity);
      movementBalances.set(source.id, movementBalances.get(source.id)! - line.quantity);
      movementBalances.set(destination.id, movementBalances.get(destination.id)! + line.quantity);
      (line as typeof line & { sourceBalanceAfter?: number; destinationBalanceAfter?: number }).sourceBalanceAfter = movementBalances.get(source.id)!;
      (line as typeof line & { sourceBalanceAfter?: number; destinationBalanceAfter?: number }).destinationBalanceAfter = movementBalances.get(destination.id)!;
    }
    for (const item of locked) await tx.update(inventoryItems).set({ stock: balances.get(item.id)! }).where(eq(inventoryItems.id, item.id));
    for (const line of lines) {
      const source = locked.find((item) => item.id === line.sourceItemId)!;
      const destination = locked.find((item) => item.id === line.destinationItemId)!;
      const sourceBalanceAfter = (line as typeof line & { sourceBalanceAfter?: number }).sourceBalanceAfter!;
      const destinationBalanceAfter = (line as typeof line & { destinationBalanceAfter?: number }).destinationBalanceAfter!;
      await tx.insert(stockMovements).values([
        { businessId: auth.business.id, itemId: source.id, type: "out", delta: -line.quantity, balanceAfter: sourceBalanceAfter, note: `انتقال انبار #${current.id} · خروج`, unitCost: line.unitCost },
        { businessId: auth.business.id, itemId: destination.id, type: "in", delta: line.quantity, balanceAfter: destinationBalanceAfter, note: `انتقال انبار #${current.id} · ورود`, unitCost: line.unitCost },
      ]);
    }
    const [saved] = await tx.update(stockTransfers).set({ status: "approved", decidedBy: auth.user.id, decidedAt: new Date() }).where(and(eq(stockTransfers.id, current.id), eq(stockTransfers.status, "pending"))).returning();
    return saved;
  });
  return Response.json({ item: transfer });
}, { feature: "stock_movements", manager: true });
