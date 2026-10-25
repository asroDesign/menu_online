# مرکز یکپارچه اعلان پنل رستوران — ۲۰۲۶-۱۰-۲۵

## خواسته و رفتار نهایی

زنگ موجود در هدر پنل رستوران توسعه یافت تا علاوه بر هشدار کمبود موجودی/انقضا، کارهای تازهٔ روزانه را در یک فهرست نشان دهد:

- درخواست‌های رزرو با وضعیت `requested`، نام مشتری، تعداد مهمان، زمان رزرو و میز تخصیص‌یافته.
- سفارش‌های مشتری که هنوز `pending` یا `awaiting_payment` هستند؛ سفارش‌های `preparing` تا ۲۴ ساعت پس از ثبت نیز به‌عنوان سفارش آنلاین تازه در فهرست می‌مانند.
- درخواست‌های `open` مشتریان برای صداکردن گارسون یا پیام به میز.
- هشدارهای inventory که همچنان از منطق موجود کمبود/اتمام و انقضای کالا استفاده می‌کنند.

badge تعداد همهٔ موارد جاری را نشان می‌دهد. گروه‌ها در بخش‌های جداگانه و فهرست قابل‌اسکرول نمایش داده می‌شوند و هر مورد به مسیر مدیریت مرتبط وصل است. refresh دستی و polling هر ۶۰ ثانیه در تب قابل‌مشاهده فعال‌اند. notifier صوتی/تصویری موجود درخواست گارسون و toast موجود هشدار انبار تغییر نکردند.

## API، دسترسی و tenant

`GET /api/r/dashboard-notifications` با نشست `withAuth` اجرا می‌شود؛ هر دسته فقط وقتی خوانده می‌شود که feature آن در `auth.features` مؤثر بر نقش مجاز باشد. سفارش‌ها فقط `source=customer` و حذف‌نشده‌اند؛ رزرو فقط `requested` و درخواست گارسون فقط `open` است. شرط tenant هم بر رکورد اصلی و هم بر join میز اعمال می‌شود. پاسخ `no-store` است و شماره تلفن مشتری/رزرو و یادداشت رزرو را برنمی‌گرداند. متن پیام مستقیم مشتری به گارسون برای رسیدگی کارکنان نمایش داده می‌شود.

موجودی همچنان با API مستقل و دارای entitlement خودش خوانده می‌شود تا آستانه‌ها و سیاست toast قبلی تغییر نکند. کل مرکز خواندنی است؛ وضعیت سفارش، رزرو یا درخواست را تغییر نمی‌دهد و migration دیتابیس ندارد.

## فایل‌های تغییرکرده

- `src/components/dashboard-shell.tsx`: نمایش مرکز برای featureهای اعلان‌پذیر.
- `src/components/dashboard-notification-center.tsx`: UI، فهرست دسته‌ای، badge، refresh، polling و اتصال هشدارهای موجودی.
- `src/app/api/r/dashboard-notifications/route.ts`: queryهای محدود به tenant و feature برای سفارش، رزرو و درخواست گارسون.
- `src/lib/dashboard-notifications.ts`: قاعده سفارش‌های آنلاین قابل نمایش و محاسبه badge.
- `tests/dashboard-notifications.test.cjs`: تست قاعده، شمارنده، دسترسی و قرارداد tenant/API.
- `docs/agents/modules/panel-notifications.md`, `docs/agents/modules/inventory.md`, `orders.md`, `reservations.md`, `waiter.md`, `cashier.md`, `docs/agents/README.md`, `docs/agents/module-capabilities.md` و `IMPLEMENTATION_STATUS.md`.
- زنگ پیشین `src/components/inventory-alert-center.tsx` حذف و در مرکز مشترک ادغام شد؛ `src/app/api/r/inventory-alerts/route.ts` دست‌نخورده ماند.

## بررسی و محدودیت

- `node --test tests/dashboard-notifications.test.cjs tests/inventory-alerts.test.cjs`: ۵ تست، همگی موفق.
- `npm run typecheck -- --incremental false`: موفق.
- ESLint هدفمند فایل‌های تغییرکرده و `git diff --check`: موفق.
- تست پایگاه دادهٔ واقعی، جداسازی tenant با دو tenant واقعی و مرورگر/پنل زنده اجرا نشدند. برای مهاجرت schema نیاز نیست.
- badge تعداد موارد جاری است، نه دفتر unread مشترک؛ خوانده‌شدن/dismiss دائمی و اعلان Web Push در این تغییر اضافه نشده‌اند.
