# پیک‌ها

> مشخصات بازسازی ماژول `couriers` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/couriers`
- کامپوننت/منبع فعلی: `src/modules/hardware.tsx — Couriers`
- entitlement تعرفه: `courier`
- هدف: مدیریت ناوگان پیک و تخصیص سفارش‌های ارسال.

## رابط و جریان کار

CRUD پیک‌ها/وضعیت/وسیله؛ لیست سفارش‌های delivery فعال؛ انتخاب پیک و انتساب؛ نمایش سفارش‌های فعال هر پیک.

## داده و API

GET/CRUD /api/r/couriers؛ GET /api/orders?status=pending,preparing,ready,served&limit=150؛ PATCH /api/orders/:id {courierId}.

## قواعدی که بازنویسی باید حفظ کند

فقط سفارش delivery؛ پیک غیرفعال/ناموجود assign نشود؛ تغییر ظرفیت/وضعیت از سرور منعکس شود.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Courier fields: name,phone,vehicle,status(`available|busy|off`), email/password هنگام ساخت login؛ `hasLogin,activeCount,deliveredToday,failedToday` از سرور تزئینی/محاسبه‌ای‌اند. Create/edit از ResourcePage؛ password secret و در edit empty = بدون تغییر. Columns پیک/tel، vehicle، badge status، active count، آمار روز، login email. Poll خود ResourcePage هر ۸ ثانیه.

پایین صفحه delivery board سفارش‌های type=delivery و status pending/preparing/ready/served را هر ۸ ثانیه refresh می‌کند؛ failures not_home/failed بالا می‌آیند؛ آدرس و customer phone و note، map link، مبلغ، delivery status و picker پیک نشان داده می‌شود. picked_up/delivered assignment selector قفل می‌شود. Courier app به خود پیک actions می‌دهد.

`/api/r/couriers` feature courier, writer cashier؛ assignment در PATCH `/api/orders/:id {courierId}` و server check می‌کند order delivery باشد و picked_up/delivered را نتوان جابه‌جا کرد.

**پذیرش:** create account credentials، status off در options حذف مگر courier فعلی، failed delivery re-dispatch، picker/refresh، نقشه و داده خصوصی address فقط برای نقش‌های مجاز.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
