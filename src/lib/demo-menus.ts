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
    ],
  },
  {
    id: "haftkhan", label: "هفت‌خان", businessName: "هفت‌خان", businessType: "رستوران ایرانی",
    description: "منوی رسمی و خوانا برای غذاهای ایرانی، کباب‌ها و پذیرایی سنتی.",
    address: "شیراز · بلوار قرآن", hours: "هر روز ۱۲ تا ۲۳:۳۰", theme: "haftkhan",
    hasLoyalty: true, hasSearch: true,
    categories: ["همه", "غذای سنتی", "کافه", "خوراک سنتی", "چلو خورشت", "پیش غذا", "ترشی و زیتون", "دسر", "نوشیدنی", "نوشیدنی گرم"],
    products: [
      { id: 61, category: "غذای سنتی", name: "کلم‌پلو با گوشت قرمه", description: "گوشت کنجه، سبزی کلم‌پلو، پیازداغ و برنج", price: 1_730_000, mark: "food" },
      { id: 62, category: "غذای سنتی", name: "دیزی مخصوص هفت‌خوان", description: "گوشت گوسفندی، نخود، لوبیا و سیب‌زمینی", price: 1_430_000, mark: "food" },
      { id: 63, category: "کافه", name: "کافه لاته", description: "اسپرسو با شیر فوم‌دار", price: 160_000, mark: "coffee" },
      { id: 64, category: "خوراک سنتی", name: "خوراک کباب تابه‌ای", description: "گوشت گوسفندی با سیب‌زمینی و گوجه", price: 895_000, mark: "food" },
      { id: 65, category: "چلو خورشت", name: "چلو خورشت قورمه‌سبزی", description: "خورشت جاافتاده با برنج ایرانی", price: 735_000, mark: "food" },
      { id: 66, category: "پیش غذا", name: "کشک بادمجان مخصوص", description: "بادمجان کبابی، کشک و نعناع داغ", price: 320_000, mark: "food" },
      { id: 67, category: "ترشی و زیتون", name: "زیتون پرورده", description: "زیتون، گردو و سبزی معطر", price: 190_000, mark: "salad" },
      { id: 68, category: "دسر", name: "فالوده‌ی شیرازی", description: "فالوده‌ی دست‌ساز با آب‌لیمو", price: 125_000, mark: "dessert" },
      { id: 69, category: "نوشیدنی", name: "دوغ سبزیجات هفت‌خوان", description: "دوغ خنک با سبزی معطر", price: 180_000, mark: "drink" },
      { id: 70, category: "نوشیدنی گرم", name: "قوری چای هفت‌خوان", description: "چای دم‌کشیده برای دو نفر", price: 260_000, mark: "coffee" },
    ],
  },
];
