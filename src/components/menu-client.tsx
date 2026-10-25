"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/lib/api";
import { formatPrice, toFa } from "@/lib/format";
import { LANGS } from "@/lib/plans";
import type { PublicMenu } from "@/lib/public-menu";
import { ModelViewer } from "@/components/model-viewer";
import { MapPicker } from "@/components/map-picker";
import { BrandLogo } from "@/components/brand";
import { haversineKm } from "@/lib/geo";
import { Button, cn, Icon, Input, Modal, PersianDateInput, ProductThumb, Select, Textarea, ToastProvider, useToast, iconGlyph, EmojiIcon, IconText} from "@/components/ui";
import { ProductOptionPicker } from "@/components/product-option-picker";
import { PublicMenuNavigation, type ActiveWheelReward, type PublicCustomerProfile } from "@/components/public-menu-navigation";
import { PublicProductDetails } from "@/components/public-product-details";
import { rewardDiscountAmount } from "@/lib/loyalty-rewards-core";
import { cartLines, cartProductQuantity, changeAnyCartVariant, changeCartVariant, hasPositiveCartLinePrice, type CartState } from "@/lib/order-cart";
import { ALLERGEN_TAGS, DIETARY_TAGS } from "@/lib/product-options";
import { trackMenuEvent } from "@/lib/menu-analytics";
import { rememberTrackedMenuOrder } from "@/lib/public-menu-orders";
import captainmStyles from "@/components/captainm-theme.module.css";
import { PublicMenuGallery, PublicMenuShowcase } from "@/components/public-menu-showcase";

type Prod = PublicMenu["products"][number];
type OType = "dine_in" | "takeaway" | "delivery";

const DICT: Record<string, Record<string, string>> = {
  fa: { search: "جستجو در منو…", featured: " پیشنهاد ویژه", cart: "مشاهده و ثبت سفارش", sold: "ناموجود", submit: "ثبت سفارش", total: "مبلغ نهایی", sub: "جمع اقلام", suggest: "همراه با سفارش شما پیشنهاد می‌کنیم", drinkPairing: "نوشیدنی مناسب این غذا", foodPairing: "غذای همراه این نوشیدنی", ar: "نمایش سه‌بعدی (AR)", menu: "منوی دیجیتال", empty: "موردی پیدا نشد", zeroPrice: "قیمت این محصول صفر است و امکان افزودن آن به سبد وجود ندارد." },
  en: { search: "Search the menu…", featured: " Featured", cart: "View order", sold: "Sold out", submit: "Place order", total: "Total", sub: "Subtotal", suggest: "Goes well with your order", drinkPairing: "Drink pairing", foodPairing: "Food pairing", ar: "View in 3D / AR", menu: "Digital menu", empty: "Nothing found", zeroPrice: "This product has a zero price and cannot be added to the cart." },
  ar: { search: "ابحث في القائمة…", featured: " مميز", cart: "عرض الطلب", sold: "نفدت الكمية", submit: "إرسال الطلب", total: "المجموع", sub: "المجموع الفرعي", suggest: "يناسب طلبك", drinkPairing: "مشروب يناسب هذا الطعام", foodPairing: "طعام يناسب هذا المشروب", ar: "عرض ثلاثي الأبعاد", menu: "القائمة الرقمية", empty: "لا نتائج", zeroPrice: "سعر هذا المنتج صفر ولا يمكن إضافته إلى السلة." },
  tr: { search: "Menüde ara…", featured: " Öne çıkanlar", cart: "Siparişi gör", sold: "Tükendi", submit: "Siparişi ver", total: "Toplam", sub: "Ara toplam", suggest: "Siparişinize yakışır", drinkPairing: "Bu yemeğe uygun içecek", foodPairing: "Bu içeceğe uygun yemek", ar: "3D / AR görüntüle", menu: "Dijital menü", empty: "Sonuç yok", zeroPrice: "Bu ürünün fiyatı sıfır olduğu için sepete eklenemez." },
};

export function MenuClient(props: { data: PublicMenu; initialTableId: number | null; initialRewardToken?: string; readOnlyDemo?: boolean; readOnlyPreview?: boolean }) {
  return (
    <ToastProvider>
      <Menu {...props} />
    </ToastProvider>
  );
}

function Menu({ data, initialTableId, initialRewardToken = "", readOnlyDemo = false, readOnlyPreview = false }: { data: PublicMenu; initialTableId: number | null; initialRewardToken?: string; readOnlyDemo?: boolean; readOnlyPreview?: boolean }) {
  const { business: biz, categories, products, tables, zones, caps, languages } = data;
  const serviceableTables = tables.filter((table) => ["available", "occupied", "reserved"].includes(table.operationalStatus));
  const editorial = biz.menuTemplate === "editorial";
  const compact = biz.menuTemplate === "compact";
  const bistro = biz.menuTemplate === "bistro";
  const minimal = biz.menuTemplate === "minimal";
  const softmenuTest3 = biz.menuTemplate === "softmenu-test3";
  const softmenuTest = biz.menuTemplate === "softmenu-test";
  const captainm = biz.menuTemplate === "captainm";
  const haftkhan = biz.menuTemplate === "haftkhan";
  const orderino = biz.menuTemplate === "orderino";
  const photoCards = editorial || bistro || softmenuTest || captainm || haftkhan;
  const horizontalPhotoCards = softmenuTest3;
  const wideMenu = editorial || bistro || softmenuTest3 || softmenuTest || captainm || haftkhan;
  const menuBackground = haftkhan ? "#fcf5f5" : captainm ? "#090d20" : softmenuTest3 ? "#f4f2ed" : softmenuTest ? "#f8f7fb" : "#f6f5f3";
  const headerBackground = softmenuTest3 ? "linear-gradient(135deg,#183b35,#28574f)" : softmenuTest ? "linear-gradient(135deg,#211a38,#70468f)" : captainm ? "radial-gradient(1px 1px at 18px 24px,#ffffff 99%,transparent),radial-gradient(1px 1px at 76px 64px,rgba(186,230,253,.9) 99%,transparent),radial-gradient(1.5px 1.5px at 142px 37px,rgba(255,255,255,.85) 99%,transparent),radial-gradient(circle at 82% 30%,rgba(34,211,238,.3),transparent 20%),radial-gradient(circle at 18% 18%,rgba(129,140,248,.32),transparent 28%),linear-gradient(145deg,#090d20 8%,#17133d 55%,#071526)" : haftkhan ? "linear-gradient(135deg,#641c27,#91333b)" : `linear-gradient(135deg, ${biz.accentColor}, ${biz.accentColor}cc 60%, #1c1917)`;
  const toast = useToast();
  const [lang, setLang] = useState("fa");
  const t = (k: string) => (DICT[lang] ?? DICT.en)[k] ?? DICT.en[k];
  const dir = LANGS[lang]?.dir ?? "rtl";
  const trMap = useMemo(() => new Map(data.translations.map((x) => [`${x.type}:${x.id}:${x.lang}`, x])), [data.translations]);
  const nameOf = (type: "product" | "category", id: number, fb: string) => (lang === "fa" ? fb : trMap.get(`${type}:${id}:${lang}`)?.name || fb);
  const descOf = (p: Prod) => (lang === "fa" ? p.description : trMap.get(`product:${p.id}:${lang}`)?.description || p.description);

  const [cart, setCart] = useState<CartState>({});
  const [optionProduct, setOptionProduct] = useState<Prod | null>(null);
  const [q, setQ] = useState("");
  const [dietFilter, setDietFilter] = useState("");
  const [active, setActive] = useState<number | null>(categories[0]?.id ?? null);
  const [sheet, setSheet] = useState(false);
  const [serviceRequestOpen, setServiceRequestOpen] = useState(false);
  const [serviceRequestTableId, setServiceRequestTableId] = useState(initialTableId ? String(initialTableId) : "");
  const [serviceRequestMessage, setServiceRequestMessage] = useState("");
  const [serviceRequestBusy, setServiceRequestBusy] = useState(false);
  const [type, setType] = useState<OType>(initialTableId || caps.selfOrder ? "dine_in" : "delivery");
  const [tableId, setTableId] = useState<string>(initialTableId ? String(initialTableId) : "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pre, setPre] = useState(false);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ code: string; amount: number } | null>(null);
  const [payment, setPayment] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ number: number; total: number; paymentMethod: string; trackingUrl: string | null; cardTransfer?: NonNullable<PublicMenu["business"]["cardTransfer"]> } | null>(null);
  const [recommendations, setRecommendations] = useState<{ key: string; items: { id: number; name: string; emoji: string; price: number; recommendationReason?: string }[] } | null>(null);
  const [ar, setAr] = useState<Prod | null>(null);
  const [detailProduct, setDetailProduct] = useState<Prod | null>(null);
  const [customerProfile, setCustomerProfile] = useState<PublicCustomerProfile | null>(null);
  const [activeWheelReward, setActiveWheelReward] = useState<ActiveWheelReward | null>(null);
  const [selectedWheelSpinId, setSelectedWheelSpinId] = useState<number | null>(null);
  const [profileRequest, setProfileRequest] = useState(initialRewardToken ? 1 : 0);
  const [rewardToken, setRewardToken] = useState(initialRewardToken);
  const [rewardClaimBusy, setRewardClaimBusy] = useState(false);
  const [rewardClaimError, setRewardClaimError] = useState("");
  const [rewardCelebration, setRewardCelebration] = useState<NonNullable<PublicCustomerProfile["activeReward"]> | null>(null);
  const [selectedRewardClaimId, setSelectedRewardClaimId] = useState<number | null>(null);
  const [useWalletCredit, setUseWalletCredit] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const lockRef = useRef(false);
  const rewardAttemptRef = useRef("");

  const canOrder = !readOnlyDemo && !readOnlyPreview && biz.acceptOrders && (caps.selfOrder || caps.delivery);
  // Keep a real reservation path available on the public sample menu while
  // leaving checkout and order creation in preview-only mode.
  const canReserve = caps.reservations && (!readOnlyPreview || readOnlyDemo);
  const initialTable = initialTableId ? tables.find((table) => table.id === initialTableId) : undefined;
  useEffect(() => { if (!readOnlyDemo) trackMenuEvent(biz.slug, "menu_view"); }, [biz.slug, readOnlyDemo]);
  const term = q.trim();
  const types: { k: OType; l: string }[] = [
    ...(caps.selfOrder ? [{ k: "dine_in" as const, l: " سالن" }, { k: "takeaway" as const, l: " بیرون‌بر" }] : []),
    ...(caps.delivery ? [{ k: "delivery" as const, l: " ارسال" }] : []),
  ];

  const grouped = useMemo(() => {
    const list = products.filter((p) => (!dietFilter || p.dietaryTags?.includes(dietFilter)) && (!term || p.name.includes(term) || p.description.includes(term) || nameOf("product", p.id, p.name).toLowerCase().includes(term.toLowerCase())));
    const sections = categories.map((c) => ({ key: String(c.id), id: c.id, title: nameOf("category", c.id, c.name), items: list.filter((p) => p.categoryId === c.id) })).filter((s) => s.items.length);
    const rest = list.filter((p) => p.categoryId === null);
    if (rest.length) sections.push({ key: "other", id: -1, title: "…", items: rest });
    return sections;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, categories, term, lang, dietFilter]);

  const featured = products.filter((p) => p.isFeatured && p.isAvailable);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        if (lockRef.current) return;
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(Number((vis.target as HTMLElement).dataset.cat));
      },
      { rootMargin: "-120px 0px -65% 0px" },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [grouped]);

  function jump(id: number) {
    setActive(id);
    if (id > 0) trackMenuEvent(biz.slug, "category_view", { categoryId: id });
    lockRef.current = true;
    sectionRefs.current[String(id)]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => (lockRef.current = false), 800);
  }

  const add = (p: Prod, d = 1) => {
    if (d > 0) {
      if (!Number.isSafeInteger(p.price) || p.price <= 0) { toast(t("zeroPrice"), "error"); return; }
      trackMenuEvent(biz.slug, "product_view", { productId: p.id });
      if (p.sellingMode === "weight" || p.modifierGroups?.some((group) => group.active)) { setOptionProduct(p); return; }
      trackMenuEvent(biz.slug, "add_to_cart", { productId: p.id });
    }
    setCart((current) => changeAnyCartVariant(current, p.id, d));
  };
  const addVariant = (p: Prod, optionIds: string[], delta: number, weightGrams?: number, tareGrams?: number) => {
    if (delta > 0 && !hasPositiveCartLinePrice(p, optionIds, weightGrams, tareGrams)) { toast(t("zeroPrice"), "error"); return false; }
    setCart((current) => changeCartVariant(current, p.id, optionIds, delta, 50, weightGrams, tareGrams));
    return true;
  };
  const lines = cartLines(products, cart).map((line) => ({ ...line, p: line.product }));
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const disc = applied ? Math.min(applied.amount, subtotal) : 0;
  const activeReward = customerProfile?.activeReward ?? null;
  const selectedReward = activeReward?.id === selectedRewardClaimId ? activeReward : null;
  const selectedWheelReward = activeWheelReward?.id === selectedWheelSpinId ? activeWheelReward : null;
  const freeRewardProduct = selectedReward?.rewardType === "free_item" ? products.find((product) => product.id === selectedReward.productId) : undefined;
  const freeRewardPrice = selectedReward?.rewardType === "free_item" ? freeRewardProduct?.price ?? 0 : 0;
  const wheelFreeProducts = selectedWheelReward?.prizeType === "free_items" ? selectedWheelReward.snapshot.products ?? [] : [];
  const wheelFreeTotal = wheelFreeProducts.reduce((sum, product) => sum + product.price, 0);
  const orderSubtotal = subtotal + freeRewardPrice + wheelFreeTotal;
  const rewardDiscount = selectedReward?.rewardType === "discount_percent"
    ? rewardDiscountAmount(subtotal, selectedReward.discountPercent)
    : freeRewardPrice;
  const wheelDiscount = selectedWheelReward?.prizeType === "fixed_amount"
    ? Math.min(orderSubtotal, selectedWheelReward.snapshot.amount ?? 0)
    : selectedWheelReward?.prizeType === "discount_code"
      ? subtotal >= (selectedWheelReward.snapshot.minOrder ?? 0)
        ? Math.min(orderSubtotal, selectedWheelReward.snapshot.discountType === "percent"
          ? Math.round(orderSubtotal * (selectedWheelReward.snapshot.discountValue ?? 0) / 100)
          : selectedWheelReward.snapshot.discountValue ?? 0)
        : 0
      : wheelFreeTotal;
  const appliedCheckoutDiscount = selectedReward ? rewardDiscount : selectedWheelReward ? wheelDiscount : disc;
  const radiusMode = zones.some((z) => z.radiusKm > 0);
  const dist = biz.lat != null && biz.lng != null && pin ? haversineKm({ lat: biz.lat, lng: biz.lng }, pin) : null;
  const autoZone = radiusMode && dist !== null ? zones.filter((z) => z.radiusKm > 0 && z.radiusKm >= dist).sort((a, b) => a.radiusKm - b.radiusKm)[0] : undefined;
  const zone = radiusMode ? autoZone : zones.find((z) => String(z.id) === zoneId);
  const outOfRange = type === "delivery" && radiusMode && dist !== null && !autoZone;
  const fee = type === "delivery" ? (zone?.fee ?? 0) : 0;
  const tax = Math.round(((orderSubtotal - appliedCheckoutDiscount) * biz.taxPercent) / 100);
  const svc = type === "delivery" ? 0 : Math.round(((orderSubtotal - appliedCheckoutDiscount) * biz.servicePercent) / 100);
  const total = orderSubtotal - appliedCheckoutDiscount + tax + svc + fee;
  const walletCreditCap = Math.floor(Math.max(0, total) * Math.min(100, Math.max(0, caps.walletMaxRedeemPercent ?? 100)) / 100);
  const walletCreditApplied = useWalletCredit && customerProfile ? Math.min(customerProfile.walletBalance, walletCreditCap) : 0;
  const checkoutTotal = Math.max(0, total - walletCreditApplied);

  // cross-sell recommendations
  const idsKey = [...new Set(Object.values(cart).map((line) => line.productId))].sort((a, b) => a - b).join(",");
  const recs = caps.crossSell && idsKey && recommendations?.key === idsKey ? recommendations.items : [];
  useEffect(() => {
    if (!caps.crossSell || !idsKey) return;
    let live = true;
    const h = setTimeout(() => {
      api<{ items: { id: number; name: string; emoji: string; price: number; recommendationReason?: string }[] }>(`/api/public/${biz.slug}/recommendations?ids=${idsKey}`).then((r) => live && setRecommendations({ key: idsKey, items: r.items })).catch(() => {});
    }, 300);
    return () => { live = false; clearTimeout(h); };
  }, [idsKey, caps.crossSell, biz.slug]);

  const handleCustomerProfileChange = useCallback((profile: PublicCustomerProfile | null) => {
    setCustomerProfile(profile);
    setSelectedRewardClaimId(profile?.activeReward?.id ?? null);
    if (profile?.activeReward) { setActiveWheelReward(null); setSelectedWheelSpinId(null); }
    if (profile?.activeReward) { setApplied(null); setCode(""); }
  }, []);

  const handleWheelRewardChange = useCallback((reward: ActiveWheelReward | null) => {
    setActiveWheelReward(reward);
    setSelectedWheelSpinId(reward?.id ?? null);
    if (reward) {
      setSelectedRewardClaimId(null);
      setApplied(null);
      setCode("");
    }
  }, []);

  async function activateScannedReward(token: string) {
    setRewardClaimBusy(true);
    setRewardClaimError("");
    try {
      const result = await api<{ profile: PublicCustomerProfile; reward: NonNullable<PublicCustomerProfile["activeReward"]> }>(`/api/public/${encodeURIComponent(biz.slug)}/customer/rewards/claim`, { method: "POST", body: { token } });
      handleCustomerProfileChange(result.profile);
      setRewardCelebration(result.reward);
      setRewardToken("");
      setProfileRequest(0);
      rewardAttemptRef.current = "";
      const url = new URL(window.location.href);
      url.searchParams.delete("reward");
      window.history.replaceState(window.history.state, "", url);
    } catch (cause) {
      setRewardClaimError((cause as Error).message);
      rewardAttemptRef.current = "";
    } finally { setRewardClaimBusy(false); }
  }

  useEffect(() => {
    if (!rewardToken || !customerProfile || readOnlyDemo || readOnlyPreview || rewardAttemptRef.current === rewardToken) return;
    rewardAttemptRef.current = rewardToken;
    void activateScannedReward(rewardToken);
    // A scanned code is submitted once after OTP profile login; explicit retry is shown on failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewardToken, customerProfile?.id, readOnlyDemo, readOnlyPreview]);

  async function applyCode() {
    if (selectedRewardClaimId) return toast("برای واردکردن کد تخفیف، ابتدا جایزهٔ وفاداری را از این سفارش بردارید", "error");
    if (selectedWheelSpinId) return toast("برای واردکردن کد تخفیف، ابتدا جایزهٔ گردونه را از این سفارش بردارید", "error");
    try {
      const r = await api<{ code: string; amount: number }>(`/api/public/${biz.slug}/discount?code=${encodeURIComponent(code)}&subtotal=${subtotal}`);
      setApplied(r);
      toast(`کد تخفیف اعمال شد`);
    } catch (e) { setApplied(null); toast((e as Error).message, "error"); }
  }

  function openServiceRequest() {
    const initialIsServiceable = serviceableTables.some((table) => table.id === initialTableId);
    setServiceRequestTableId((current) => current && serviceableTables.some((table) => String(table.id) === current)
      ? current
      : initialIsServiceable ? String(initialTableId) : serviceableTables.length === 1 ? String(serviceableTables[0].id) : "");
    setServiceRequestOpen(true);
  }

  async function sendServiceRequest(withMessage: boolean) {
    const message = withMessage ? serviceRequestMessage.trim() : "";
    if (!serviceRequestTableId) return toast("میز خود را انتخاب کنید", "error");
    if (withMessage && !message) return toast("متن پیام را بنویسید یا گزینهٔ صدا کردن گارسون را بزنید", "error");
    setServiceRequestBusy(true);
    try {
      await api(`/api/public/${encodeURIComponent(biz.slug)}/service-requests`, {
        method: "POST",
        body: { tableId: Number(serviceRequestTableId), message },
      });
      toast(withMessage ? "پیام شما برای کارکنان ارسال شد" : "گارسون برای میز شما خبر شد");
      setServiceRequestMessage("");
      setServiceRequestOpen(false);
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setServiceRequestBusy(false);
    }
  }

  async function submit() {
    if (!lines.length) return;
    if (type === "delivery" && (!address.trim() || !(customerProfile?.phone || phone.trim()))) return toast("آدرس و شماره تماس را وارد کنید", "error");
    if (type === "delivery" && radiusMode && !pin) return toast("محل تحویل را روی نقشه مشخص کنید", "error");
    if (outOfRange) return toast("آدرس انتخاب‌شده خارج از محدوده ارسال است", "error");
    if (pre && !when) return toast("زمان پیش‌سفارش را مشخص کنید", "error");
    setBusy(true);
    try {
      const { item } = await api<{ item: { number: number; total: number; payUrl: string | null; paymentMethod: string; trackingUrl: string | null; cardTransfer?: NonNullable<PublicMenu["business"]["cardTransfer"]> } }>(`/api/public/${biz.slug}/orders`, {
        method: "POST",
        body: {
          items: lines.map((l) => ({ productId: l.p.id, quantity: l.qty, optionIds: l.optionIds, weightGrams: l.weightGrams, tareGrams: l.tareGrams })),
          type, tableId: type === "dine_in" && tableId ? Number(tableId) : null,
          customerName: customerProfile?.name ?? name, customerPhone: customerProfile?.phone ?? phone, address, zoneId: zone?.id ?? null, lat: pin?.lat ?? null, lng: pin?.lng ?? null,
          scheduledFor: pre && when ? new Date(when).toISOString() : null,
          discountCode: applied?.code ?? "", payment, note, useCashback: useWalletCredit,
          rewardClaimId: selectedReward?.id ?? null,
          wheelSpinId: selectedWheelReward?.id ?? null,
        },
      });
      if (customerProfile?.activeReward) handleCustomerProfileChange({ ...customerProfile, activeReward: null });
      setActiveWheelReward(null);
      setSelectedWheelSpinId(null);
      rememberTrackedMenuOrder(biz.slug, item.number, item.trackingUrl);
      setCart({});
      setSheet(false);
      if (item.payUrl) {
        if (item.trackingUrl) window.sessionStorage.setItem("menupeak.order-tracking", item.trackingUrl);
        window.location.assign(item.payUrl);
        return;
      }
      setDone({ number: item.number, total: item.total, paymentMethod: item.paymentMethod, trackingUrl: item.trackingUrl, cardTransfer: item.cardTransfer });
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }

  function openCheckout() {
    trackMenuEvent(biz.slug, "checkout_start");
    setSheet(true);
  }

  const accent = { "--accent": captainm ? "#0e7490" : biz.accentColor } as React.CSSProperties;

  const renderCard = (p: Prod) => {
    const qty = cartProductQuantity(cart, p.id);
    const off = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    return (
      <div className={cn("flex gap-3", editorial ? "flex-col overflow-hidden rounded-2xl bg-white p-0 shadow-sm ring-1 ring-stone-200/70" : bistro ? "flex-col gap-0 overflow-hidden rounded-[1.5rem] bg-white p-0 shadow-md ring-1 ring-stone-200/70" : photoCards ? "flex-col overflow-hidden rounded-2xl bg-white p-0 shadow-sm ring-1 ring-stone-200/70" : minimal ? "gap-3 rounded-none border-b border-stone-200/80 bg-transparent p-2" : compact ? "rounded-2xl bg-white p-2 shadow-sm ring-1 ring-stone-200/70" : "rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200/70", captainm && captainmStyles.productCard, horizontalPhotoCards && "min-h-36 flex-row overflow-hidden rounded-2xl bg-[#fffefa] p-0 ring-1 ring-stone-200/80", !p.isAvailable && "opacity-60")}>
        <div className={cn("relative shrink-0", captainm && captainmStyles.productImage, photoCards && !horizontalPhotoCards && "w-full", horizontalPhotoCards && "w-28 sm:w-36")}>
          <ProductThumb imageUrl={p.imageUrl} emoji={iconGlyph(p.emoji)} className={cn(editorial ? "h-44 w-full rounded-none" : bistro ? "h-36 w-full rounded-none" : horizontalPhotoCards ? "h-full min-h-36 w-full rounded-none" : photoCards ? (haftkhan ? "h-36 w-full rounded-none sm:h-44" : "h-36 w-full rounded-none") : compact ? "size-16 rounded-lg" : minimal ? "size-16 rounded-xl" : "size-24 rounded-xl sm:size-28")} />
          {off > 0 && <span className="absolute start-1 top-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{toFa(off)}٪</span>}
          <IconText>{caps.ar && p.arModelUrl && <button onClick={() => setAr(p)} className="absolute inset-x-1 bottom-1 rounded-lg bg-stone-900/80 py-0.5 text-[10px] font-bold text-white backdrop-blur" aria-label={t("ar")}>{<EmojiIcon emoji="" />} AR</button>}</IconText>
        </div>
        <div className={cn("flex min-w-0 flex-1 flex-col", captainm && captainmStyles.productBody, editorial && "p-4", (bistro || photoCards) && "p-3.5", horizontalPhotoCards && "py-3 pe-3 ps-0", (compact || minimal) && "py-1")}>
          <h3 className={cn("font-bold leading-6", captainm && captainmStyles.productTitle)}>{nameOf("product", p.id, p.name)}</h3>
          <p className={cn("line-clamp-2 flex-1 text-xs leading-5 text-stone-500", captainm && captainmStyles.productDescription)}>{descOf(p)}</p>
          {(p.dietaryTags?.length || p.allergenTags?.length) && <div className="mt-1 flex flex-wrap gap-1">{(p.dietaryTags ?? []).map((id) => DIETARY_TAGS.find((tag) => tag.id === id)?.label).filter(Boolean).map((label) => <span key={label} className={cn("rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-800", captainm && captainmStyles.productTag)}>{label} اعلام‌شده</span>)}{(p.allergenTags ?? []).map((id) => ALLERGEN_TAGS.find((tag) => tag.id === id)?.label).filter(Boolean).map((label) => <span key={label} className={cn("rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-900", captainm && captainmStyles.productTag)}>{label}</span>)}</div>}
          {!p.allergenTags?.length ? <span className="mt-1 text-[10px] text-stone-400">اطلاعات آلرژن ثبت نشده</span> : <span className="mt-1 text-[10px] leading-4 text-stone-400">بر اساس اطلاعات کسب‌وکار؛ برای حساسیت غذایی با رستوران هماهنگ کنید.</span>}
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              {p.oldPrice && p.oldPrice > p.price && <p className="text-[11px] text-stone-400 line-through">{formatPrice(p.oldPrice)}</p>}
              <p className={cn("text-sm font-extrabold", captainm && captainmStyles.productPrice)}>{formatPrice(p.price)}{p.sellingMode === "weight" ? <span className={cn("ms-1 text-[10px] font-medium text-stone-500", captainm && "text-cyan-100/60")}>/کیلو</span> : p.modifierGroups?.some((group) => group.active) && <span className={cn("ms-1 text-[10px] font-medium text-stone-500", captainm && "text-cyan-100/60")}>از</span>}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setDetailProduct(p)} aria-label={`جزئیات ${nameOf("product", p.id, p.name)}`} className={cn("inline-flex min-h-8 items-center gap-1 rounded-lg border border-stone-200 bg-white/80 px-2 text-[10px] font-bold text-stone-600 transition hover:bg-stone-50", captainm && "border-cyan-100/15 bg-white/5 text-cyan-100 hover:bg-white/10")}><Icon name="file" className="size-3.5" /> جزئیات</button>
            {!p.isAvailable ? (
              <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-500">{t("sold")}</span>
            ) : canOrder ? (
              qty === 0 ? (
                <button onClick={() => add(p)} aria-label="افزودن به سفارش" className="flex size-9 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-md transition active:scale-90"><Icon name="plus" /></button>
              ) : (
                <div className="flex items-center gap-1 rounded-xl bg-[var(--accent)] p-0.5 text-white shadow-md animate-pop">
                  <button onClick={() => add(p, -1)} aria-label="کم کردن" className="flex size-8 items-center justify-center rounded-lg active:bg-white/20"><Icon name="minus" className="size-4" /></button>
                  <span className="w-5 text-center text-sm font-bold">{toFa(qty)}</span>
                  <button onClick={() => add(p)} aria-label="افزودن" className="flex size-8 items-center justify-center rounded-lg active:bg-white/20"><Icon name="plus" className="size-4" /></button>
                </div>
              )
            ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const payOptions = [
    { k: "cash", l: type === "delivery" ? " پرداخت درب منزل" : " پرداخت در محل" },
    ...(caps.ipg ? [{ k: "ipg", l: " پرداخت آنلاین (درگاه بانکی)" }] : []),
    ...(caps.cardTransfer ? [{ k: "card_to_card", l: " پرداخت کارت‌به‌کارت" }] : []),
    ...(caps.snappay ? [{ k: "snappay", l: " اسنپ‌پی (اقساطی)" }] : []),
    ...(caps.digipay ? [{ k: "digipay", l: " دیجی‌پی (اقساطی)" }] : []),
  ];

  return (
    <div dir={dir} style={{ ...accent, backgroundColor: menuBackground }} className={cn("mx-auto min-h-dvh pb-28 shadow-xl", wideMenu ? "max-w-7xl" : "max-w-2xl", captainm && captainmStyles.menuShell)}>
      {softmenuTest3 && <div className="px-4 py-2 text-center text-[11px] font-bold text-white" style={{ backgroundColor: biz.accentColor }}>{biz.isOpen ? "منوی دیجیتال · آمادهٔ پذیرایی" : "اکنون بسته است · می‌توانید منو را مرور کنید"}</div>}
      {orderino
        ? <PublicMenuShowcase business={biz} items={biz.menuGallery ?? []} reservations={caps.reservations} canReserve={canReserve} canOrder={canOrder} canDelivery={caps.delivery} readOnly={readOnlyDemo || readOnlyPreview} tableName={initialTable?.name} onOpenMenu={() => document.getElementById("menu-items")?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        : <PublicMenuGallery items={biz.menuGallery ?? []} name={biz.name} accent={biz.accentColor} />}
      <header className={cn("relative overflow-hidden px-5 pb-8 pt-10", !orderino && "text-white", editorial && "rounded-b-[2.5rem] px-8 pb-10 text-center", bistro && "rounded-b-[2rem] px-6 pb-8 pt-8", minimal && "pb-6 pt-8", (softmenuTest || captainm || haftkhan) && "px-5 pb-8 pt-8 text-center", orderino && "mx-auto mt-3 flex max-w-3xl items-center justify-between rounded-2xl bg-white px-4 py-3 text-stone-900 shadow-sm ring-1 ring-stone-200", captainm && captainmStyles.hero)} style={{ background: captainm || orderino ? undefined : headerBackground }}>
        {!orderino && <>
        <div className={cn("pointer-events-none absolute -end-10 -top-10 size-48 rounded-full bg-white/10", captainm && "hidden")} />
        <div className={cn("pointer-events-none absolute -bottom-16 start-10 size-40 rounded-full bg-white/10", captainm && "hidden")} />
        {captainm && <div className="relative mx-auto mb-5 flex max-w-5xl justify-center"><span className={captainmStyles.heroKicker}><Icon name="sparkles" className="size-3.5" /> CAPTAIN M <span className="opacity-45">·</span> COSMIC MENU</span></div>}
        {languages.length > 1 && (
          <div className="relative mb-4 flex flex-wrap gap-1.5" dir="ltr">
            {languages.map((l) => <button key={l} onClick={() => setLang(l)} className={cn("rounded-full px-3 py-1 text-xs font-bold backdrop-blur transition", lang === l ? "bg-white text-stone-900" : "bg-white/15 text-white")}>{LANGS[l]?.name ?? l}</button>)}
          </div>
        )}
        <div className={cn("relative flex items-center gap-4", (editorial || softmenuTest || captainm || haftkhan) && "flex-col items-center gap-3", bistro && "gap-3")}>
          <span className={cn("flex size-16 items-center justify-center overflow-hidden bg-white text-3xl shadow-lg", (captainm || haftkhan) ? "rounded-full" : "rounded-2xl", captainm && captainmStyles.heroMark)}><BrandLogo url={biz.logoUrl} alt={biz.name} className="size-full object-contain p-2" fallback={<EmojiIcon emoji={biz.logoEmoji} />} /></span>
          <div><h1 className={cn("text-xl font-extrabold", captainm && captainmStyles.heroTitle)}>{biz.name}</h1><p className="mt-1 text-xs text-white/80">{t("menu")}</p></div>
        </div>
        {biz.description && lang === "fa" && <p className="relative mt-4 text-sm leading-7 text-white/90">{biz.description}</p>}
        <div className={cn("relative mt-4 flex flex-wrap gap-2 text-xs", (editorial || bistro || softmenuTest || captainm || haftkhan) && "justify-center")}>
          {biz.phone && <a href={`tel:${biz.phone}`} className={cn("flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur", captainm && captainmStyles.heroPill)}><Icon name="phone" className="size-3.5" />{biz.phone}</a>}
          {biz.address && lang === "fa" && <span className={cn("flex max-w-full items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur", captainm && captainmStyles.heroPill)}><Icon name="pin" className="size-3.5 shrink-0" /><span className="truncate">{biz.address}</span></span>}
          {biz.instagram && <a href={`https://instagram.com/${biz.instagram}`} target="_blank" className={cn("rounded-full bg-white/15 px-3 py-1.5 backdrop-blur", captainm && captainmStyles.heroPill)} dir="ltr">@{biz.instagram}</a>}
          <span className={cn("rounded-full bg-white/15 px-3 py-1.5 backdrop-blur", captainm && captainmStyles.heroPill)}>{biz.isOpen ? "اکنون باز است" : "اکنون بسته است"}</span>
          {canReserve && <Link href={`/m/${biz.slug}/reserve`} className="rounded-full bg-white px-3 py-1.5 font-bold text-stone-900 shadow-sm">رزرو میز</Link>}
          <IconText>{caps.miniSite && <a href={`/s/${biz.slug}`} className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{<EmojiIcon emoji="" />} وب‌سایت ما</a>}</IconText>
        </div>
        {readOnlyDemo && <p className={cn("relative mt-4 rounded-xl bg-white/15 px-3 py-2 text-xs leading-6", captainm && captainmStyles.notice)}>{canReserve ? "این منوی نمونه است؛ سفارش آنلاین غیرفعال است، اما می‌توانید رزرو میز را ثبت کنید و منو را بررسی کنید." : "این منوی نمونه است؛ سفارش آنلاین و رزرو میز در پلن فعلی فعال نیست، اما می‌توانید منو را بررسی کنید."}</p>}
        {readOnlyPreview && <p className={cn("relative mt-4 rounded-xl bg-white/15 px-3 py-2 text-xs leading-6", captainm && captainmStyles.notice)}>این پیش‌نمایش فقط برای بررسی قالب است؛ ثبت سفارش و رزرو از این صفحه انجام نمی‌شود.</p>}
        <IconText>{initialTableId && caps.selfOrder && tables.find((x) => x.id === initialTableId) && canOrder && (
          <div className="relative mt-5 flex items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 text-sm font-semibold text-stone-800">{<EmojiIcon emoji="" />} {tables.find((x) => x.id === initialTableId)!.name}</div>
        )}</IconText>
        </>}
        {orderino && <><div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-brand-700"><Icon name="menu" className="size-4"/></span><div><h1 className="text-sm font-extrabold">منوی دیجیتال</h1><p className="mt-0.5 text-[10px] text-stone-500">{biz.isOpen ? "سفارش‌گیری فعال است" : "برای مرور منو در دسترس هستیم"}</p></div></div>{languages.length > 1 && <div className="flex gap-1" dir="ltr">{languages.map((l) => <button key={l} onClick={() => setLang(l)} className={cn("rounded-full px-2 py-1 text-[10px] font-bold", lang === l ? "bg-blue-700 text-white" : "bg-stone-100 text-stone-600")}>{LANGS[l]?.name ?? l}</button>)}</div>}{canOrder && <button type="button" onClick={() => { if (!count) return toast("سبد خرید شما خالی است"); openCheckout(); }} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white" style={{ backgroundColor: biz.accentColor }}><Icon name="cart" className="size-4"/>سبد{count > 0 && <span className="rounded-full bg-white/20 px-1.5">{toFa(count)}</span>}</button>}</>}
      </header>

      <div className={cn("sticky top-0 z-20 -mt-4 rounded-t-3xl pb-2 pt-4 backdrop-blur", captainm && captainmStyles.toolbar)} style={{ backgroundColor: captainm ? undefined : `${menuBackground}f2` }}>
        <div className="grid gap-2 px-4 sm:grid-cols-[1fr_auto]"><div className="relative"><Icon name="search" className={cn("pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400", captainm && "text-cyan-200/70")} /><Input className={cn("ps-9", captainm && captainmStyles.searchInput)} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} /></div><Select aria-label="فیلتر ویژگی تغذیه‌ای" value={dietFilter} onChange={(e) => setDietFilter(e.target.value)} className={cn("sm:w-48", captainm && captainmStyles.filterInput)}><option value="">همه ویژگی‌ها</option>{DIETARY_TAGS.map((tag) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}</Select></div>
        {initialTable && initialTable.operationalStatus !== "available" && <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{initialTable.operationalStatus === "cleaning" ? "این میز در حال نظافت است و فعلاً سفارش نمی‌پذیرد." : "این میز موقتاً خارج از سرویس است. از کارکنان رستوران کمک بگیرید."}</div>}
        {!term && !softmenuTest && !captainm && !haftkhan && (
          <div className={cn("no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4", editorial && "justify-center")}>
            {grouped.map((s) => <button key={s.key} onClick={() => jump(s.id)} style={active === s.id ? { background: biz.accentColor } : undefined} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition", softmenuTest3 && "border border-emerald-950/10", active === s.id ? "text-white shadow-md" : "bg-white text-stone-600 ring-1 ring-stone-200")}>{s.title}</button>)}
          </div>
        )}
      </div>

      <main id="menu-items" className={cn("scroll-mt-24 space-y-8 px-4 pt-4", editorial && "px-5 sm:px-8", captainm && "space-y-6")}>
        {!term && biz.promotionalBanners.length > 0 && <section aria-label="بنرهای تبلیغاتی" className="grid gap-3 sm:grid-cols-2">
          {biz.promotionalBanners.map((banner) => {
            const image = <div className="relative aspect-[2.8/1] overflow-hidden rounded-2xl bg-stone-100 shadow-sm ring-1 ring-stone-200/70">
              <Image src={banner.imageUrl} alt={banner.title} fill unoptimized sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8 text-sm font-bold text-white">{banner.title}</span>
            </div>;
            return banner.href ? <a key={banner.id} href={banner.href} target={banner.href.startsWith("https:") ? "_blank" : undefined} rel={banner.href.startsWith("https:") ? "noreferrer" : undefined}>{image}</a> : <div key={banner.id}>{image}</div>;
          })}
        </section>}
        {!term && (softmenuTest || haftkhan) && <section aria-label="دسته‌بندی‌های منو" className={cn("rounded-2xl p-3 sm:p-4", softmenuTest && "bg-white/75 ring-1 ring-violet-950/10", haftkhan && "bg-[#f4e7e8]")}>
          <div className="mb-3 flex items-end justify-between gap-3"><div><span className={cn("text-[10px] font-bold", softmenuTest ? "text-violet-800" : "text-rose-900/60")}>انتخاب از منو</span><h2 className={cn("mt-1 text-base font-extrabold", haftkhan && "text-[#641c27]")}>دسته‌بندی‌ها</h2></div><span className="text-[10px] text-stone-500">{toFa(grouped.length)} دسته</span></div>
          <div className={cn("grid gap-2", softmenuTest ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" : "grid-cols-3 sm:grid-cols-5 lg:grid-cols-8")}>
            {grouped.map((section, index) => <button key={section.key} type="button" aria-pressed={active === section.id} onClick={() => jump(section.id)} className={cn("flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center transition", softmenuTest ? active === section.id ? "border-violet-800 bg-violet-800 text-white" : "border-violet-950/10 bg-white text-violet-950 hover:bg-violet-50" : active === section.id ? "border-[#641c27] bg-[#641c27] text-white" : "border-rose-950/10 bg-white text-[#641c27] hover:bg-rose-50")}>
              {haftkhan && <Icon name={["utensils", "coffee", "pizza", "leaf", "star", "pin", "book", "clock"][index % 8]} className="size-4" />}
              <span className="line-clamp-1 text-[10px] font-bold">{section.title}</span>
              <span className="text-[9px] opacity-65">{toFa(section.items.length)} انتخاب</span>
            </button>)}
          </div>
        </section>}
        {!term && featured.length > 0 && (
          <section>
            <h2 className={cn("mb-3 text-base font-extrabold", captainm && captainmStyles.sectionHeading)}><IconText>{t("featured")}</IconText></h2>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
              {featured.map((p) => (
                <div key={p.id} className={cn("w-44 shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70", captainm && captainmStyles.featuredCard)}>
                  <ProductThumb imageUrl={p.imageUrl} emoji={iconGlyph(p.emoji)} className="h-28 w-full" />
                  <div className="p-3"><p className="truncate text-sm font-bold">{nameOf("product", p.id, p.name)}</p>
                    <div className="mt-2 flex items-center justify-between"><span className="text-xs font-extrabold">{formatPrice(p.price)}{p.sellingMode === "weight" ? "/کیلو" : ""}</span>{canOrder && <button onClick={() => add(p)} aria-label="افزودن" className="flex size-7 items-center justify-center rounded-lg bg-[var(--accent)] text-white active:scale-90"><Icon name="plus" className="size-4" /></button>}</div></div>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className={cn(captainm && !term && "grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]")}>
          {captainm && !term && <aside className={cn("rounded-2xl border border-indigo-200/15 bg-[#101a32] p-3 text-slate-100 shadow-[0_14px_38px_-24px_rgba(34,211,238,.45)] lg:sticky lg:top-28", captainmStyles.sidebar)}>
            <h2 className="mb-3 flex items-center gap-2 px-2 text-xs font-extrabold text-cyan-100/85"><Icon name="sparkle" className="size-4"/>دسته‌های کهکشانی</h2>
            <nav className="no-scrollbar flex gap-2 overflow-x-auto pb-1 lg:max-h-[min(70dvh,44rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pe-1">
              {grouped.map((section) => <button key={section.key} type="button" aria-pressed={active === section.id} onClick={() => jump(section.id)} className={cn("min-h-9 shrink-0 rounded-lg px-3 text-start text-xs font-bold transition lg:w-full", captainmStyles.categoryButton, active === section.id && captainmStyles.categoryActive)}>{section.title}<span className="ms-2 text-[10px] opacity-65">{toFa(section.items.length)}</span></button>)}
            </nav>
          </aside>}
          <div className="space-y-6">
            <IconText>{grouped.length === 0 ? (
              <div className="py-16 text-center text-stone-500"><div className="text-5xl">{products.length ? "" : ""}</div><p className="mt-3 font-semibold">{t("empty")}</p></div>
            ) : grouped.map((s) => (
              <section key={s.key} data-cat={s.id} ref={(el) => { sectionRefs.current[s.key] = el; }} className="scroll-mt-32">
                <h2 className={cn("mb-3 text-base font-extrabold", softmenuTest && "text-[#352743]", captainm && captainmStyles.sectionHeading, haftkhan && "text-[#641c27]")}>{s.title}</h2>
                <div className={cn("space-y-3", editorial && "grid gap-4 space-y-0 sm:grid-cols-2", bistro && "grid grid-cols-2 gap-3 space-y-0 sm:grid-cols-3", (softmenuTest || captainm) && "grid grid-cols-2 gap-3 space-y-0 xl:grid-cols-3", haftkhan && "grid grid-cols-2 gap-2.5 space-y-0 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5", compact && "space-y-2", minimal && "space-y-0")}>{s.items.map((p) => <div key={p.id}>{renderCard(p)}</div>)}</div>
              </section>
            ))}</IconText>
          </div>
        </div>
        <footer className={cn("pb-4 pt-6 text-center text-[11px] text-stone-400", captainm && captainmStyles.footer)}>Powered by <b>منوی دیجیتال</b></footer>
      </main>

      <Modal
        open={serviceRequestOpen}
        onClose={() => { if (!serviceRequestBusy) setServiceRequestOpen(false); }}
        title="درخواست از کارکنان"
        description="میز را انتخاب کنید؛ می‌توانید فقط گارسون را صدا بزنید یا درخواست خود را بنویسید."
        size="sm"
        footer={<div className="grid w-full gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" className="min-h-11" loading={serviceRequestBusy} disabled={!serviceRequestTableId} onClick={() => void sendServiceRequest(false)}><Icon name="bell" className="size-4" /> فقط صدا کردن گارسون</Button>
          <Button type="button" className="min-h-11" loading={serviceRequestBusy} disabled={!serviceRequestTableId || !serviceRequestMessage.trim()} onClick={() => void sendServiceRequest(true)}><Icon name="message" className="size-4" /> ارسال پیام</Button>
        </div>}
      >
        <div className="space-y-3" dir="rtl">
          <label className="block text-sm font-semibold text-stone-700" htmlFor="service-request-table">میز شما</label>
          <Select id="service-request-table" value={serviceRequestTableId} onChange={(event) => setServiceRequestTableId(event.target.value)} disabled={serviceRequestBusy}>
            <option value="">انتخاب میز</option>
            {serviceableTables.map((table) => <option key={table.id} value={table.id}>{table.name} · {table.zone}{table.operationalStatus !== "available" ? " · در حال استفاده" : ""}</option>)}
          </Select>
          {serviceableTables.length === 0 && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">در حال حاضر میزی برای اتصال درخواست وجود ندارد. کارکنان رستوران باید میزها را در پنل ثبت و فعال کنند.</p>}
          <label className="block text-sm font-semibold text-stone-700" htmlFor="service-request-message">درخواست شما <span className="font-normal text-stone-400">(اختیاری)</span></label>
          <Textarea id="service-request-message" rows={4} maxLength={300} value={serviceRequestMessage} onChange={(event) => setServiceRequestMessage(event.target.value)} disabled={serviceRequestBusy} placeholder="مثلاً لطفاً یک منوی دیگر بیاورید…" />
          <p className="text-left text-xs text-stone-400">{toFa(serviceRequestMessage.length)} از ۳۰۰ نویسه</p>
        </div>
      </Modal>

      <Modal open={sheet} onClose={() => setSheet(false)} title="" footer={<Button size="lg" className="w-full !bg-[var(--accent)]" loading={busy} onClick={submit} disabled={!lines.length}>{t("submit")} · {formatPrice(checkoutTotal)}</Button>}>
        <div className="space-y-4" dir={dir}>
          <ul className="space-y-3">
            {lines.map(({ key, p, qty, lineTotal, weightGrams, netWeightGrams, tareGrams, optionIds, optionSnapshot }) => (
              <li key={key} className="flex items-center gap-3">
                <span className="text-2xl">{<EmojiIcon emoji={p.emoji} /> }</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{nameOf("product", p.id, p.name)}</p>{netWeightGrams != null && <p className="text-[11px] text-stone-500">{toFa(netWeightGrams)} گرم خالص{tareGrams ? ` · ظرف ${toFa(tareGrams)} گرم` : ""}</p>}{optionSnapshot.length > 0 && <p className="text-[11px] text-stone-500">{optionSnapshot.map((option) => option.optionName).join("، ")}</p>}<p className="text-xs text-stone-500">{formatPrice(lineTotal)}</p></div>
                <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-0.5">
                  <button className="flex size-8 items-center justify-center rounded-md hover:bg-white" onClick={() => addVariant(p, optionIds, -1, weightGrams ?? undefined, tareGrams)} aria-label="کم کردن"><Icon name={qty === 1 ? "trash" : "minus"} className="size-4" /></button>
                  <span className="w-6 text-center text-sm font-bold">{toFa(qty)}</span>
                  <button className="flex size-8 items-center justify-center rounded-md hover:bg-white" onClick={() => addVariant(p, optionIds, 1, weightGrams ?? undefined, tareGrams)} aria-label="افزودن"><Icon name="plus" className="size-4" /></button>
                </div>
              </li>
            ))}
          </ul>

          <IconText>{recs.length > 0 && (
            <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <p className="mb-2 text-xs font-bold text-amber-800">{<EmojiIcon emoji="" />} {t("suggest")}</p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">{recs.map((r) => (
                <button key={r.id} onClick={() => { const product = products.find((x) => x.id === r.id); if (product) add(product); }} className="flex shrink-0 items-center gap-2 rounded-xl bg-white px-3 py-2 text-start text-xs shadow-sm ring-1 ring-amber-100 active:scale-95"><span className="text-xl">{<EmojiIcon emoji={r.emoji} /> }</span><span><b className="block max-w-28 truncate">{nameOf("product", r.id, r.name)}</b><span className="block text-stone-500">{formatPrice(r.price)}</span>{(r.recommendationReason === "drink_pairing" || r.recommendationReason === "food_pairing") && <span className="block max-w-32 truncate text-[10px] font-semibold text-amber-700">{t(r.recommendationReason === "drink_pairing" ? "drinkPairing" : "foodPairing")}</span>}</span><span className="flex size-6 items-center justify-center rounded-full bg-[var(--accent)] text-white">+</span></button>
              ))}</div>
            </div>
          )}</IconText>

          {types.length > 1 && <div className="grid gap-1.5 rounded-xl bg-stone-100 p-1" style={{ gridTemplateColumns: `repeat(${types.length}, 1fr)` }}>{types.map((x) => <button key={x.k} onClick={() => setType(x.k)} className={cn("rounded-lg py-2 text-sm font-semibold transition", type === x.k ? "bg-white shadow" : "text-stone-500")}><IconText>{x.l}</IconText></button>)}</div>}
          <IconText>{type === "dine_in" && tables.length > 0 && (
            <Select value={tableId} onChange={(e) => setTableId(e.target.value)} aria-label="table"><option value="">{<EmojiIcon emoji="" />} میز…</option>{tables.filter((x) => x.operationalStatus === "available" || x.id === initialTableId).map((x) => <option key={x.id} value={x.id} disabled={x.operationalStatus !== "available"}>{<EmojiIcon emoji="" />} {x.name} — {x.zone}{x.operationalStatus !== "available" ? " · سفارش نمی‌پذیرد" : ""}</option>)}</Select>
          )}</IconText>
          <IconText>{type === "delivery" && (
            <div className="space-y-2">
              <MapPicker value={pin} height={230} onChange={(lat, lng) => setPin({ lat, lng })} onAddress={(a) => setAddress((cur) => cur.trim() ? cur : a)} origin={biz.lat != null && biz.lng != null ? { lat: biz.lat, lng: biz.lng } : null} radii={zones.map((z) => z.radiusKm).filter((r) => r > 0)} />
              <Textarea rows={2} placeholder="آدرس کامل تحویل (پلاک، واحد، …) *" value={address} onChange={(e) => setAddress(e.target.value)} />
              {radiusMode ? (
                dist !== null && <p className={cn("rounded-xl px-3 py-2 text-xs font-semibold", autoZone ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>{autoZone ? ` ${toFa(dist.toFixed(1))} کیلومتر تا ما · ${autoZone.name} · هزینه ارسال ${autoZone.fee ? formatPrice(autoZone.fee) : "رایگان"} · حدود ${toFa(autoZone.etaMinutes)} دقیقه` : " این نقطه خارج از محدوده ارسال است"}</p>
              ) : zones.length > 0 ? <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}><option value="">محدوده ارسال…</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {z.fee ? formatPrice(z.fee) : "رایگان"} · {toFa(z.etaMinutes)} دقیقه</option>)}</Select> : null}
            </div>
          )}</IconText>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="نام (اختیاری)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input inputMode="tel" dir="ltr" className="text-left" placeholder={type === "delivery" ? "موبایل *" : "موبایل (باشگاه مشتریان)"} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <IconText>{caps.preorder && (
            <div className="rounded-xl bg-stone-50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="accent-[var(--accent)]" checked={pre} onChange={(e) => setPre(e.target.checked)} />  {<EmojiIcon emoji="" />} پیش‌سفارش (تحویل در زمان مشخص)</label>
              {pre && <PersianDateInput className="mt-2" value={when} onChange={setWhen} withTime placeholder="انتخاب روز و ساعت" />}
            </div>
          )}</IconText>
          {customerProfile?.activeReward && <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3.5 text-sm">
            <label className={cn("flex cursor-pointer items-start gap-2.5", applied && "cursor-not-allowed opacity-60")}>
              <input type="checkbox" className="mt-1 accent-amber-700" checked={selectedRewardClaimId === customerProfile.activeReward.id} disabled={!!applied || !!selectedWheelReward} onChange={(event) => {
                const useReward = event.target.checked;
                setSelectedRewardClaimId(useReward ? customerProfile.activeReward!.id : null);
                if (useReward) { setSelectedWheelSpinId(null); setActiveWheelReward(null); }
                if (useReward) { setApplied(null); setCode(""); }
              }} />
              <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 font-extrabold text-amber-950"><Icon name="award" className="size-4"/> جایزهٔ شما در سفارش بعدی</span><span className="mt-1 block text-xs font-semibold text-amber-900">{customerProfile.activeReward.rewardType === "discount_percent" ? `${toFa(customerProfile.activeReward.discountPercent)}٪ تخفیف روی سفارش` : `${customerProfile.activeReward.productName} به‌صورت رایگان`}</span><span className="mt-1 block text-[11px] leading-5 text-amber-900/75">{customerProfile.activeReward.campaignName} · اعتبار تا {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(customerProfile.activeReward.expiresAt))}</span></span>
            </label>
            {selectedReward && <p className="mt-2 border-t border-amber-200 pt-2 text-[11px] leading-5 text-amber-900">این جایزه فقط برای همین سفارش بعدی است. اگر سفارش را بدون جایزه ثبت کنید، امکان استفادهٔ دوباره از آن وجود ندارد.{applied ? " ابتدا کد تخفیف را پاک کنید." : ""}</p>}
            {selectedReward?.rewardType === "free_item" && !freeRewardProduct && <p role="alert" className="mt-2 text-xs text-rose-700">آیتم جایزه در منوی فعلی موجود نیست؛ پیش از ثبت سفارش با رستوران تماس بگیرید.</p>}
          </section>}
          {activeWheelReward && <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-3.5 text-sm">
            <label className={cn("flex cursor-pointer items-start gap-2.5", (applied || selectedReward) && "cursor-not-allowed opacity-60")}>
              <input type="checkbox" className="mt-1 accent-violet-700" checked={selectedWheelSpinId === activeWheelReward.id} disabled={!!applied || !!selectedReward} onChange={(event) => {
                const useReward = event.target.checked;
                setSelectedWheelSpinId(useReward ? activeWheelReward.id : null);
                if (useReward) { setSelectedRewardClaimId(null); setApplied(null); setCode(""); }
              }} />
              <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 font-extrabold text-violet-950"><Icon name="sparkles" className="size-4" /> جایزهٔ گردونهٔ شما</span>
                <span className="mt-1 block text-xs font-semibold text-violet-900">{activeWheelReward.prizeType === "fixed_amount" ? `${formatPrice(activeWheelReward.snapshot.amount ?? 0)} تخفیف` : activeWheelReward.prizeType === "discount_code" ? `کد ${activeWheelReward.snapshot.discountCode ?? "تخفیف"}` : (activeWheelReward.snapshot.products ?? []).map((product) => product.name).join("، ") + " رایگان"}</span>
                <span className="mt-1 block text-[11px] leading-5 text-violet-900/75">{activeWheelReward.title} · فقط برای سفارش بعدی · انقضا {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(activeWheelReward.expiresAt))}</span>
              </span>
            </label>
            {selectedWheelReward && wheelDiscount < 1 && <p role="alert" className="mt-2 text-xs text-rose-700">برای اعمال این جایزه مبلغ سفارش باید به حداقل تعیین‌شده برای کد تخفیف برسد.</p>}
          </section>}
          {caps.discount && (
            <div className="space-y-1.5"><div className="flex gap-2"><Input dir="ltr" className="text-left uppercase" placeholder={selectedRewardClaimId || selectedWheelSpinId ? "برای کد، جایزه را بردارید" : "کد تخفیف"} value={code} disabled={!!selectedRewardClaimId || !!selectedWheelSpinId} onChange={(e) => { setCode(e.target.value); setApplied(null); }} /><Button variant="secondary" onClick={applyCode} disabled={!code.trim() || !!selectedRewardClaimId || !!selectedWheelSpinId}>اعمال</Button></div>{applied && <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><span>{applied.code} · {formatPrice(disc)} تخفیف</span><button type="button" className="font-bold underline" onClick={() => { setApplied(null); setCode(""); }}>حذف کد</button></div>}</div>
          )}
          {caps.walletPayment && <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm">
            {customerProfile ? customerProfile.walletBalance > 0 ? <label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-1 accent-emerald-700" checked={useWalletCredit} onChange={(event) => setUseWalletCredit(event.target.checked)} /><span className="min-w-0 flex-1"><span className="block font-bold text-emerald-950">استفاده از اعتبار کیف پول</span><span className="mt-1 block text-xs leading-5 text-emerald-900/75">موجودی {formatPrice(customerProfile.walletBalance)} · قابل استفاده برای این فاکتور تا {formatPrice(Math.min(customerProfile.walletBalance, walletCreditCap))}</span></span></label> : <p className="text-xs leading-5 text-emerald-900">اعتبار کیف پول این پروفایل فعلاً صفر است.</p> : <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs leading-5 text-emerald-900">برای استفاده از امتیازها و اعتبار کیف پول، با شماره موبایل تأییدشده وارد شوید.</p><Button type="button" size="sm" variant="secondary" onClick={() => { setSheet(false); setProfileRequest((value) => value + 1); }}>ورود به پروفایل</Button></div>}
          </section>}
          <IconText>{caps.cashback && <p className="rounded-xl bg-stone-100 px-3 py-2.5 text-xs leading-6 text-stone-600">با پرداخت سفارش، امتیاز و اعتبار باشگاه مشتریان طبق تنظیمات رستوران محاسبه می‌شود.</p>}</IconText>
          <Textarea rows={2} placeholder="توضیحات سفارش…" value={note} onChange={(e) => setNote(e.target.value)} />
          {payOptions.length > 0 && (
            <fieldset className="space-y-1.5">
              <legend className="mb-2 text-sm font-bold text-stone-700">روش پرداخت</legend>
              {payOptions.map((o) => <label key={o.k} className={cn("flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm ring-1 transition", payment === o.k ? "bg-[var(--accent)]/10 ring-[var(--accent)]" : "ring-stone-200")}><input type="radio" name="pay" className="accent-[var(--accent)]" checked={payment === o.k} onChange={() => setPayment(o.k)} /><IconText>{o.l}</IconText></label>)}
            </fieldset>
          )}
          <div className="space-y-1.5 rounded-xl bg-stone-50 p-3.5 text-sm text-stone-600">
            <div className="flex justify-between"><span>{t("sub")}</span><span>{formatPrice(orderSubtotal)}</span></div>
            {selectedReward && rewardDiscount > 0 && <div className="flex justify-between text-amber-700"><span>{selectedReward.rewardType === "free_item" ? `آیتم رایگان (${selectedReward.productName})` : `جایزهٔ وفاداری · ${toFa(selectedReward.discountPercent)}٪`}</span><span>-{formatPrice(rewardDiscount)}</span></div>}
            {!selectedReward && disc > 0 && <div className="flex justify-between text-emerald-600"><span>تخفیف ({applied?.code})</span><span>-{formatPrice(disc)}</span></div>}
            {fee > 0 && <div className="flex justify-between"><span>هزینه ارسال</span><span>{formatPrice(fee)}</span></div>}
            {tax > 0 && <div className="flex justify-between"><span>مالیات ({toFa(biz.taxPercent)}٪)</span><span>{formatPrice(tax)}</span></div>}
            {svc > 0 && <div className="flex justify-between"><span>خدمات ({toFa(biz.servicePercent)}٪)</span><span>{formatPrice(svc)}</span></div>}
            {walletCreditApplied > 0 && <div className="flex justify-between text-emerald-700"><span>اعتبار کیف پول</span><span>-{formatPrice(walletCreditApplied)}</span></div>}
            <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-extrabold text-stone-900"><span>{t("total")}</span><span>{formatPrice(checkoutTotal)}</span></div>
          </div>
        </div>
      </Modal>

      <Modal open={!!done} onClose={() => setDone(null)} title="" size="sm" footer={<Button className="w-full" onClick={() => setDone(null)}>OK</Button>}>
        <IconText>{done && (
          <div className="py-4 text-center">
            <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-50 text-4xl animate-pop">{<EmojiIcon emoji="" />}</div>
            <p className="mt-4 text-lg font-extrabold">{done.paymentMethod === "card_to_card" ? "سفارش ثبت شد؛ در انتظار تأیید پرداخت" : "سفارش شما دریافت شد"}</p>
            <p className="mt-2 text-sm text-stone-500">شماره سفارش</p>
            <p className="text-3xl font-extrabold" style={{ color: biz.accentColor }}>#{toFa(done.number)}</p>
            <p className="mt-3 text-sm text-stone-600">{formatPrice(done.total)}</p>
            {done.trackingUrl && <a href={done.trackingUrl} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-stone-100 px-4 text-sm font-bold text-stone-800">پیگیری امن وضعیت سفارش</a>}
            {done.paymentMethod === "card_to_card" && done.cardTransfer && (
              <div className="mt-5 space-y-3 rounded-2xl bg-amber-50 p-4 text-start ring-1 ring-amber-200">
                <p className="text-sm font-bold text-amber-950">مبلغ فاکتور را به یکی از کارت‌های زیر واریز کنید</p>
                {(done.cardTransfer.cards?.length ? done.cardTransfer.cards : [done.cardTransfer]).map((card, index) => <div key={card.id || index} className="space-y-2 rounded-xl bg-amber-100/70 p-3">
                  {card.bankName && <p className="text-xs text-amber-900">بانک {card.bankName}</p>}
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-white p-3">
                    <b dir="ltr" className="font-mono text-base tracking-wider text-stone-900">{card.cardNumber}</b>
                    <button type="button" className="btn btn-sm btn-ghost text-primary" onClick={() => navigator.clipboard.writeText(card.cardNumber).then(() => toast("شماره کارت کپی شد")).catch(() => toast("کپی شماره کارت انجام نشد", "error"))}><Icon name="copy" className="size-4" />کپی</button>
                  </div>
                  <p className="text-xs text-amber-950">به نام {card.accountHolder}</p>
                  {card.instructions && <p className="text-xs leading-6 text-amber-900">{card.instructions}</p>}
                </div>)}
                <p className="border-t border-amber-200 pt-2 text-xs leading-6 text-amber-900">شماره سفارش را برای پیگیری اعلام کنید. رستوران پس از بررسی و تأیید واریز، سفارش را وارد مرحله آماده‌سازی می‌کند.</p>
              </div>
            )}
          </div>
        )}</IconText>
      </Modal>

      <Modal open={!!rewardCelebration} onClose={() => setRewardCelebration(null)} title="جایزهٔ وفاداری" size="sm" footer={<Button className="w-full" onClick={() => setRewardCelebration(null)}>رفتن به منو و انتخاب سفارش بعدی</Button>}>
        {rewardCelebration && <div className="relative overflow-hidden py-4 text-center">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">{Array.from({ length: 12 }, (_, index) => <span key={index} className={cn("absolute top-5 size-2.5 rounded-sm animate-bounce", index % 3 === 0 ? "bg-amber-400" : index % 3 === 1 ? "bg-sky-400" : "bg-emerald-400")} style={{ insetInlineStart: `${8 + index * 7}%`, animationDelay: `${(index % 6) * 90}ms`, transform: `rotate(${index * 29}deg)` }} />)}</div>
          <div className="relative mx-auto grid size-28 place-items-center rounded-full bg-gradient-to-br from-amber-100 via-white to-sky-100 shadow-[0_16px_45px_-18px_rgba(217,119,6,.6)] animate-pop"><span className="absolute inset-2 rounded-full border border-dashed border-amber-300 animate-spin" style={{ animationDuration: "14s" }}/><span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg"><Icon name="award" className="size-9"/></span><Icon name="sparkles" className="absolute -end-1 top-2 size-7 text-sky-500 animate-pulse"/><Icon name="sparkles" className="absolute -start-2 bottom-3 size-5 text-amber-500 animate-pulse"/></div>
          <p className="mt-5 text-xl font-black text-stone-900">شما برنده شدید!</p>
          <p className="mt-2 text-sm font-extrabold text-amber-800">{rewardCelebration.rewardType === "discount_percent" ? `${toFa(rewardCelebration.discountPercent)}٪ تخفیف سفارش بعدی` : `${rewardCelebration.productName} رایگان در سفارش بعدی`}</p>
          <p className="mt-1 text-xs text-stone-500">{rewardCelebration.campaignName}</p>
          <div className="mx-auto mt-4 max-w-xs rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-950">جایزه در پروفایل شما ذخیره شد و تا <b>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(rewardCelebration.expiresAt))}</b> اعتبار دارد. آن را در سفارش بعدی انتخاب کنید.</div>
        </div>}
      </Modal>

      <Modal open={!!rewardClaimError} onClose={() => setRewardClaimError("")} title="فعال‌سازی جایزه انجام نشد" size="sm" footer={<div className="flex w-full gap-2"><Button variant="ghost" className="flex-1" onClick={() => { setRewardClaimError(""); setRewardToken(""); }}>بستن</Button><Button className="flex-1" loading={rewardClaimBusy} disabled={!customerProfile || !rewardToken} onClick={() => void activateScannedReward(rewardToken)}>تلاش دوباره</Button></div>}>
        <div className="rounded-2xl bg-rose-50 p-4 text-sm leading-7 text-rose-900">{rewardClaimError}</div>
        {!customerProfile && <p className="mt-3 text-xs text-stone-500">برای فعال‌سازی با شمارهٔ تأییدشده وارد پروفایل شوید.</p>}
      </Modal>

      <Modal open={!!ar} onClose={() => setAr(null)} title={ar ? nameOf("product", ar.id, ar.name) : ""}>{ar && <ModelViewer src={ar.arModelUrl} />}</Modal>
      <PublicProductDetails key={detailProduct?.id ?? "closed"} product={detailProduct} slug={biz.slug} accent={biz.accentColor} profile={customerProfile} darkTheme={captainm} readOnly={readOnlyDemo || readOnlyPreview} onClose={() => setDetailProduct(null)} onProfileRequired={() => setProfileRequest((value) => value + 1)} />
      {optionProduct && <ProductOptionPicker product={optionProduct} onClose={() => setOptionProduct(null)} onConfirm={(selection) => { if (addVariant(optionProduct, selection.optionIds, 1, selection.weightGrams, selection.tareGrams)) { trackMenuEvent(biz.slug, "add_to_cart", { productId: optionProduct.id }); setOptionProduct(null); } }} />}
      {caps.waiterCall && !readOnlyPreview && <div dir="ltr" className={cn("pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-2xl justify-end px-4", (editorial || bistro) && "max-w-5xl", captainm && "max-w-7xl")} style={{ bottom: "calc(5.75rem + env(safe-area-inset-bottom))" }}>
        <button type="button" dir="rtl" aria-label="درخواست از گارسون؛ صدا زدن یا ارسال پیام" onClick={openServiceRequest} style={{ background: captainm ? "linear-gradient(135deg, #0e7490, #3730a3)" : `linear-gradient(135deg, ${biz.accentColor}, ${biz.accentColor}dd)` }} className="group pointer-events-auto inline-flex min-h-[3.75rem] items-center gap-3 rounded-2xl border border-white/30 px-4 py-2.5 text-start text-white shadow-[0_12px_32px_-10px_rgba(15,23,42,.55)] ring-1 ring-black/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-10px_rgba(15,23,42,.5)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/70">
          <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/15 ring-1 ring-inset ring-white/20"><span className="absolute -end-1 -top-1 size-4 rounded-full bg-white/20 blur-sm" /><Icon name="bell" className="size-5 transition-transform duration-200 group-hover:-rotate-12" /></span>
          <span className="grid gap-0.5"><span className="text-sm font-extrabold leading-5">درخواست از گارسون</span><span className="text-[10px] font-medium text-white/80">صدا بزنید یا پیام بفرستید</span></span>
          <span aria-hidden="true" className="ms-1 size-1.5 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.85)]" />
        </button>
      </div>}
      <PublicMenuNavigation
        key={`${biz.slug}:${readOnlyDemo}:${readOnlyPreview}`}
        slug={biz.slug}
        accent={biz.accentColor}
        template={biz.menuTemplate ?? "classic"}
        language={lang}
        cartCount={count}
        subtotal={subtotal}
        canOrder={canOrder}
        readOnly={readOnlyDemo || readOnlyPreview}
        wheelEnabled={biz.loyaltyWheelEnabled && !readOnlyDemo && !readOnlyPreview}
        customerFeedbackEnabled={biz.customerFeedbackEnabled && !readOnlyDemo && !readOnlyPreview}
        profileRequest={profileRequest}
        onProfileChange={handleCustomerProfileChange}
        onWheelRewardChange={handleWheelRewardChange}
        onProfileRequestHandled={() => setProfileRequest(0)}
        onMenu={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onCart={() => {
          if (!canOrder) return toast("ثبت سفارش در این پیش‌نمایش فعال نیست", "error");
          if (!count) return toast("سبد خرید شما خالی است");
          openCheckout();
        }}
      />
    </div>
  );
}
