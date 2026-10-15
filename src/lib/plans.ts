// Pure (client-safe) plan & feature definitions.

export type PlanKey = "basic" | "premium" | "premium_plus";
export type Level = "yes" | "no" | "custom";
export type FeatureMap = Record<string, Level>;

export const PLAN_KEYS: PlanKey[] = ["basic", "premium", "premium_plus"];

export const PLANS: { key: PlanKey; name: string; tag: string; price: number; oldPrice: number }[] = [
  { key: "basic", name: "پایه", tag: "سایت منو و کاتالوگ محصولات", price: 2990000, oldPrice: 3490000 },
  { key: "premium", name: "پرمیوم", tag: "سفارشگیر، حسابداری و انبارداری", price: 11990000, oldPrice: 13990000 },
  { key: "premium_plus", name: "پرمیوم پلاس", tag: "مخصوص برندهای زنجیره‌ای", price: 19990000, oldPrice: 24990000 },
];

export const planName = (k: string) => PLANS.find((p) => p.key === k)?.name ?? k;

export const GROUPS: Record<string, { title: string; emoji: string }> = {
  base: { title: "امکانات پایه", emoji: "🧩" },
  marketing: { title: "بازاریابی و ارتباط با مشتری", emoji: "📣" },
  sales: { title: "سفارش‌گیری، فروش و سبد خرید", emoji: "🛒" },
  accounting: { title: "حسابداری و امور مالی", emoji: "💰" },
  inventory: { title: "انبار و تولید", emoji: "📦" },
  hardware: { title: "سخت‌افزار و اتوماسیون", emoji: "🖨️" },
};

export type FeatureDef = {
  key: string;
  group: keyof typeof GROUPS;
  label: string;
  desc?: string;
  levels: [Level, Level, Level]; // basic, premium, premium_plus
};

const Y: Level = "yes";
const N: Level = "no";
const C: Level = "custom";

export const FEATURES: FeatureDef[] = [
  { key: "setup", group: "base", label: "راه‌اندازی رایگان توسط شرکت", levels: [Y, Y, Y] },
  { key: "support", group: "base", label: "پشتیبانی ۲۴ ساعته (تیکت و خط موبایل)", levels: [Y, Y, Y] },
  { key: "mini_site", group: "base", label: "مینی وبسایت مجزا", desc: "وبسایت اختصاصی برای معرفی کسب‌وکار، نمایش منو و اطلاعات تماس.", levels: [Y, N, C] },
  { key: "surveys", group: "base", label: "طراحی و ساخت و اشتراک‌گذاری نظرسنجی", desc: "ساخت فرم نظرسنجی و دریافت بازخورد مشتریان.", levels: [Y, Y, Y] },
  { key: "loyalty", group: "base", label: "باشگاه مشتریان هوشمند", desc: "مدیریت مشتریان و برنامه‌های وفاداری برای افزایش خرید مجدد.", levels: [Y, Y, Y] },

  { key: "sms", group: "marketing", label: "پنل پیامکی با خط خدماتی و تبلیغاتی", desc: "ارسال پیامک‌های خدماتی، اطلاع‌رسانی و تبلیغاتی.", levels: [Y, Y, Y] },
  { key: "bale", group: "marketing", label: "پنل پیامکی ارسال تبلیغات در پیام‌رسان بله", levels: [Y, Y, Y] },
  { key: "translation", group: "marketing", label: "امکان ترجمه به تمامی زبان‌های دنیا", levels: [Y, Y, Y] },
  { key: "custom_domain", group: "marketing", label: "امکان پارک روی دامنه اختصاصی", levels: [Y, Y, Y] },
  { key: "ar", group: "marketing", label: "امکان نمایش واقعیت افزوده", desc: "نمایش محصولات با فناوری واقعیت افزوده (AR).", levels: [Y, Y, Y] },
  { key: "ai", group: "marketing", label: "افزونه‌های هوش مصنوعی", desc: "هوشمندسازی و اتوماسیون کسب‌وکار.", levels: [Y, Y, Y] },

  { key: "cross_sell", group: "sales", label: "پیشنهاد محصول مکمل به مشتری (Cross Sell)", desc: "پیشنهاد خودکار محصولات مرتبط برای افزایش میانگین مبلغ سفارش.", levels: [Y, Y, Y] },
  { key: "ipg", group: "sales", label: "اتصال به درگاه پرداخت بانکی (IPG)", desc: "دریافت آنلاین وجه سفارش‌ها.", levels: [N, Y, Y] },
  { key: "installment", group: "sales", label: "اتصال به درگاه اقساطی اسنپ‌پی و دیجی‌پی", levels: [N, Y, Y] },
  { key: "cashier_pos", group: "sales", label: "سیستم سفارش‌گیر صندوق و گارسون", levels: [N, Y, Y] },
  { key: "self_order", group: "sales", label: "سیستم سفارش‌گیر حضوری توسط مشتری", levels: [N, Y, Y] },
  { key: "kiosk", group: "sales", label: "سفارش‌گیر کیوسک (خودسفارش‌دهی لمسی)", desc: "صفحه‌ی لمسی سفارش‌دهی مشتری با ۵ قالب طراحی.", levels: [N, Y, Y] },
  { key: "delivery_order", group: "sales", label: "سیستم سفارش‌گیر دلیوری آنلاین", levels: [N, Y, Y] },
  { key: "preorder", group: "sales", label: "سیستم پیش‌سفارش", desc: "ثبت سفارش از قبل و آماده‌سازی در زمان مشخص.", levels: [N, Y, Y] },
  { key: "discount", group: "sales", label: "سیستم کد تخفیف", levels: [N, Y, Y] },
  { key: "cashback", group: "sales", label: "سیستم تخفیف کش‌بک", desc: "بازگرداندن بخشی از مبلغ خرید به‌صورت اعتبار.", levels: [N, Y, Y] },

  { key: "accounting", group: "accounting", label: "سیستم حسابداری فروش", levels: [N, Y, Y] },
  { key: "income_expense", group: "accounting", label: "سیستم درآمد و هزینه", levels: [N, Y, Y] },
  { key: "sales_reports", group: "accounting", label: "سیستم گزارش فروش", levels: [N, Y, Y] },
  { key: "profit_loss", group: "accounting", label: "سیستم گزارش سود و زیان", levels: [N, Y, Y] },
  { key: "bank_report", group: "accounting", label: "گزارش تجمیعی بانک", levels: [N, Y, Y] },
  { key: "assets", group: "accounting", label: "مدیریت اموال و استهلاک", levels: [N, Y, Y] },

  { key: "inventory", group: "inventory", label: "سیستم انبارداری", levels: [N, Y, Y] },
  { key: "stock_movements", group: "inventory", label: "سیستم گردش انبار", levels: [N, Y, Y] },
  { key: "stock_control", group: "inventory", label: "سیستم کنترل انبار", levels: [N, Y, Y] },
  { key: "recipes", group: "inventory", label: "سیستم فرمول ساخت", levels: [N, Y, Y] },
  { key: "costing", group: "inventory", label: "سیستم بهای تمام‌شده", levels: [N, Y, Y] },

  { key: "courier", group: "hardware", label: "مدیریت پیک", levels: [N, Y, Y] },
  { key: "zones", group: "hardware", label: "مدیریت محدوده و منطقه‌بندی", levels: [N, Y, Y] },
  { key: "tablet_pos", group: "hardware", label: "اتوماسیون تبلت و پوز", levels: [N, Y, Y] },
  { key: "cloud_printer", group: "hardware", label: "اتوماسیون پرینتر ابری", levels: [N, Y, Y] },
  { key: "caller_id", group: "hardware", label: "سیستم کالر آیدی", levels: [N, Y, Y] },
  { key: "scale", group: "hardware", label: "سیستم ترازوی دیجیتال", levels: [N, Y, Y] },
  { key: "pager_voice", group: "hardware", label: "پیجر صوتی شماره فاکتور", levels: [N, Y, Y] },
  { key: "foodcourt_pager", group: "hardware", label: "ثبت پیجر فودکورتی", levels: [N, Y, Y] },
];

export const featureLabel = (k: string) => FEATURES.find((f) => f.key === k)?.label ?? k;

export function resolveFeatures(
  plan: string,
  overrides: Record<string, boolean> | null | undefined,
  planOverrides?: Record<string, Record<string, Level>>,
): FeatureMap {
  const i = Math.max(0, PLAN_KEYS.indexOf(plan as PlanKey));
  const map: FeatureMap = {};
  for (const f of FEATURES) {
    let level: Level = planOverrides?.[plan]?.[f.key] ?? f.levels[i];
    const o = overrides?.[f.key];
    if (o === true && level === "no") level = "yes";
    if (o === false) level = "no";
    map[f.key] = level;
  }
  return map;
}

export const hasAny = (map: FeatureMap, key: string | string[]) =>
  (Array.isArray(key) ? key : [key]).some((k) => (map[k] ?? "no") !== "no");

// ---- business settings (stored as jsonb) ----
export type MiniSite = {
  heroTitle?: string;
  heroSubtitle?: string;
  heroImage?: string;
  about?: string;
  hours?: string;
  gallery?: string[];
  showMenuButton?: boolean;
  sections?: { title: string; text: string }[];
};

export type Settings = {
  miniSite?: MiniSite;
  languages?: string[];
  pointsPerToman?: number;
  cashbackPercent?: number;
  ipg?: { provider: string; merchantId: string; sandbox: boolean };
  installment?: { snappay: boolean; digipay: boolean };
  smsSender?: string;
  sms?: { provider: "kavenegar" | "smsir"; apiKey: string; sender?: string; origin?: string; birthdayAuto?: boolean; birthdayTemplateId?: number; birthdayCode?: string; birthdayDiscount?: string };
  cashbackEnabled?: boolean;
  cashbackMinOrder?: number;
  cashbackMaxRedeemPercent?: number;
  baleBot?: string;
  crossSellAuto?: boolean;
  segments?: { vipSpent?: number; vipOrders?: number; loyalSpent?: number; loyalOrders?: number; atRiskDays?: number; lostDays?: number };
  kiosk?: { template: string; welcomeTitle?: string; welcomeSubtitle?: string; idleSeconds?: number; allowCounter?: boolean; allowOnline?: boolean; askPhone?: boolean; allowPos?: boolean; posDeviceId?: number };
};

export const LANGS: Record<string, { name: string; dir: "rtl" | "ltr" }> = {
  fa: { name: "فارسی", dir: "rtl" },
  en: { name: "English", dir: "ltr" },
  ar: { name: "العربية", dir: "rtl" },
  tr: { name: "Türkçe", dir: "ltr" },
  ru: { name: "Русский", dir: "ltr" },
  de: { name: "Deutsch", dir: "ltr" },
  fr: { name: "Français", dir: "ltr" },
  es: { name: "Español", dir: "ltr" },
  it: { name: "Italiano", dir: "ltr" },
  zh: { name: "中文", dir: "ltr" },
  ja: { name: "日本語", dir: "ltr" },
  hi: { name: "हिन्दी", dir: "ltr" },
  ku: { name: "کوردی", dir: "rtl" },
  az: { name: "Azərbaycan", dir: "ltr" },
};
