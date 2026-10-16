# شناسه تماس

> مشخصات بازسازی ماژول `caller-id` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/caller-id`
- کامپوننت/منبع فعلی: `src/modules/hardware.tsx — CallerId`
- entitlement تعرفه: `caller_id`
- هدف: دریافت تماس ورودی دستگاه caller-ID و آغاز سریع سفارش مشتری.

## رابط و جریان کار

نمایش اتصال و ping؛ لیست تماس‌ها با polling 4s، شماره، زمان و وضعیت؛ اکشن ساخت سفارش از تماس با customer matching.

## داده و API

GET /api/r/calls؛ DevicePanel /api/r/dev_caller؛ device POST /api/device/:code/call {phone}.

## قواعدی که بازنویسی باید حفظ کند

شماره normalize؛ کنترل دسترسی شماره؛ duplicate call/order و customer match server-side.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Device panel برای resource `dev_caller` و hint POST `/api/device/:code/call {phone}`؛ list calls `/api/r/calls` هر ۴s poll. `Call` شامل phone,handled,createdAt و customer match (name/points/ordersCount/totalSpent) است. calls API phone را normalize و customer را بر اساس businessId + phone match می‌کند؛ response فقط summary customer را می‌دهد.

manual call form برای وقتی device وصل نیست؛ POST resource call با phone و سپس reload. هر row call جدید با pulse/highlight، phone LTR، customer summary یا ناشناس، زمان، دکمه `/dashboard/cashier?phone=${phone}` و «بررسی شد» toggle دارد. این query روی cashier prefill می‌شود و اگر `delivery_order` enabled باشد default type delivery می‌شود.

**پذیرش:** شماره با کد کشور/فاصله normalize، caller unknown, duplicate repeated calls separate, handled, customer privacy, cashier link و failed device test.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
