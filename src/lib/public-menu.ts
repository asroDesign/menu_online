import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, categories, deliveryZones, diningTables, products, translations } from "@/db/schema";
import { activeTrialOf, featuresOf } from "@/lib/entitlements";
import { hasAny, type Settings } from "@/lib/plans";
import { activeScheduledCategoryIds, isOpenAt } from "@/lib/business-time";
import { visibleMenuPromoBanners } from "@/lib/menu-banners";
import { activeTransferCards } from "@/lib/card-transfer";

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
    can("self_order")
      ? db.select({ id: diningTables.id, name: diningTables.name, zone: diningTables.zone, operationalStatus: diningTables.operationalStatus }).from(diningTables).where(eq(diningTables.businessId, biz.id)).orderBy(asc(diningTables.id))
      : Promise.resolve([]),
    can("delivery_order") && can("zones")
      ? db.select({ id: deliveryZones.id, name: deliveryZones.name, fee: deliveryZones.fee, radiusKm: deliveryZones.radiusKm, minOrder: deliveryZones.minOrder, etaMinutes: deliveryZones.etaMinutes }).from(deliveryZones).where(and(eq(deliveryZones.businessId, biz.id), eq(deliveryZones.isActive, true)))
      : Promise.resolve([]),
    can("translation")
      ? db.select().from(translations).where(eq(translations.businessId, biz.id))
      : Promise.resolve([]),
  ]);
  const scheduled = activeScheduledCategoryIds(st);
  const visibleCategories = scheduled
    ? cats.filter((c) => !scheduled.assigned.has(c.id) || scheduled.active.has(c.id))
    : cats;
  const catIds = new Set(visibleCategories.map((c) => c.id));
  const arOn = can("ar");
  return {
    business: {
      name: biz.name, slug: biz.slug, description: biz.description, phone: biz.phone, address: biz.address,
      menuTemplate: ["classic", "editorial", "compact"].includes(String(st.menuTemplate)) ? st.menuTemplate : "classic",
      promotionalBanners: visibleMenuPromoBanners(st.promoBanners),
      instagram: biz.instagram, lat: biz.lat, lng: biz.lng, accentColor: biz.accentColor, logoEmoji: biz.logoEmoji, logoUrl: biz.logoUrl, acceptOrders: biz.acceptOrders,
      taxPercent: biz.taxPercent, servicePercent: biz.servicePercent,
      isOpen: isOpenAt(st, new Date()),
      operatingHours: st.operatingHours ?? null,
      reservationsEnabled: can("reservations") && st.reservations?.enabled !== false,
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
      reservations: can("reservations") && st.reservations?.enabled !== false,
      delivery: can("delivery_order"),
      preorder: can("preorder"),
      discount: can("discount"),
      cashback: can("cashback") && can("loyalty") && (st.cashbackEnabled ?? (st.cashbackPercent ?? 0) > 0),
      cashbackMax: st.cashbackMaxRedeemPercent ?? 100,
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
      .map((p) => ({ ...p, arModelUrl: arOn ? p.arModelUrl : "" })),
    tables: tbls,
    zones,
    translations: trs.map((t) => ({ type: t.entityType, id: t.entityId, lang: t.lang, name: t.name, description: t.description })),
  };
}

export type PublicMenu = NonNullable<Awaited<ReturnType<typeof getPublicMenu>>>;
