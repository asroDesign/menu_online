export const MENU_TEMPLATE_OPTIONS = [
  { id: "classic", title: "کلاسیک", subtitle: "فهرست تصویری و آشنا" },
  { id: "editorial", title: "مجله‌ای", subtitle: "تصویرهای بزرگ و چیدمان داستانی" },
  { id: "compact", title: "فشرده", subtitle: "نمایش تعداد بیشتری از کالاها" },
  { id: "bistro", title: "بیسترو", subtitle: "کارت‌های تصویری با حس کافه‌ای" },
  { id: "minimal", title: "مینیمال", subtitle: "فهرست خلوت با تمرکز روی قیمت" },
  { id: "softmenu-test3", title: "باغ‌کافه", subtitle: "دسته‌های افقی و منوی تصویری" },
  { id: "softmenu-test", title: "کاشی دسته‌ها", subtitle: "صفحهٔ شروع با دسته‌های بزرگ" },
  { id: "captainm", title: "کاپیتان ام", subtitle: "هویت کیهانی با دسته‌های پیمایش‌پذیر و کارت‌های تیره" },
  { id: "haftkhan", title: "هفت‌خوان", subtitle: "دسته‌های آیکنی و شبکهٔ غذاها" },
] as const;

export type MenuTemplateId = (typeof MENU_TEMPLATE_OPTIONS)[number]["id"];

const menuTemplateIds = new Set<string>(MENU_TEMPLATE_OPTIONS.map((template) => template.id));

export function isMenuTemplate(value: unknown): value is MenuTemplateId {
  return typeof value === "string" && menuTemplateIds.has(value);
}
