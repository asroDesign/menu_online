# همگام‌سازی پیوستهٔ تاریخچهٔ سفارش آفلاین

## مسئله

آرشیو اولیهٔ سفارش‌ها cursorدار بود، اما پس از تکمیل آن، snapshot ثابت آخرین ۱۰۰ سفارش هر ۶۰ ثانیه تنها راه تازه‌سازی آرشیو بود. بین دو دریافت ممکن بود بیش از ۱۰۰ سفارش ثبت شود؛ همچنین تغییر وضعیت یا پرداخت سفارش‌های قدیمی‌تر می‌توانست در جزئیات محلی باقی نماند.

## تغییر

- مسیر `GET /api/offline-dashboard/order-history/changes` با مجوز terminal، tenant و `cashier_pos` سفارش‌های تازه/ویرایش‌شده را براساس `updatedAt,id` صفحه‌بندی می‌کند و هر صفحه را به همراه آیتم‌ها، پرداخت و جزئیات سفارش برمی‌گرداند.
- همگام‌سازی محلی یک watermark پایدار دارد، از cursor آخر پس از قطعی ادامه می‌دهد و هر چرخه ۱۰ دقیقه هم‌پوشانی می‌دهد تا تغییرات دیررس یا timestampهای همسان از قلم نیفتند.
- دادهٔ صفحه با upsert در همان آرشیو رمز‌شدهٔ SQLite ذخیره می‌شود؛ تغییرات پرداخت/وضعیت، جزئیات سفارش قبلی را درجا به‌روزرسانی می‌کنند و سفارش تازه از محدودیت آخرین ۱۰۰ ردیف عبور می‌کند.
- حذف نرم سفارش با tombstone کم‌داده (شناسه، شماره و زمان cursor) به دستگاه اعلام می‌شود تا پس از اتصال، PII و جزئیات سفارش حذف‌شده از cache محلی پاک شوند.
- چرخهٔ delta هم‌زمان با دریافت snapshot و آرشیو اصلی، هر ۳۰ ثانیه تا تکمیل آرشیو و سپس هر ۶۰ ثانیه اجرا می‌شود. UI زمان دریافت یا خطای delta را نشان می‌دهد و صفحهٔ فهرست را پس از تغییرات cache دوباره می‌خواند.
- migration `0076_offline_order_history_changes.sql` شاخص `(business_id, updated_at, id)` می‌سازد؛ شاخص سفارش‌های حذف نرم‌شده را هم پوشش می‌دهد تا tombstoneها دریافت شوند. rollback فقط همان شاخص را حذف می‌کند. Migration اجرا نشده است.

## فایل‌ها

- `src/lib/offline-dashboard.ts`: endpoint صفحه‌بندی delta با کنترل terminal/tenant/entitlement.
- `src/db/schema.ts`: تعریف شاخص تاریخچهٔ تغییرات برای هماهنگی schema و migration.
- `src/app/api/offline-dashboard/order-history/changes/route.ts`: route no-store.
- `windows-bridge/offline-core/src/lib.rs`: watermark، checkpoint و upsert رمز‌شده در cache تاریخچه.
- `windows-bridge/src-tauri/src/offline.rs`: worker دریافت delta و وضعیت خطا/پیشرفت.
- `windows-bridge/ui/pos.js`: نمایش سلامت delta و تازه‌سازی فهرست/جزئیات.
- `src/db/migrations/0076_offline_order_history_changes.sql` و نسخهٔ rollback: شاخص کوئری delta.
- `docs/agents/modules/offline-full-dashboard.md`: رفتار فعلی و محدودیت‌های آفلاین.

## اعتبارسنجی

- `npx tsc --noEmit --incremental false`: موفق.
- `node --check windows-bridge/ui/pos.js` و `git diff --check`: موفق.
- `cargo` در این محیط در دسترس نیست؛ کامپایل Rust/Tauri اجرا نشد.
- دیتابیس و migration اجرا نشدند؛ تست‌های وابسته به PostgreSQL اجرا نشدند.
