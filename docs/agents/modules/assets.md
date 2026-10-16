# دارایی‌ها

> مشخصات بازسازی ماژول `assets` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/assets`
- کامپوننت/منبع فعلی: `src/modules/finance.tsx — Assets`
- entitlement تعرفه: `assets`
- هدف: ثبت دارایی ثابت برای کنترل و محاسبه استهلاک.

## رابط و جریان کار

ResourcePage دارایی‌ها: نام/دسته/بهای خرید/تاریخ خرید/عمر مفید/ارزش باقیمانده/وضعیت؛ محاسبه یا نمایش استهلاک؛ CRUD.

## داده و API

ResourcePage endpoint /api/r/assets؛ سند استهلاک از /api/acc/depreciation.

## قواعدی که بازنویسی باید حفظ کند

عمر مفید >0؛ تاریخ شمسی؛ استهلاک خودکار ماهانه idempotent و ثبت سند حسابداری داشته باشد.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

CRUD `/api/r/assets`. هر asset: name, category, purchaseDate, cost, salvage, lifeMonths, note. purchaseDate اجباری و جلالی؛ cost لازم؛ salvage default صفر؛ lifeMonths default ۶۰ و حداقل یک ماه. ستون‌ها name/category, date, cost, salvage, useful life, note به همراه چهار KPI: original cost total، accumulated depreciation، book value و monthly depreciation.

محاسبه فعلی client-side با straight line: `base=max(0,cost-salvage)`، monthly=`base/max(1,lifeMonths)`، elapsed months از اختلاف تاریخ تقسیم بر 30.44 روز، accumulated تا سقف base clamp، book=`cost-accumulated`. auto depreciation journal action در دوطرفه accounting module (`/api/acc/depreciation`) ثبت می‌شود و این صفحه تنها نمایش/CRUD دارایی است.

**پذیرش:** asset جدید، عمر یک ماه، salvage بیشتر از cost، تاریخ آینده، zero life invalid، محاسبه سقف استهلاک و هم‌خوانی گزارش با سند استهلاک سرور. محاسبه کلاینت را سند مالی قطعی تلقی نکن.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
