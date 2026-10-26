# تکمیل CRUD میزها در برنامهٔ آفلاین Windows

## هدف

کاربر صندوق در زمان قطع اینترنت بتواند فهرست میزها را ببیند و عملیات پایهٔ مدیریت میز را در دستگاه ثبت کند، بدون اینکه هم‌زمان یک سفارش یا رزرو تازه به میز در حال تغییر وصل شود. دسترسی آفلاین به تاریخچهٔ سفارش‌ها و جزئیاتشان نیز شرط حفظ‌شدهٔ این نسخه است.

## تغییرات

- تب میزها اکنون ساخت، ویرایش و حذف را کنار تغییر وضعیت عملیاتی ارائه می‌کند. ورودی نام و زون حداکثر ۴۰ نویسه و ظرفیت ۱ تا ۱۰۰ نفر است؛ عملیات با PIN مدیر محلی اجازه داده می‌شود.
- CRUD و تغییر وضعیت با UUID، snapshot میزهای همان terminal و revision آن در outbox رمز‌شده قرار می‌گیرند. update/delete baseline نام، زون، ظرفیت و وضعیت عملیاتی را می‌فرستند؛ سرور تغییر هم‌زمان را conflict می‌کند و مقدار تازه را بی‌صدا overwrite نمی‌کند.
- میز تازه در رابط شناسهٔ منفی محلی دارد و تا دریافت snapshot دارای شناسهٔ سرور، برای صندوق و رزرو قابل انتخاب نیست. حذف pending به شکل واضح نمایش داده می‌شود و کارت میز تا نتیجهٔ sync ناپدید نمی‌شود.
- انتخاب میز در صندوق فقط میزهای `available` را نشان می‌دهد. SQLite ثبت سفارش و درخواست رزرو را برای میزی که command میز pending دارد متوقف می‌کند؛ این مانع از آن می‌شود که worker به علت ارسال گروه `orders` پیش از `tables` ترتیب ناسازگار اعمال کند.
- سرور در transaction نام تکراری، مالکیت tenant، terminal، entitlement، snapshot، baseline، سفارش پرداخت‌نشدهٔ باز، رزرو فعال/آینده و درخواست باز مشتری را بررسی می‌کند. حذف فقط بعد از گذشتن این کنترل‌ها ممکن است. هر transition وضعیت همراه event و ledger فرمان اتمی است.
- migration افزایشی `0079_offline_table_crud.sql` actionهای `create/update/delete` را برای ماژول میزها مجاز می‌کند. migration اجرا نشده است. rollback فقط در نبود history این سه فرمان انجام می‌شود و `set_status` موجود را حفظ می‌کند.
- درخواست تازهٔ کاربر برای تاریخچهٔ سفارش دوباره با کد تطبیق داده شد: آخرین سفارش‌ها و آرشیو cursorدار همراه خطوط و جزئیات در SQLite محلی ذخیره می‌شوند؛ فهرست و مودال جزئیات به اینترنت متکی نیستند. کامل بودن همهٔ سابقه به اتمام backfill پیش از قطع اینترنت وابسته است. آزمون هستهٔ Rust برای ماندگاری جزئیات سفارش پس از restart اضافه شد.

## فایل‌های تغییرکرده

- `src/lib/offline-table-status-core.ts`: parser محدود برای چهار action میز و baseline.
- `src/lib/offline-tables.ts`: اعمال idempotent CRUD/status، تطبیق baseline و بررسی سفارش/رزرو/درخواست باز.
- `src/db/migrations/0079_offline_table_crud.sql` و `src/db/migrations/0079_offline_table_crud.down.sql`: allowlist و rollback محافظه‌کارانه.
- `windows-bridge/offline-core/src/lib.rs`: outbox میزها، شناسهٔ محلی create، کنترل هم‌زمانی با سفارش/رزرو، و تست ماندگاری آرشیو سفارش.
- `windows-bridge/src-tauri/src/offline.rs` و `windows-bridge/src-tauri/src/main.rs`: فرمان‌های Tauri میز.
- `windows-bridge/ui/index.html`, `windows-bridge/ui/pos.js`, `windows-bridge/ui/style.css`: فرم‌ها، کارت‌ها، optimistic state و محدودکردن انتخاب میز.
- `tests/offline-table-status.test.cjs`: آزمون parser برای create/update/delete و ورودی نامعتبر.
- `docs/agents/modules/tables.md`, `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/core-pages/api-contract-map.md`, `IMPLEMENTATION_STATUS.md`: قرارداد و محدودیت‌های فعلی.

## راستی‌آزمایی

- `npm run typecheck -- --incremental false`: موفق.
- `node --test tests/offline-table-status.test.cjs`: ۳/۳ موفق.
- `npx eslint src/lib/offline-tables.ts src/lib/offline-table-status-core.ts`: موفق.
- `node --check windows-bridge/ui/pos.js` و `git diff --check`: موفق.
- migration یا دیتابیس اجرا نشد و داده‌ای به سرور تولید نوشته نشد.
- آزمون جدید Rust و build برنامهٔ Windows اجرا نشدند؛ `cargo`/`rustc` در محیط در دسترس نیستند.

## محدودیت‌های باقی‌مانده

در حالت قطعی، occupancy/reservation زنده و QR designer از سرور قابل تازه‌سازی نیستند. آرشیو کامل سفارش فقط پس از تکمیل backfill آنلاین تضمین می‌شود؛ اگر اتصال زودتر قطع شود، همهٔ داده‌های cacheشده و جزئیاتشان قابل مشاهده‌اند و دریافت آرشیو از cursor پس از اتصال ادامه می‌یابد. تغییر فهرست میز تا دریافت snapshot جدید در سایر دستگاه‌ها منتشر نمی‌شود.
