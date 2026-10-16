# فرمول ساخت

> مشخصات بازسازی ماژول `recipes` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/recipes`
- کامپوننت/منبع فعلی: `src/modules/inventory.tsx — Recipes`
- entitlement تعرفه: `recipes`
- هدف: تعریف میزان مواد اولیه مصرف‌شده برای هر محصول فروشی.

## رابط و جریان کار

انتخاب محصول از ستون scrollable؛ فهرست مواد فرمول با واحد و هزینه؛ افزودن ماده/مقدار لازم برای یک محصول؛ حذف ردیف؛ جمع بهای مواد و قیمت فروش.

## داده و API

GET /api/products؛ GET /api/r/items؛ CRUD /api/r/recipes.

## قواعدی که بازنویسی باید حفظ کند

مقدار >0 و item تکراری در یک recipe نشود؛ هر فروش فقط متناسب با quantity سفارش مواد را مصرف کند؛ اگر ماده موجود نیست رفتار shortage از سرور مشخص شود.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Recipe relation شامل `productId,itemId,quantity` به ازای یک واحد محصول. صفحه به هر سه مجموعه products, inventory items, recipes نیاز دارد؛ loading تا کامل‌شدن هر سه. اگر product یا item نداریم empty state می‌گوید هر دو را اول بساز. ستون product scroll تا ۶۰۰px، badge تعداد مواد؛ انتخاب یک محصول، سمت راست price و مجموع ingredient cost نشان می‌دهد. هر line ماده/مقدار+unit/cost تخمینی و remove؛ form فقط مواد مصرف‌نشده برای آن محصول را selectable می‌کند و مقدار >0 اجباری.

API registry recipe write role `warehouse`, feature recipes؛ read role/feature می‌تواند costing هم باشد؛ validate ownership هر دو entity و quantity بین 0.0001 تا 100000. در هر order sale سرویس انبار باید به quantity فروش ضرب کند و `sale` movement بسازد؛ این صفحه فقط formula را مدیریت می‌کند.

**پذیرش:** product بدون formula، حذف recipe line، item یک‌بار در recipe، هزینه ناشی از unit cost تغییر، و مصرف موجودی هنگام sale. اگر کمبود موجودی رخ داد، تصمیم را مطابق منطق backend حفظ کن.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
