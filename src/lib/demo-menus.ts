export type DemoMenuTheme = "narvan" | "softmenu" | "softmenuPlus" | "captain" | "haftkhan";

export type DemoMenuProduct = {
  id: number;
  category: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  options?: { label: string; price: number }[];
  available?: boolean;
  mark: "coffee" | "food" | "dessert" | "cold" | "pizza" | "fish" | "salad" | "breakfast" | "burger" | "drink";
};

export type DemoMenu = {
  id: string;
  label: string;
  businessName: string;
  businessType: string;
  description: string;
  address: string;
  hours: string;
  theme: DemoMenuTheme;
  hasLanguages?: boolean;
  hasLoyalty?: boolean;
  hasArticles?: boolean;
  hasSearch?: boolean;
  categories: string[];
  products: DemoMenuProduct[];
};

/** Public, synthetic menu content used only by /preview. Never submit orders or save customer information. */
export const DEMO_MENUS: DemoMenu[] = [
  {
    id: "narvan", label: "کافه نارون", businessName: "کافه نارون", businessType: "کافه مدرن",
    description: "قهوه‌ی تازه، صبحانه‌ی آرام و دسرهای روز؛ یک منوی جمع‌وجور و تصویری برای کافه.",
    address: "تهران · خیابان ولیعصر", hours: "هر روز ۸ تا ۲۳", theme: "narvan",
    categories: ["همه", "قهوه", "صبحانه", "دسر"],
    products: [
      { id: 1, category: "قهوه", name: "لاته وانیلی", description: "اسپرسوی دوبل، شیر گرم و وانیل طبیعی", price: 148_000, mark: "coffee" },
      { id: 2, category: "قهوه", name: "آیس آمریکانو", description: "اسپرسو، آب خنک و یخ تازه", price: 112_000, mark: "cold" },
      { id: 3, category: "صبحانه", name: "تست آووکادو", description: "نان خمیرترش، آووکادو و تخم‌مرغ", price: 238_000, mark: "breakfast" },
      { id: 4, category: "صبحانه", name: "پنکیک عسل", description: "پنکیک روز با میوه فصل و عسل", price: 195_000, mark: "breakfast" },
      { id: 5, category: "دسر", name: "چیزکیک زعفرانی", description: "چیزکیک خانگی با زعفران ایرانی", price: 165_000, mark: "dessert" },
      { id: 6, category: "دسر", name: "کوکی شکلاتی", description: "کوکی تازه با شکلات تلخ", price: 78_000, mark: "dessert" },
    ],
  },
  {
    id: "softmenu-test3", label: "سافت‌منو · نمونه ۳", businessName: "باغ‌کافه آبان", businessType: "کافه‌رستوران",
    description: "چیدمان چنددسته‌ای با معرفی مجموعه، ساعت کاری، زبان منو و دسترسی سریع به دسته‌ها.",
    address: "تهران · محدوده‌ی باغ فردوس", hours: "هر روز ۱۰ تا ۲۳", theme: "softmenuPlus",
    hasLanguages: true, hasLoyalty: true,
    categories: ["همه", "پیتزا", "پیش‌غذا", "دریایی", "صبحانه", "ماکتیل", "سالاد", "اسموتی", "بارگرم"],
    products: [
      { id: 11, category: "پیتزا", name: "پیتزا سبزیجات", description: "خمیر دست‌ساز، سبزیجات تازه و پنیر موزارلا", price: 82_800, originalPrice: 92_000, mark: "pizza" },
      { id: 12, category: "پیتزا", name: "پیتزا مخصوص", description: "سس سالسا، پنیر میکس، قارچ، گوشت و فیله مرغ", price: 108_000, originalPrice: 120_000, options: [{ label: "یک نفره", price: 76_500 }, { label: "دو نفره", price: 108_000 }], mark: "pizza" },
      { id: 13, category: "پیش‌غذا", name: "فرنچ فرایز", description: "سیب‌زمینی سرخ‌شده با سس مخصوص", price: 20_000, mark: "food" },
      { id: 14, category: "پیش‌غذا", name: "سالاد سزار", description: "کاهو، مرغ گریل، کروتان، پارمسان و سس سزار", price: 30_400, originalPrice: 35_000, mark: "salad" },
      { id: 15, category: "دریایی", name: "خرچنگ", description: "خرچنگ با چاشنی لیمو", price: 150_000, mark: "fish" },
      { id: 16, category: "دریایی", name: "میگو", description: "میگوی تازه با چاشنی ویژه", price: 104_000, originalPrice: 130_000, mark: "fish" },
      { id: 17, category: "صبحانه", name: "نیمرو بیکن", description: "بیکن گوساله با تخم‌مرغ محلی", price: 55_000, mark: "breakfast" },
      { id: 18, category: "صبحانه", name: "پک انگلیسی", description: "یک وعده‌ی کامل صبحانه با مواد تازه", price: 50_000, mark: "breakfast" },
      { id: 19, category: "ماکتیل", name: "رد لیدی", description: "ترکیب میوه‌ای خنک با لیموی تازه", price: 45_000, mark: "drink" },
      { id: 20, category: "ماکتیل", name: "مانگو لیموناد", description: "انبه، لیمو و یخ تازه", price: 38_000, originalPrice: 40_000, mark: "drink" },
      { id: 29, category: "سالاد", name: "سالاد کرن‌بری", description: "کاهو، موزارلا، کرن‌بری و نان پیتای برشته", price: 92_000, mark: "salad" },
      { id: 30, category: "اسموتی", name: "موز آناناس", description: "موز و آناناس تازه با یخ", price: 38_000, mark: "cold" },
      { id: 31, category: "اسموتی", name: "شیر موز", description: "موز رسیده و شیر خنک", price: 35_000, mark: "cold" },
      { id: 32, category: "بارگرم", name: "اسپرسو", description: "قهوه‌ی تازه‌برشت با کرمای غلیظ", price: 20_000, mark: "coffee" },
      { id: 33, category: "بارگرم", name: "آفوگاتو", description: "اسپرسو و بستنی وانیلی", price: 20_000, mark: "coffee" },
      { id: 110, category: "پیتزا", name: "پیتزا پپرونی", description: "خمیر تنوری، سس مارینارا، پپرونی، هالوپینو و موزارلا", price: 150_000, originalPrice: 165_000, mark: "pizza" },
      { id: 111, category: "پیتزا", name: "پیتزا یونانی", description: "پنیر میکس، قارچ، گوشت چرخ‌کرده و فلفل رنگی", price: 288_000, originalPrice: 320_000, mark: "pizza" },
      { id: 112, category: "پیش‌غذا", name: "سیب‌زمینی مخصوص", description: "سیب‌زمینی سرخ‌شده با سس و ادویهٔ ویژه", price: 190_000, mark: "food" },
      { id: 113, category: "پیش‌غذا", name: "قارچ سوخاری", description: "قارچ ترد با سس دست‌ساز", price: 102_000, originalPrice: 120_000, mark: "food" },
      { id: 114, category: "دریایی", name: "فیله ماهی گریل", description: "فیلهٔ تازه، سبزیجات فصل و لیموی تازه", price: 225_000, mark: "fish" },
      { id: 115, category: "دریایی", name: "ماهی سوخاری", description: "فیلهٔ ماهی ترد همراه سس لیمویی", price: 208_000, mark: "fish" },
      { id: 116, category: "صبحانه", name: "پک ایرانی", description: "پنیر، گردو، سبزی، نیمرو و نان تازه", price: 37_000, originalPrice: 42_000, mark: "breakfast" },
      { id: 117, category: "صبحانه", name: "املت سبزیجات", description: "تخم‌مرغ محلی با گوجه، قارچ و سبزی معطر", price: 62_000, mark: "breakfast" },
      { id: 118, category: "ماکتیل", name: "مکزیکن موهیتو", description: "لیمو، نعناع، سودا و چاشنی تند ملایم", price: 30_000, mark: "drink" },
      { id: 119, category: "ماکتیل", name: "رد موهیتو", description: "توت‌فرنگی، نعناع تازه، لیمو و سودا", price: 45_000, mark: "drink" },
      { id: 120, category: "سالاد", name: "سالاد سزار گریل", description: "کاهو پیچ، مرغ گریل، کروتان، پارمسان و سس سزار", price: 80_000, mark: "salad" },
      { id: 121, category: "سالاد", name: "سالاد مخصوص", description: "کاهو، گوجه، خیار، پنیر و سینهٔ مرغ گریل", price: 99_000, mark: "salad" },
      { id: 122, category: "اسموتی", name: "سیب و موز", description: "سیب تازه و موز رسیده با یخ خنک", price: 35_000, mark: "cold" },
      { id: 123, category: "اسموتی", name: "پرتقال شاتوت", description: "پرتقال تازه و شاتوت خنک", price: 40_000, mark: "cold" },
      { id: 124, category: "بارگرم", name: "آمریکانو", description: "اسپرسو و آب داغ با عطر دانهٔ تازه‌برشت", price: 24_000, mark: "coffee" },
      { id: 125, category: "بارگرم", name: "کورتادو", description: "اسپرسو با مقدار کمی شیر گرم", price: 32_000, mark: "coffee" },
      { id: 126, category: "پیتزا", name: "پیتزا وی ای پی", description: "پیتزای ویژه با ترکیب انتخابی آشپزخانه", price: 370_000, available: false, mark: "pizza" },
    ],
  },
  {
    id: "softmenu-test", label: "سافت‌منو · دمو", businessName: "رستوران نمونه", businessType: "منوی چندزبانه",
    description: "منوی آنلاین با دسته‌های متنوع، معرفی کسب‌وکار و دسترسی نمایشی به محتوای وبلاگ.",
    address: "تهران · آدرس نمونه", hours: "هر روز ۱۰ تا ۲۳", theme: "softmenu",
    hasLanguages: true, hasLoyalty: true, hasArticles: true, hasSearch: true,
    categories: ["همه", "پیتزا", "کافی", "پیش‌غذا", "دریایی", "صبحانه", "ماکتیل", "سالاد", "اسموتی", "بارگرم"],
    products: [
      { id: 21, category: "پیتزا", name: "پیتزا مخصوص", description: "ترکیب گوشت، قارچ، فلفل دلمه و پنیر", price: 345_000, originalPrice: 380_000, mark: "pizza" },
      { id: 22, category: "کافی", name: "اسپرسو دوبل", description: "دانه‌ی تازه‌برشت با کرمای غلیظ", price: 98_000, mark: "coffee" },
      { id: 23, category: "پیش‌غذا", name: "سوپ روز", description: "سوپ گرم با سبزیجات فصل", price: 115_000, mark: "food" },
      { id: 24, category: "دریایی", name: "فیله ماهی گریل", description: "ماهی تازه، سبزیجات و لیموی تازه", price: 485_000, mark: "fish" },
      { id: 25, category: "صبحانه", name: "صبحانه‌ی ایرانی", description: "پنیر، گردو، سبزی و نان تنوری", price: 225_000, mark: "breakfast" },
      { id: 26, category: "ماکتیل", name: "رد موهیتو", description: "توت‌فرنگی، نعناع، لیمو و سودا", price: 162_000, mark: "drink" },
      { id: 27, category: "سالاد", name: "سالاد فصل", description: "سبزیجات تازه با سس لیمو", price: 168_000, mark: "salad" },
      { id: 28, category: "اسموتی", name: "اسموتی انبه", description: "انبه‌ی رسیده و ماست خنک", price: 172_000, mark: "cold" },
      { id: 34, category: "بارگرم", name: "اسپرسو", description: "قهوه‌ی تازه‌برشت با کرمای غلیظ", price: 95_000, mark: "coffee" },
      { id: 71, category: "پیتزا", name: "پیتزا سبزیجات تنوری", description: "قارچ، فلفل دلمه، زیتون و پنیر موزارلا روی خمیر دست‌ساز", price: 298_000, options: [{ label: "یک نفره", price: 298_000 }, { label: "دو نفره", price: 438_000 }], mark: "pizza" },
      { id: 72, category: "کافی", name: "کاپوچینو", description: "اسپرسو، شیر بخاردیده و فوم نرم", price: 128_000, mark: "coffee" },
      { id: 73, category: "پیش‌غذا", name: "نان سیر و پنیر", description: "نان تنوری با کره سیر و پنیر کش‌دار", price: 148_000, mark: "food" },
      { id: 74, category: "دریایی", name: "میگو سوخاری", description: "میگوی ترد با سس لیمو و سبزی تازه", price: 385_000, mark: "fish" },
      { id: 75, category: "صبحانه", name: "املت گوجه و پنیر", description: "تخم‌مرغ محلی، گوجه تازه و پنیر صبحانه", price: 185_000, mark: "breakfast" },
      { id: 76, category: "ماکتیل", name: "لیموناد آبان", description: "لیموترش، نعناع و شربت خانگی", price: 145_000, mark: "drink" },
      { id: 77, category: "سالاد", name: "سالاد باغ", description: "کاهوی تازه، گوجه گیلاسی، خیار و سس سبزی", price: 220_000, mark: "salad" },
      { id: 78, category: "اسموتی", name: "اسموتی توت‌فرنگی", description: "توت‌فرنگی، موز و ماست خنک", price: 185_000, mark: "cold" },
      { id: 79, category: "بارگرم", name: "چای ماسالا", description: "چای سیاه، شیر و ادویه‌های معطر", price: 138_000, mark: "coffee" },
      { id: 80, category: "دریایی", name: "پاستا میگو", description: "پاستا، میگوی گریل، سیر و سس خامه‌ای", price: 425_000, mark: "fish" },
    ],
  },
  {
    id: "captainm", label: "کاپیتان ام", businessName: "کافه رستوران کاپیتان ام", businessType: "کافه و فست‌فود",
    description: "حال‌وهوای دریایی با منوی سریع و دسته‌بندی روشن برای سفارش روی موبایل.",
    address: "تهران · میدان ونک", hours: "هر روز ۹ تا ۰۰:۳۰", theme: "captain",
    hasLoyalty: true,
    categories: ["همه", "پیش غذا", "برگر", "پیتزا", "برگر مرغ", "پاستا", "بیبی برگر", "استیک", "پنینی", "پک اقتصادی", "نوشیدنی های گرم", "نوشیدنی های سرد", "اسموتی", "ماکتیل", "چای و دمنوش", "شیک", "کیک و دسر", "صبحانه", "بیشتر", "قلیان", "تاپینگ غذا", "سس"],
    products: [
      { id: 31, category: "پیش غذا", name: "سالاد سزار", description: "کاهو، مرغ گریل و پنیر پارمسان", price: 300_000, mark: "salad" },
      { id: 32, category: "برگر", name: "برگر کاپیتان", description: "گوشت گریل، پنیر چدار و سس اختصاصی", price: 750_000, mark: "burger" },
      { id: 33, category: "برگر", name: "چیزبرگر دوبل", description: "دو لایه گوشت، پنیر و نان بریوش", price: 693_000, options: [{ label: "تک", price: 565_000 }, { label: "دبل", price: 693_000 }, { label: "تریپل", price: 820_000 }], mark: "burger" },
      { id: 34, category: "پیتزا", name: "پیتزا مخصوص کاپیتان", description: "رست‌بیف، پنیر پیتزا، فیله استیک، قارچ و زیتون", price: 950_000, options: [{ label: "یک نفره", price: 690_000 }, { label: "دو نفره", price: 950_000 }], mark: "pizza" },
      { id: 35, category: "برگر مرغ", name: "چیکن برگر", description: "مرغ گریل با پنیر موزارلا و دورچین", price: 535_000, mark: "burger" },
      { id: 36, category: "پاستا", name: "پاستا آلفردو", description: "پنه، سس آلفردو، مرغ و پارمسان", price: 465_000, mark: "food" },
      { id: 37, category: "بیبی برگر", name: "بیبی برگر", description: "برگر کوچک با پنیر گودا و دورچین", price: 270_000, mark: "burger" },
      { id: 38, category: "استیک", name: "استیک گوشت", description: "فیله گوساله، سبزیجات و پوره سیب‌زمینی", price: 750_000, mark: "food" },
      { id: 39, category: "پنینی", name: "پنینی رست‌بیف", description: "رست‌بیف مزه‌دار، پنیر میکس و سیب‌زمینی", price: 320_000, mark: "food" },
      { id: 40, category: "پک اقتصادی", name: "پک خانواده", description: "ترکیب برگر، سالاد، سیب‌زمینی و پاستا", price: 1_570_000, mark: "food" },
      { id: 41, category: "نوشیدنی های گرم", name: "اسپرسو", description: "قهوه‌ی تازه‌برشت با کرمای غلیظ", price: 130_000, mark: "coffee" },
      { id: 42, category: "نوشیدنی های سرد", name: "آیس آمریکانو", description: "اسپرسو، آب خنک و یخ تازه", price: 130_000, mark: "cold" },
      { id: 43, category: "اسموتی", name: "تروپیکال", description: "میوه‌های گرمسیری و یخ تازه", price: 260_000, mark: "cold" },
      { id: 44, category: "ماکتیل", name: "رد موهیتو", description: "توت‌فرنگی، نعناع، لیمو و سودا", price: 185_000, mark: "drink" },
      { id: 45, category: "چای و دمنوش", name: "چای سبز و نعنا", description: "چای سبز دم‌شده با نعناع", price: 145_000, mark: "drink" },
      { id: 46, category: "شیک", name: "شیک نوتلا", description: "شیر، بستنی و شکلات فندقی", price: 275_000, mark: "cold" },
      { id: 47, category: "کیک و دسر", name: "چیزکیک لوتوس", description: "چیزکیک روز با بیسکوییت لوتوس", price: 180_000, mark: "dessert" },
      { id: 48, category: "صبحانه", name: "صبحانه ایرانی", description: "پنیر، گردو، سبزی، تخم‌مرغ و نان تازه", price: 474_000, mark: "breakfast" },
      { id: 49, category: "بیشتر", name: "سرویس ویژه", description: "پذیرایی گروهی با میوه و تنقلات", price: 300_000, mark: "food" },
      { id: 50, category: "قلیان", name: "دوسیب", description: "طعم میوه‌ای برای سرو در مجموعه", price: 300_000, mark: "drink" },
      { id: 51, category: "تاپینگ غذا", name: "برگر اضافه", description: "یک لایه برگر اضافه برای سفارش", price: 250_000, mark: "food" },
      { id: 52, category: "سس", name: "سس دیپ", description: "سس دیپ دست‌ساز", price: 110_000, mark: "food" },
      { id: 201, category: "پیش غذا", name: "سالاد سزار مینی", description: "کاهو، گوجه گیلاسی، کروتان، زیتون و مرغ", price: 285_000, mark: "salad" },
      { id: 202, category: "پیش غذا", name: "پیاز سوخاری", description: "حلقه‌های پیاز سوخاری و ترد", price: 320_000, mark: "food" },
      { id: 203, category: "پیش غذا", name: "سیب با سس دیپ و بیکن", description: "سیب‌زمینی ترد، سس دیپ و بیکن", price: 460_000, mark: "food" },
      { id: 204, category: "برگر", name: "بیف اسموکی", description: "برگر گریل، رست‌بیف، پیاز کاراملی، پنیر میکس و ساید", price: 750_000, mark: "burger" },
      { id: 205, category: "برگر", name: "چانو برگر", description: "برگر گریل، فیلهٔ سیر و رزماری، پنیر و ساید", price: 765_000, mark: "burger" },
      { id: 206, category: "برگر", name: "لجندری برگر", description: "برگر، بیکن، پیاز کاراملی، پنیر گودا و سیب‌زمینی", price: 896_000, mark: "burger" },
      { id: 207, category: "برگر", name: "چیز ماشروم برگر", description: "برگر گریل، قارچ، پنیر میکس و ساید", price: 595_000, mark: "burger" },
      { id: 208, category: "پیتزا", name: "پیتزا رست‌بیف", description: "رست‌بیف، پنیر پیتزا، قارچ و زیتون", price: 810_000, mark: "pizza" },
      { id: 209, category: "پیتزا", name: "پیتزا شیکاگو", description: "پنیر پیتزا، قارچ، زیتون و گوشت چرخ‌کرده", price: 690_000, mark: "pizza" },
      { id: 210, category: "پیتزا", name: "پیتزا کالیفرنیا", description: "پنیر پیتزا، قارچ، زیتون و مرغ مزه‌دار", price: 685_000, mark: "pizza" },
      { id: 211, category: "برگر مرغ", name: "چیکن ماشروم برگر", description: "مرغ گریل، قارچ، پنیر میکس و ساید", price: 545_000, mark: "burger" },
      { id: 212, category: "برگر مرغ", name: "بشقاب فیله مرغ", description: "فیلهٔ مرغ، سالاد، سیب‌زمینی و ساید", price: 698_000, mark: "food" },
      { id: 213, category: "پاستا", name: "پاستا پستو", description: "فتوچینی، سس پستو، سینهٔ مرغ و پارمسان", price: 465_000, mark: "food" },
      { id: 214, category: "پاستا", name: "چیکن استراگانوف", description: "مرغ مزه‌دار، سس آلفردو و چیپس خلالی", price: 440_000, mark: "food" },
      { id: 215, category: "پاستا", name: "بیف استراگانوف", description: "گوشت گوسالهٔ ریش‌ریش با سس آلفردو", price: 480_000, mark: "food" },
      { id: 216, category: "استیک", name: "استیک مرغ", description: "مرغ مزه‌دار، سبزیجات، پوره و سیب‌زمینی سرخ‌شده", price: 590_000, mark: "food" },
      { id: 217, category: "پک اقتصادی", name: "پک دو نفره", description: "بیبی برگر گوشت و مرغ، سیب‌زمینی و پاستا", price: 785_000, mark: "food" },
      { id: 218, category: "نوشیدنی های گرم", name: "هات چاکلت", description: "شکلات گرم و شیر بخاردیده", price: 145_000, mark: "coffee" },
      { id: 219, category: "نوشیدنی های گرم", name: "لاته فندق شکلات", description: "اسپرسو، شیر، فندق و شکلات", price: 185_000, mark: "coffee" },
      { id: 220, category: "نوشیدنی های سرد", name: "آیس فندق شکلات", description: "قهوهٔ سرد، فندق، شکلات و یخ", price: 185_000, mark: "cold" },
      { id: 221, category: "چای و دمنوش", name: "دمنوش آرامش", description: "ترکیب گل‌گاوزبان و به‌لیمو", price: 160_000, mark: "drink" },
      { id: 222, category: "شیک", name: "شیک وانیل", description: "شیر، بستنی وانیلی و خامه", price: 245_000, mark: "cold" },
      { id: 223, category: "کیک و دسر", name: "کیک دبل چاکلت", description: "کیک شکلاتی با لایهٔ گاناش", price: 210_000, mark: "dessert" },
      { id: 224, category: "صبحانه", name: "صبحانه مخصوص کاپیتان", description: "تخم‌مرغ، پنیر، گوشت مرینیت، ژامبون و دورچین", price: 245_000, mark: "breakfast" },
      { id: 225, category: "قلیان", name: "شلیل چولک", description: "طعم میوه‌ای برای سرو در مجموعه", price: 300_000, mark: "drink" },
      { id: 226, category: "تاپینگ غذا", name: "رست‌بیف اضافه", description: "یک سهم رست‌بیف برای افزودن به غذا", price: 375_000, mark: "food" },
      { id: 227, category: "سس", name: "سس قارچ", description: "سس قارچ خامه‌ای", price: 140_000, mark: "food" },
    ],
  },
  {
    id: "haftkhan", label: "هفت‌خان", businessName: "هفت‌خان", businessType: "رستوران ایرانی",
    description: "منوی رسمی و خوانا برای غذاهای ایرانی، کباب‌ها و پذیرایی سنتی.",
    address: "شیراز · بلوار قرآن", hours: "هر روز ۱۲ تا ۲۳:۳۰", theme: "haftkhan",
    hasLoyalty: true, hasSearch: true,
    categories: ["همه", "غذای سنتی", "کافه", "خوراک سنتی", "چلو خورشت", "پیش غذا", "ترشی و زیتون", "دسر", "نوشیدنی", "نوشیدنی گرم"],
    products: [
      { id: 61, category: "غذای سنتی", name: "کلم پلوقورمه بدون سالاد", description: "گوشت کنجهٔ گوسفندی، سبزی و کلم‌پلو، پیازداغ، زعفران و برنج ایرانی", price: 1_630_000, mark: "food" },
      { id: 62, category: "غذای سنتی", name: "ته‌چین گوشت و بادمجان", description: "گوشت ریش‌شدهٔ گوسفندی، بادمجان، ماست، تخم‌مرغ، زعفران و برنج", price: 2_350_000, mark: "food" },
      { id: 63, category: "غذای سنتی", name: "ته‌چین مرغ", description: "استیک سینهٔ مرغ، ماست، زعفران، دارچین و برنج", price: 1_280_000, mark: "food" },
      { id: 64, category: "غذای سنتی", name: "کلم پلو با گوشت قرمه", description: "گوشت کنجه، سبزی کلم‌پلو، کلم، پیازداغ، زعفران، برنج و سالاد شیرازی", price: 1_730_000, mark: "food" },
      { id: 65, category: "غذای سنتی", name: "دمپخت با گوشت بره", description: "کلم، عدس، هویج، سبزی دمپخت، برنج و گوشت گوسفندی", price: 2_040_000, mark: "food" },
      { id: 66, category: "غذای سنتی", name: "لاپلویی گوشت قابلمه‌ای ته‌دیگی", description: "گوشت گوسفندی دست و گردن، زعفران، برنج و سیب‌زمینی", price: 2_350_000, mark: "food" },
      { id: 67, category: "غذای سنتی", name: "عدس پلو با گوشت گردن", description: "گوشت گردن گوسفندی، عدس، کشمش، گردو، پیازداغ، زعفران و برنج", price: 2_550_000, mark: "food" },
      { id: 68, category: "غذای سنتی", name: "غم برپلو بدون سالاد", description: "گوشت چرخ‌کرده، مغز گردو، کشمش، رب انار، شیرهٔ انگور و برنج", price: 1_150_000, mark: "food" },
      { id: 69, category: "غذای سنتی", name: "دیزی مخصوص ۷خوان", description: "نخود، لوبیای سفید، گوشت گوسفندی، سیب‌زمینی و گوجه", price: 1_430_000, mark: "food" },
      { id: 70, category: "غذای سنتی", name: "کلم پلو قلقلی بدون سالاد", description: "گوشت قلقلی گوسفندی، سبزی کلم‌پلو، کلم، پیازداغ، زعفران و برنج", price: 1_150_000, mark: "food" },
      { id: 71, category: "غذای سنتی", name: "سینی مجلسی سنتی ۶ نفره", description: "کلم‌پلو، چلو قابلمهٔ ته‌دیگی، باقالی‌پلو، سردست گوسفند و کباب‌های ویژه", price: 16_270_000, mark: "food" },
      { id: 72, category: "غذای سنتی", name: "غم بر پلو ـ قنبرپلو", description: "گوشت چرخ‌کرده، مغز گردو، کشمش، رب انار، شیرهٔ انگور و برنج", price: 1_250_000, mark: "food" },
      { id: 73, category: "غذای سنتی", name: "چلو دمی با گوشت ۳ نفره", description: "برنج و گوشت گوسفندی با فلفل سیاه، هل، دارچین، جوز هندی، میخک و زعفران", price: 4_450_000, mark: "food" },
      { id: 74, category: "غذای سنتی", name: "چلو دمی با مرغ ۳ نفره", description: "برنج و مرغ با فلفل سیاه، هل، دارچین، جوز هندی، میخک و زعفران", price: 2_550_000, mark: "food" },
      { id: 75, category: "غذای سنتی", name: "کلم پلو با کوفته قلقلی", description: "گوشت قلقلی گوسفندی، سبزی کلم‌پلو، کلم، پیازداغ، زعفران، برنج و سالاد شیرازی", price: 1_250_000, mark: "food" },
      { id: 76, category: "غذای سنتی", name: "قیمه نثار", description: "برنج، مغز ران گوسفندی، زعفران، زرشک، خلال پسته و بادام", price: 2_450_000, mark: "food" },
      { id: 77, category: "غذای سنتی", name: "مرصع پلو", description: "مرغ، کشمش، زرشک، خلال پرتقال و بادام، هویج، پسته و برنج زعفرانی", price: 1_680_000, mark: "food" },
      { id: 78, category: "غذای سنتی", name: "کلم پلو بدون گوشت", description: "سبزی کلم‌پلو، کلم، پیازداغ، زعفران و برنج", price: 735_000, mark: "food" },
      { id: 79, category: "غذای سنتی", name: "پلو گوشت بره (مندی)", description: "نصف شقهٔ گوشت بره، برنج، ادویهٔ مندی، کره، زعفران، پیاز و سیر", price: 16_100_000, mark: "food" },
      { id: 80, category: "غذای سنتی", name: "دمپخت مرغ و پیازچه", description: "دمپخت معطر با مرغ و پیازچهٔ تازه", price: 1_150_000, mark: "food" },
      { id: 81, category: "غذای سنتی", name: "چلوگوشت مخصوص هفت‌خوان", description: "چلو ایرانی همراه گوشت گوسفندی مخصوص", price: 2_850_000, mark: "food" },
      { id: 82, category: "خوراک سنتی", name: "خوراک کباب تابه‌ای", description: "گوشت گوسفندی، سیب‌زمینی، گوجه‌فرنگی و رب گوجه", price: 895_000, mark: "food" },
      { id: 83, category: "غذای سنتی", name: "میگو پلو", description: "میگو، برنج، شوید، گشنیز، ادویهٔ معطر و ترشی لیتهٔ بندری", price: 1_800_000, mark: "fish" },
      { id: 84, category: "خوراک سنتی", name: "کته گوجه با کباب تابه‌ای", description: "برنج، گوجه‌فرنگی، سیب‌زمینی و گوشت چرخ‌کردهٔ گوسفندی", price: 1_450_000, mark: "food" },
      { id: 85, category: "کافه", name: "کافه لاته", description: "اسپرسو با شیر فوم‌دار", price: 160_000, mark: "coffee" },
      { id: 86, category: "چلو خورشت", name: "چلو خورشت قورمه‌سبزی", description: "خورشت جاافتاده با برنج ایرانی", price: 735_000, mark: "food" },
      { id: 87, category: "پیش غذا", name: "کشک بادمجان مخصوص", description: "بادمجان کبابی، کشک و نعناع داغ", price: 320_000, mark: "food" },
      { id: 88, category: "ترشی و زیتون", name: "زیتون پرورده", description: "زیتون، گردو و سبزی معطر", price: 190_000, mark: "salad" },
      { id: 89, category: "دسر", name: "فالوده‌ی شیرازی", description: "فالوده‌ی دست‌ساز با آب‌لیمو", price: 125_000, mark: "dessert" },
      { id: 90, category: "نوشیدنی", name: "دوغ سبزیجات هفت‌خوان", description: "دوغ خنک با سبزی معطر", price: 180_000, mark: "drink" },
      { id: 91, category: "نوشیدنی گرم", name: "قوری چای هفت‌خوان", description: "چای دم‌کشیده برای دو نفر", price: 260_000, mark: "coffee" },
      { id: 92, category: "پیش غذا", name: "ماست و خیار هفت‌خوان", description: "ماست چکیده، خیار، کشمش و نعناع خشک", price: 165_000, mark: "salad" },
      { id: 93, category: "نوشیدنی", name: "شربت بهارنارنج", description: "شربت خنک بهارنارنج با عرق بیدمشک", price: 140_000, mark: "drink" },
    ],
  },
];
