import type { FeatureMap } from "@/lib/plans";

export type SetupTourStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  action: string;
  icon: string;
};

const enabled = (features: FeatureMap, key: string) => (features[key] ?? "no") !== "no";

export const TOUR_EVENT = "menupeak:setup-saved";
export function notifySetupSaved(section: string) {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: section }));
}
export function completesSetupStep(step: SetupTourStep, section: unknown) {
  return section === (step.href.startsWith("/dashboard/settings") ? "settings" : step.id);
}
export function setupTarget(step: SetupTourStep) {
  if (step.id === "delivery-zones") return '[data-tour="/api/r/zones-create"]';
  if (step.id === "inventory") return '[data-tour="/api/r/items-create"]';
  if (step.id === "printers") return '[data-tour="printer-create"]';
  if (inlineSetupSteps.has(step.id)) return `[data-tour="${setupFields[step.id][0].target}"]`;
  if (step.id === "hours") return '[data-tour="hours-toggle"]';
  if (step.id === "business") return '[data-tour="business-info"]';
  if (step.id === "categories") return '[data-tour="category-create"]';
  if (step.id === "products") return '[data-tour="product-create"]';
  const fragment = step.href.split("#")[1];
  return fragment ? `#${fragment}` : 'main h1';
}

/** The basics appear for every restaurant; optional operational steps follow resolved plan entitlements. */
export function buildSetupTourSteps(features: FeatureMap): SetupTourStep[] {
  const steps: SetupTourStep[] = [
    {
      id: "business",
      title: "اطلاعات و هویت فروشگاه",
      description: "نام، شماره تماس، نشانی، لوگو و رنگ برند را بررسی کنید تا مشتری‌ها فروشگاه را به‌درستی بشناسند.",
      href: "/dashboard/settings",
      action: "تکمیل اطلاعات فروشگاه",
      icon: "building",
    },
    {
      id: "categories",
      title: "ساخت دسته‌بندی منو",
      description: "دسته‌ها مثل نوشیدنی، غذای اصلی یا دسر، منوی مشتری را مرتب و پیدا کردن کالاها را ساده می‌کنند.",
      href: "/dashboard/categories",
      action: "تعریف دسته‌بندی‌ها",
      icon: "layers",
    },
    {
      id: "products",
      title: "افزودن محصولات و قیمت‌ها",
      description: "محصولات قابل سفارش را همراه قیمت، توضیح و تصویر ثبت کنید تا منوی آنلاین آمادهٔ نمایش شود.",
      href: "/dashboard/products",
      action: "افزودن محصولات",
      icon: "utensils",
    },
  ];

  if (enabled(features, "operating_hours")) {
    steps.push({
      id: "hours",
      title: "تنظیم ساعت کاری",
      description: "روزها و بازه‌های فعالیت را ثبت کنید تا اطلاعات نمایش‌داده‌شده به مشتری با برنامهٔ فروشگاه هماهنگ باشد.",
      href: "/dashboard/settings#operating-hours",
      action: "تنظیم ساعت کاری",
      icon: "clock",
    });
  }

  if (enabled(features, "self_order") || enabled(features, "cashier_pos")) {
    steps.push({
      id: "tables",
      title: "آماده‌سازی سفارش‌گیری و میزها",
      description: "اگر سفارش حضوری دارید، میزها و QR آن‌ها را تعریف کنید؛ روش‌های دریافت سفارش را از پنل مربوط مدیریت کنید.",
      href: "/dashboard/tables",
      action: "تعریف میز و QR",
      icon: "table",
    });
  }

  if (enabled(features, "delivery_order") || enabled(features, "zones")) {
    if (enabled(features, "delivery_order")) {
      steps.push({
        id: "online-orders",
        title: "فعال‌سازی سفارش آنلاین",
        description: "در تنظیمات سفارش‌گیری مشخص کنید مشتری بتواند از منوی آنلاین سفارش ثبت کند.",
        href: "/dashboard/settings#order-settings",
        action: "تنظیم سفارش آنلاین",
        icon: "cart",
      });
    }
  }

  if (enabled(features, "zones")) {
    steps.push({
      id: "delivery-zones",
      title: "تعریف محدوده‌های ارسال",
      description: "محدوده‌ها و هزینهٔ ارسال را متناسب با روش تحویل فروشگاه مشخص کنید.",
      href: "/dashboard/zones",
      action: "تنظیم محدوده‌های ارسال",
      icon: "truck",
    });
  }

  if (enabled(features, "card_transfer")) {
    steps.push({
      id: "card-transfer",
      title: "تنظیم کارت‌به‌کارت",
      description: "اگر می‌خواهید مشتری مبلغ را کارت‌به‌کارت کند، اطلاعات کارت و دستور پرداخت را ثبت کنید.",
      href: "/dashboard/settings#card-transfer",
      action: "تنظیم کارت‌به‌کارت",
      icon: "bank",
    });
  }

  if (enabled(features, "ipg")) {
    steps.push({
      id: "online-payment",
      title: "اتصال درگاه آنلاین",
      description: "اطلاعات درگاه بانکی مورد تأیید خود را وارد کنید؛ برای فعال‌سازی به شناسهٔ معتبر پذیرنده نیاز دارید.",
      href: "/dashboard/payments",
      action: "تنظیم درگاه پرداخت",
      icon: "bank",
    });
  }

  if (enabled(features, "reservations")) {
    steps.push({
      id: "reservations",
      title: "تنظیم رزرو میز",
      description: "ظرفیت و دریافت پیش‌پرداخت را مطابق سیاست رستوران تنظیم کنید تا رزرو آنلاین آماده شود.",
      href: "/dashboard/settings#reservations",
      action: "تنظیم رزرو میز",
      icon: "calendar",
    });
  }

  if (enabled(features, "inventory")) {
    steps.push({
      id: "inventory",
      title: "ثبت اقلام انبار",
      description: "مواد اولیه و موجودی آغازین را ثبت کنید تا گردش و کنترل موجودی در پنل رستوران قابل استفاده باشد.",
      href: "/dashboard/inventory",
      action: "رفتن به انبارداری",
      icon: "box",
    });
  }

  if (enabled(features, "cloud_printer")) {
    steps.push({
      id: "printers",
      title: "اتصال چاپگرها",
      description: "چاپگرهای آشپزخانه یا کافی‌بار را تعریف و دسته‌بندی کنید تا برگه‌های هر بخش به مقصد درست برسند.",
      href: "/dashboard/printers",
      action: "مدیریت چاپگرها",
      icon: "print",
    });
  }

  return steps;
}

/** Explicit field order: skipping a field never skips the whole product. */
export const setupFields: Record<string, { target: string; title: string; save?: boolean; optional?: boolean; finish?: boolean }[]> = {
  categories: [
    { target: "category-name", title: "نام دسته‌بندی را وارد کنید" },
    { target: "category-save", title: "برای ثبت دسته، دکمهٔ ذخیرهٔ فرم را بزنید", save: true },
  ],
  products: [
    { target: "product-name", title: "نام محصول را وارد کنید" },
    { target: "product-category", title: "دسته‌بندی محصول را انتخاب کنید" },
    { target: "product-prep", title: "زمان آماده‌سازی را وارد کنید" },
    { target: "product-mode", title: "نوع فروش را انتخاب کنید" },
    { target: "product-price", title: "قیمت محصول به تومان را وارد کنید" },
    { target: "product-description", title: "توضیحات محصول را وارد کنید" },
    { target: "product-image", title: "در صورت نیاز تصویر محصول را بارگذاری کنید" },
    { target: "product-save", title: "برای ثبت محصول دکمهٔ افزودن محصول را بزنید", save: true },
  ],
};

/** Never wait for a save event when the real page has no changes to save. */
export function settingsTourAction(ready: boolean, dirty: boolean, saving: boolean) {
  if (!ready || saving) return "wait";
  return dirty ? "save" : "continue";
}

export const inlineSetupSteps = new Set(["card-transfer", "online-payment", "reservations"]);
Object.assign(setupFields, {
  "delivery-zones": [
    ...[["name", "نام محدوده"], ["fee", "هزینه ارسال"], ["minOrder", "حداقل سفارش"], ["etaMinutes", "زمان تحویل"], ["radiusKm", "شعاع محدوده"], ["areas", "محله‌ها و مناطق"], ["isActive", "فعال بودن محدوده"]].map(([key,title]) => ({ target: `/api/r/zones-${key}`, title })),
    { target: "/api/r/zones-save", title: "محدوده را با دکمه ذخیره ثبت کنید", save: true },
  ],
  inventory: [
    ...[["name", "نام ماده یا کالا"], ["unit", "واحد کالا"], ["warehouseId", "انتخاب انبار"], ["minStock", "حداقل موجودی هشدار"]].map(([key,title]) => ({ target: `/api/r/items-${key}`, title })),
    { target: "/api/r/items-save", title: "تعریف کالا را ذخیره کنید", save: true },
  ],
  "card-transfer": [
    { target: "card-enabled", title: "دریافت کارت‌به‌کارت را تنظیم کنید" },
    { target: "card-number", title: "شماره کارت مقصد" },
    { target: "card-holder", title: "نام صاحب کارت" },
    { target: "card-bank", title: "نام بانک" },
    { target: "card-note", title: "راهنمای پرداخت برای مشتری" },
    { target: "card-note", title: "تنظیمات را ذخیره یا بدون تغییر تأیید کنید", save: true },
  ],
  "online-payment": [
    { target: "ipg-provider", title: "ارائه‌دهنده درگاه" },
    { target: "ipg-merchant", title: "شناسه پذیرنده معتبر خود را وارد کنید" },
    { target: "ipg-sandbox", title: "حالت آزمایشی یا عملیاتی درگاه" },
    { target: "ipg-save", title: "تنظیمات درگاه را ذخیره کنید", save: true },
  ],
  reservations: [
    { target: "reservation-enabled", title: "پذیرش رزرو آنلاین" },
    { target: "reservation-deposit", title: "دریافت پیش‌پرداخت رزرو" },
    { target: "reservation-amount", title: "مبلغ پیش‌پرداخت هر نفر", optional: true },
    { target: "reservation-duration", title: "مدت هر رزرو" },
    { target: "reservation-duration", title: "تنظیمات رزرو را ذخیره یا تأیید کنید", save: true },
  ],
  printers: [
    { target: "printer-name", title: "نام چاپگر را وارد کنید" },
    { target: "printer-save", title: "چاپگر را اضافه کنید", save: true },
    { target: "printer-categories", title: "دسته‌های قابل چاپ را انتخاب کنید؛ انتخاب‌ها خودکار ذخیره می‌شوند" },
    { target: "bridge-transport", title: "روش اتصال چاپگر" },
    { target: "bridge-host", title: "IP چاپگر در شبکه", optional: true },
    { target: "bridge-port", title: "پورت شبکه چاپگر", optional: true },
    { target: "bridge-path", title: "پورت سریال چاپگر", optional: true },
    { target: "bridge-baud", title: "سرعت اتصال سریال", optional: true },
    { target: "bridge-printerName", title: "نام صف چاپ ویندوز", optional: true },
    { target: "bridge-encoding", title: "کدگذاری چاپ فارسی", optional: true },
    { target: "bridge-download", title: "فایل تنظیمات را برای عامل محلی دریافت کنید؛ نصب و اتصال دستگاه در خود عامل انجام می‌شود", finish: true },
  ],
});
