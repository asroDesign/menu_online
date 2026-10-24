import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { businesses, categories, deliveryZones, diningTables, inventoryItems, loyaltyWheelSettings, products, recipes, translations } from "@/db/schema";
import { activeTrialOf, featuresOf } from "@/lib/entitlements";
import { hasAny, type MenuGalleryItem, type Settings } from "@/lib/plans";
import { activeScheduledCategoryIds, isOpenAt } from "@/lib/business-time";
import { visibleMenuPromoBanners } from "@/lib/menu-banners";
import { activeTransferCards } from "@/lib/card-transfer";
import { isMenuTemplate } from "@/lib/menu-templates";
import { normalizeCustomerRewards } from "@/lib/customer-rewards-core";

export async function getPublicMenu(slug: string) {
  const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug));
  if (!biz || biz.isSuspended) return null;
  if (biz.plan === "pending" && !await activeTrialOf(biz.id)) return null;
  return buildPublicMenu(biz);
}

export async function buildPublicMenu(biz: typeof businesses.$inferSelect) {
  const features = await featuresOf(biz);
  const can = (k: string) => hasAny(features, k);
  const st = (biz.settings ?? {}) as Settings;
  const cardTransfer = st.cardTransfer;
  const transferCards = activeTransferCards(cardTransfer);
  const cardTransferEnabled = can("card_transfer") && transferCards.length > 0;
  const [cats, prods, tbls, zones, trs] = await Promise.all([
    db.select().from(categories).where(and(eq(categories.businessId, biz.id), eq(categories.isActive, true))).orderBy(asc(categories.sortOrder), asc(categories.id)),
    db.select().from(products).where(eq(products.businessId, biz.id)).orderBy(asc(products.id)),
    can("self_order") || can("waiter_call")
      ? db.select({ id: diningTables.id, name: diningTables.name, zone: diningTables.zone, operationalStatus: diningTables.operationalStatus }).from(diningTables).where(eq(diningTables.businessId, biz.id)).orderBy(asc(diningTables.id))
      : Promise.resolve([]),
    can("delivery_order") && can("zones")
      ? db.select({ id: deliveryZones.id, name: deliveryZones.name, fee: deliveryZones.fee, radiusKm: deliveryZones.radiusKm, minOrder: deliveryZones.minOrder, etaMinutes: deliveryZones.etaMinutes }).from(deliveryZones).where(and(eq(deliveryZones.businessId, biz.id), eq(deliveryZones.isActive, true)))
      : Promise.resolve([]),
    can("translation")
      ? db.select().from(translations).where(eq(translations.businessId, biz.id))
      : Promise.resolve([]),
  ]);
  const [wheelSettings] = can("loyalty") ? await db.select({ isEnabled: loyaltyWheelSettings.isEnabled }).from(loyaltyWheelSettings)
    .where(eq(loyaltyWheelSettings.businessId, biz.id)).limit(1) : [];
  const recipeLines = can("recipes") && prods.length
    ? await db.select({ productId: recipes.productId, name: inventoryItems.name, quantity: recipes.quantity, unit: inventoryItems.recipeUnit })
      .from(recipes).innerJoin(inventoryItems, and(eq(inventoryItems.id, recipes.itemId), eq(inventoryItems.businessId, biz.id)))
      .where(and(eq(recipes.businessId, biz.id), inArray(recipes.productId, prods.map((product) => product.id))))
      .orderBy(asc(recipes.id))
    : [];
  const scheduled = activeScheduledCategoryIds(st);
  const visibleCategories = scheduled
    ? cats.filter((c) => !scheduled.assigned.has(c.id) || scheduled.active.has(c.id))
    : cats;
  const catIds = new Set(visibleCategories.map((c) => c.id));
  const arOn = can("ar");
  const ingredientsByProduct = new Map<number, { name: string; quantity: number; unit: string }[]>();
  for (const line of recipeLines) {
    const current = ingredientsByProduct.get(line.productId) ?? [];
    current.push({ name: line.name, quantity: line.quantity, unit: line.unit });
    ingredientsByProduct.set(line.productId, current);
  }
  const rewards = normalizeCustomerRewards(st.customerRewards);
  return {
    business: {
      name: biz.name, slug: biz.slug, description: biz.description, phone: biz.phone, address: biz.address,
      menuTemplate: isMenuTemplate(st.menuTemplate) ? st.menuTemplate : "classic",
      menuGallery: (Array.isArray(st.menuGallery) ? st.menuGallery : []).flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const item = raw as MenuGalleryItem;
        if (typeof item.url !== "string" || !/^\/api\/files\/[a-f0-9]{24}$/.test(item.url)) return [];
        return [{ ...item, kind: item.kind === "video" ? "video" as const : "image" as const }];
      }).slice(0, 8),
      promotionalBanners: visibleMenuPromoBanners(st.promoBanners),
      instagram: biz.instagram, lat: biz.lat, lng: biz.lng, accentColor: biz.accentColor, logoEmoji: biz.logoEmoji, logoUrl: biz.logoUrl, acceptOrders: biz.acceptOrders,
      taxPercent: biz.taxPercent, servicePercent: biz.servicePercent,
      isOpen: isOpenAt(st, new Date()),
      operatingHours: st.operatingHours ?? null,
      reservationsEnabled: can("reservations") && st.reservations?.enabled !== false,
      customerRewards: { pointValueToman: rewards.pointValueToman },
      loyaltyWheelEnabled: can("loyalty") && wheelSettings?.isEnabled === true,
      reservationSettings: can("reservations") && st.reservations?.enabled !== false
        ? { requireDeposit: !!st.reservations?.requireDeposit, depositPerGuest: st.reservations?.depositPerGuest ?? 0, durationMinutes: st.reservations?.durationMinutes ?? 90 }
        : null,
      cardTransfer: cardTransferEnabled ? {
        ...transferCards[0],
        cards: transferCards,
      } : null,
    },
    caps: {
      selfOrder: can("self_order"),
      waiterCall: can("waiter_call"),
      reservations: can("reservations") && st.reservations?.enabled !== false,
      delivery: can("delivery_order"),
      preorder: can("preorder"),
      discount: can("discount"),
      cashback: can("cashback") && can("loyalty") && (st.cashbackEnabled ?? (st.cashbackPercent ?? 0) > 0),
      cashbackMax: st.cashbackMaxRedeemPercent ?? 100,
      loyalty: can("loyalty"),
      walletPayment: can("loyalty"),
      walletMaxRedeemPercent: st.cashbackMaxRedeemPercent ?? 100,
      ipg: can("ipg") && !!st.ipg?.merchantId,
      cardTransfer: cardTransferEnabled,
      snappay: false, // installment gateways need a signed merchant contract + credentials; not connected
      digipay: false,
      kiosk: can("kiosk"),
      crossSell: can("cross_sell"),
      ar: arOn,
      miniSite: can("mini_site"),
    },
    languages: can("translation") ? (st.languages?.length ? st.languages : ["fa"]) : ["fa"],
    categories: visibleCategories,
    products: prods
      .filter((p) => p.categoryId === null || catIds.has(p.categoryId))
      .map((p) => ({ ...p, arModelUrl: arOn ? p.arModelUrl : "", ingredients: ingredientsByProduct.get(p.id) ?? [] })),
    tables: tbls,
    zones,
    translations: trs.map((t) => ({ type: t.entityType, id: t.entityId, lang: t.lang, name: t.name, description: t.description })),
  };
}

export type PublicMenu = NonNullable<Awaited<ReturnType<typeof getPublicMenu>>>;
