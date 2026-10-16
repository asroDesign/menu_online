# حسابداری دوطرفه

> مشخصات بازسازی ماژول `accounting` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/accounting`
- کامپوننت/منبع فعلی: `src/modules/accounting.tsx — Accounting`
- entitlement تعرفه: `accounting`
- هدف: دفتر کل double-entry، سند، کدینگ، گزارش و بستن سال مالی.

## رابط و جریان کار

ناوبری تب/بخش اسناد، حساب‌ها، گزارش‌ها و سال مالی؛ جست‌وجو و فیلتر سند بر اساس تاریخ شمسی/نوع/منبع/وضعیت؛ ایجاد/ویرایش پیش‌نویس با چند ردیف بدهکار/بستانکار؛ مشاهده/چاپ، قطعی‌کردن، برگشت سند؛ ساخت/غیرفعال حساب؛ ترازها، سال جدید، استهلاک و بستن سال.

## داده و API

/api/acc/meta؛ /api/acc/accounts (CRUD)؛ /api/acc/documents (list/create/update/delete draft); /api/acc/documents/:id؛ POST /:id/post و /:id/reverse؛ /api/acc/reports/:path؛ POST /api/acc/years؛ POST /api/acc/years/:id/close؛ POST /api/acc/depreciation.

## قواعدی که بازنویسی باید حفظ کند

برای سند تراز جمع بدهکار=بستانکار اجباری؛ اسناد قطعی حذف/ویرایش نمی‌شوند و اصلاح با برگشت ثبت می‌شود؛ سال مالی شمسی فروردین تا اسفند؛ حساب دارای گردش حذف‌پذیر نیست؛ tenant و role isolation.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

این ماژول دفتر دوطرفه است و با Ledger ساده در `finance.tsx` فرق دارد. داده آغازین `/api/acc/meta` سال‌ها/سال جاری و `/api/acc/accounts` کدینگ است. صفحه اسناد را از `/api/acc/documents` با query filters (بازه، kind، source، status، q) می‌گیرد؛ row شامل شماره، تاریخ، شرح/مبدأ، status و جمع بدهکار/بستانکار است. editor سند چند line دارد: accountId، description، debit و credit؛ انتخاب account hierarchic از chart.

جریان سند: create POST؛ draft edit PATCH؛ جزئیات GET `/documents/:id`; حذف فقط draft از DELETE؛ قطعی‌کردن POST `/:id/post`; reverse POST `/:id/reverse` (برای سند قطعی حذف نکن). گزارش‌ها از `/api/acc/reports/:path`. تب accounts ایجاد level/parent/code/name/type، toggle active و delete فقط بدون گردش. تب سال مالی ساخت سال شمسی، close قطعی با انتقال profit/loss به retained earnings و opening سند سال بعد؛ depreciation ماهانه خط مستقیم فقط یکبار ماه.

**قواعد الزام‌آور:** برای posting جمع بدهکار و بستانکار دقیقاً برابر؛ خطوط خالی/صفر را نپذیر؛ سال فروردین تا پایان اسفند؛ اسناد posted فقط reverse؛ سال بسته تغییر نمی‌کند؛ close/depreciation قبل از commit confirm داشته باشد. گزارش جزئیات دقیق path/query را از منبع API بازبینی کن.

**پذیرش:** draft balanced/unbalanced، account inactive، post/reverse، filter سند، year close، depreciation idempotency و صفحه در عرض کم (جدول افقی) را آزمایش کن.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
