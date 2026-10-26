# تاریخچه و گردش سفارش آفلاین در اپ Windows — ۲۰۲۶-۱۰-۲۶

## هدف

هنگام قطعی اینترنت، صندوق Windows باید بتواند تاریخچهٔ سفارش‌های دریافت‌شده و جزئیات آن‌ها را از SQLite محلی باز کند. کاربر نباید برای بازکردن ردیف یا مودال جزئیات به سرور وصل باشد. این رفتار از قبل در هستهٔ تاریخچهٔ سفارش پیاده شده بود و در این نوبت با کد تطبیق داده شد: ۱۰۰ سفارش اخیر سریع cache می‌شوند، آرشیو قدیمی‌تر با cursor تا پایان اتصال backfill می‌شود، و جزئیات اقلام/گزینه‌ها/مبالغ/پرداخت روی دستگاه رمز‌شده نگه‌داری می‌شوند. تاریخچهٔ سفارش‌های محلی همین صندوق نیز مستقل از اینترنت در SQLite باقی می‌ماند.

هم‌زمان، این تغییر محدود امکان جلو بردن وضعیت تولیدی سفارش‌های اخیر را در زمان قطعی اضافه می‌کند تا صف آشپزخانه محلی قابل استفاده باشد، بدون آن‌که پرداخت یا وضعیت مالی سفارش جعل شود.

## رفتار تغییر وضعیت

- وضعیت تولیدی فقط یک مرحله جلو می‌رود: `pending → preparing → ready → served`؛ فقط سفارش داخل snapshot تازهٔ ۱۰۰ سفارش اخیر قابل تغییر است. آرشیو قدیمی و snapshot منقضی فقط‌خواندنی می‌مانند.
- PIN مدیر محلی برای ثبت فرمان لازم است. فرمان UUID، tenant، snapshot/revision و `expectedStatus/expectedUpdatedAt` را در outbox رمز‌شده می‌گذارد.
- اگر `orderWorkflowPreset=4` باشد، تأیید صندوقدار action مستقلی است و پیش از شروع آماده‌سازی لازم است. snapshot وضعیت تأیید را نیز می‌آورد. تا sync موفق و دریافت snapshot تازه، مرحلهٔ بعدی باز نمی‌شود.
- سمت سرور دستگاه/کسب‌وکار، دسترسی `cashier_pos`، تعلیق کسب‌وکار، snapshot و TTL، status و timestamp دقیق سفارش و سیاست گردش را دوباره کنترل می‌کند. update سفارش، رویداد وضعیت، تأیید صندوقدار و ledger فرمان در transaction اعمال می‌شوند. اجرای تکراری UUID اثر دوباره ندارد؛ تغییر هم‌زمان یا snapshot منقضی به conflict قابل بازبینی تبدیل می‌شود.
- رفتن به `ready` می‌تواند چاپ پایان کار و پیجر را فقط پس از sync سروری صف کند. این مسیر سفارش دلیوری را تحویل‌شده نمی‌کند و پرداخت، لغو، refund، courier workflow یا سند حسابداری را تغییر نمی‌دهد.
- درخواست کاربر دربارهٔ تاریخچه مستقل است: هنگام قطعی، سفارش‌ها و جزئیات cacheشده بدون API باز می‌شوند. همهٔ سوابق فقط وقتی پیش از قطعی در دسترس‌اند که backfill آرشیو روی همان دستگاه کامل شده باشد؛ موارد دریافت‌نشده بعد از وصل‌شدن از cursor ادامه پیدا می‌کنند.

## فایل‌ها و داده

- `src/lib/offline-order-status-core.ts`: قرارداد بستهٔ command برای `change_status` و `confirm_cashier`، شناسه‌ها، timestamp و allowlist payload.
- `src/lib/offline-dashboard.ts`: snapshot سفارش با `updatedAt` میکروثانیه‌ای، `workflowPreset` و `cashierConfirmedAt`؛ handler تراکنشی/idempotent و صف چاپ/پیجر پس از status معتبر.
- `src/db/migrations/0072_offline_order_status.sql` و `.down.sql`: مجازکردن `orders/change_status|confirm_cashier` در command ledger و rollback محافظه‌کارانه در صورت وجود تاریخچهٔ فرمان.
- `windows-bridge/offline-core/src/lib.rs`: اعتبارسنجی snapshot/PIN و ساخت فرمان رمز‌شده؛ خواندن وضعیت فرمان‌های وضعیت/تأیید.
- `windows-bridge/src-tauri/src/offline.rs`, `main.rs`: worker `orders` و فرمان‌های Tauri برای وضعیت/تأیید و خواندن آرشیو محلی.
- `windows-bridge/ui/index.html`, `pos.js`: مشاهدهٔ سفارش/جزئیات بدون شبکه، دکمهٔ تأیید صندوقدار در گردش چهارمرحله‌ای، status action و نشان pending/conflict/synced.
- راهنماهای به‌روز‌شده: `docs/agents/modules/offline-pos.md`, `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/core-pages/api-contract-map.md`, `docs/agents/module-capabilities.md`, `docs/agents/README.md`.
- `tests/offline-order-status-command.test.cjs`: قواعد transition و command تأیید صندوقدار.

## بررسی و محدودیت اجرا

- `npx tsc --noEmit --incremental false`: موفق.
- ESLint هدفمند برای فایل‌های TypeScript/JavaScript، `node --check windows-bridge/ui/pos.js` و `git diff --check`: موفق.
- تست‌های pure parser و regressionهای مجاور: ۸ از ۸ موفق.
- npm در این ماشین هشدار می‌دهد نسخهٔ جاری Node `18.17.1` پایین‌تر از حد پشتیبانی npm نصب‌شده است؛ دستورات بالا با همین محیط موفق شدند.
- `cargo` و `rustc` نصب نیستند؛ کامپایل crate و Tauri تأیید نشده است. migration یا PostgreSQL/integration اجرا نشده، طبق محدودیت بررسی کد؛ چاپگر/پیجر، قطع واقعی اینترنت و sync زنده هم آزموده نشده‌اند. deploy/نصب‌گر جدید در این تغییر انجام نشده است.
- snapshotها ۷ روز اعتبار دارند. بعد از انقضا، فهرست و جزئیات ذخیره‌شده همچنان خواندنی است؛ تغییر وضعیت آفلاین متوقف می‌شود تا نسخهٔ تازه دریافت شود. پشتیبانی همهٔ ماژول‌های داشبورد در آفلاین همچنان کامل نشده است.
