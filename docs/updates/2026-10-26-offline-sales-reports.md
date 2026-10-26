# گزارش فروش آفلاین در اپ Windows

## مسئله

گزارش فروش پنل رستوران فقط از API آنلاین خوانده می‌شد؛ هنگام قطع اینترنت، مدیر صندوق به خلاصهٔ عملکرد دسترسی نداشت.

## رفتار اضافه‌شده

- dataset جدید `reports` به `GET /api/offline-dashboard/snapshots/:dataset` اضافه شد.
- دسترسی فقط وقتی صادر می‌شود که terminal همان کسب‌وکار مجاز باشد و هر دو entitlement `cashier_pos` و `sales_reports` فعال باشند.
- snapshot از ۹۰ روز تقویمی تهران محاسبه می‌شود: درآمد و تعداد سفارش‌های پرداخت‌شده (`status=paid` و `paymentStatus=paid`)، میانگین مبلغ، تخفیف، مالیات، بهای تمام‌شدهٔ ذخیره‌شده روی سفارش، سود ناخالص، سری روزانه، ۵۰ محصول پرفروش و شمار سفارش‌ها به تفکیک وضعیت سفارش/پرداخت.
- Worker دسکتاپ snapshot را هر چرخهٔ همگام‌سازی Workspace می‌گیرد و Tauri UI آن را از SQLite رمزگذاری‌شده نمایش می‌دهد. صفحه شامل شاخص‌ها، نمودار روزانهٔ ۳۰ روز اخیر، محصولات برتر و جدول وضعیت‌ها است.
- داده فقط‌خواندنی است؛ فروش‌هایی که هنوز از صف POS به سرور نرسیده‌اند در گزارش قطعی محاسبه نمی‌شوند. زمان snapshot و TTL هفت‌روزه نمایش داده می‌شود.
- migration `0066_offline_sales_reports.sql` allowlist dataset را می‌گستراند و down migration در صورت وجود snapshot گزارش rollback را متوقف می‌کند.

## فایل‌ها

- `src/lib/offline-dashboard.ts`: entitlement، aggregateهای tenant-scoped و سری روزانه.
- `windows-bridge/src-tauri/src/offline.rs`, `windows-bridge/src-tauri/src/main.rs`, `windows-bridge/offline-core/src/lib.rs`: refresh worker، IPC read-only و allowlist cache.
- `windows-bridge/ui/index.html`, `windows-bridge/ui/pos.js`, `windows-bridge/ui/style.css`: تب گزارش فروش آفلاین.
- `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/modules/offline-pos.md`, `docs/agents/core-pages/api-contract-map.md`: ماتریس پوشش و قراردادها.

## محدوده و اعتبارسنجی

این مرحله خروجی Excel/چاپ، فیلتر تاریخ سفارشی، ریز تراکنش‌ها، سودوزیان کامل، پیش‌بینی و projection فروش صف‌شده را اضافه نمی‌کند. Migration اجرا نشده و هیچ دیتابیس یا دادهٔ واقعی تغییر نکرده است. TypeScript، ESLint هدفمند، بررسی نحوی JavaScript و `git diff --check` اجرا می‌شوند؛ build Rust فقط در صورت موجودبودن toolchain امکان‌پذیر است.
