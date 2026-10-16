# چاپگرها

> مشخصات بازسازی ماژول `printers` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/printers`
- کامپوننت/منبع فعلی: `src/modules/hardware.tsx — Printers`
- entitlement تعرفه: `cloud_printer`
- هدف: مدیریت چند پرینتر و تفکیک دسته محصولات برای چاپ خودکار سفارش.

## رابط و جریان کار

فهرست چاپگرها و اتصال agent، انتخاب دسته‌بندی‌های محصول برای هر printer، سلامت دستگاه؛ queue چاپ با polling 6s؛ چاپ آزمایشی؛ مشاهده خطا و retry/delete job.

## داده و API

GET/CRUD /api/r/dev_printer؛ PATCH /api/r/dev_printer/:id {printerCategoryIds}؛ GET/POST /api/r/printjobs؛ device jobs /api/device/:code/jobs؛ categories /api/categories.

## قواعدی که بازنویسی باید حفظ کند

یک سفارش ممکن است بین printerها partition شود؛ هر پرینتر فقط categoryهای خودش را چاپ کند؛ idempotency برای retry؛ USB/network اتصال توسط local agent، نه browser server.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

`DevicePanel` برای `/api/r/dev_printer` (device kind printer)؛ هر device name/code/lastSeen/status و hint `/api/device/:code/jobs`. برای هر پرینتر `printerCategoryIds[]` از `/api/categories` انتخاب می‌شود و PATCH `/api/r/dev_printer/:id`; backend validate می‌کند تمام category ids متعلق به همان business باشند. این نگاشت باعث می‌شود سفارش چنددسته‌ای jobهای تفکیک‌شده برای آشپزخانه/کافی‌بار بسازد.

Queue از `/api/r/printjobs` هر ۶ ثانیه: status pending/printed/failed، deviceName، order یا test، زمان و detail failure. هر ردیف view receipt `content`, retry با status=pending، delete. دکمه test POST `/api/r/printjobs`؛ server برای هر printer یک test job می‌سازد و بدون printer خطا می‌دهد. Retry باید duplicate print را در نظر داشته باشد؛ idempotent job ID مسیر مرجع است.

این UI connection agent/USB/TCP را browser مستقیم مدیریت نمی‌کند؛ agent محلی jobs endpoint را poll/ack می‌کند و با USB یا شبکه چاپ می‌زند. برای exact command/status protocol، docs/device local app و API device route را بخوان.

**پذیرش:** دو printer با دسته‌های جدا، category بدون دسته، failed detail, retry, test, delete, offline device و order mix kitchen/cafe bar.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
