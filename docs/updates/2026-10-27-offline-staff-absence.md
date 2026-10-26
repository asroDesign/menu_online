# ثبت غیبت شیفت در Windows آفلاین — ۲۰۲۶-۱۰-۲۷

## رفتار

در تب «شیفت کارکنان»، مدیر محلی می‌تواند برای شیفتی که شروع شده است غیبت ثبت کند و توضیح کوتاه بیفزاید. عملیات در outbox رمز‌شدهٔ SQLite ثبت می‌شود، در فهرست درخواست‌های محلی دیده می‌شود و وضعیت تا sync موفق قطعی فرض نمی‌شود. پس از رسیدن snapshot تازه که وضعیت `absent` را نشان دهد، رابط آن را به‌عنوان غیبت ثبت‌شده نمایش می‌دهد. ثبت ورود/خروج یا درخواست حضورِ هنوز تعیین‌تکلیف‌نشده با غیبت قابل ترکیب نیست.

تاریخچهٔ سفارش‌ها و جزئیات دریافت‌شده نیز هنگام قطع اینترنت از SQLite باز می‌شوند. سفارش‌های موجودِ صندوق و آرشیو سفارش‌های سرور در پس‌زمینه ذخیره می‌شوند؛ برای دسترسی به کل سابقه، backfill باید پیش از قطعی کامل شده باشد. این تغییر رفتار سفارش‌ها را عوض نمی‌کند.

## کنترل تعارض و امنیت

- Tauri PIN مدیر محلی را بررسی و snapshot `shifts` را محلی کنترل می‌کند. شیفت باید در snapshot تازه، فعال و `scheduled` باشد و زمان شروعش گذشته باشد.
- payload فقط UUID، tenant، snapshot/revision، `scheduleId`، `expectedVersion`، `expectedUpdatedAt` و توضیح حداکثر ۳۰۰ نویسه دارد.
- سرور entitlement صندوق و `staff_scheduling`، terminal و tenant را بررسی می‌کند؛ snapshot، status، version، زمان تغییر و زمان شروع جاری را دوباره تطبیق می‌دهد.
- سرور برای همان شیفت حضور ثبت‌شده و درخواست حضور `pending/approved` را جست‌وجو می‌کند. در صورت وجود، فرمان conflict می‌شود. update شرطی `scheduled + version` و درج command ledger در یک تراکنش PostgreSQL انجام می‌شوند؛ replay همان UUID نتیجهٔ قبلی را می‌دهد.
- یک فرمان pending یا synced برای همان شیفت از ثبت دوباره روی همان snapshot جلوگیری می‌کند. فرمان conflict/rejected تا دریافت snapshot تازه قابل تکرار نیست.
- migration `0073_offline_staff_absence.sql` فقط ترکیب مجاز `staff/mark_absent` را به outbox اضافه می‌کند؛ down migration در صورت وجود فرمان تاریخی غیبت rollback را متوقف می‌کند.

## فایل‌های تغییرکرده

- `windows-bridge/offline-core/src/lib.rs`: اعتبارسنجی شیفت، PIN، جلوگیری از دوباره‌ثبت و درج اتمی outbox.
- `windows-bridge/src-tauri/src/offline.rs`, `windows-bridge/src-tauri/src/main.rs`: فرمان Tauri و ثبت آن.
- `windows-bridge/ui/index.html`, `windows-bridge/ui/pos.js`: دکمهٔ ثبت غیبت، مودال توضیح/PIN، نمایش وضعیت pending و درخواست‌های محلی.
- `src/lib/offline-dashboard.ts`: parser و handler idempotent با کنترل نسخه و حضور جاری.
- `src/db/migrations/0073_offline_staff_absence.sql` و `.down.sql`: allowlist و مسیر برگشت محافظت‌شده.
- `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/core-pages/api-contract-map.md`, `docs/agents/module-capabilities.md` و `IMPLEMENTATION_STATUS.md`: ماتریس، قرارداد و فهرست تغییرات.

## محدودیت و بررسی

غیبت فقط به‌روزرسانی برنامهٔ شیفت است؛ حضور، محاسبهٔ حقوق و پرداخت ایجاد نمی‌کند. الگوی شیفت، ویرایش/لغو شیفت، همگام‌سازی هم‌زمان چند دستگاه و گردش حقوق آفلاین هنوز پیاده نشده‌اند. migration یا اتصال به دیتابیس اجرا نشد. `npx tsc --noEmit --incremental false`، ESLint هدفمند، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند. `cargo` و `rustc` در محیط موجود نیست؛ بنابراین build Rust/Tauri و اجرای Windows را نمی‌توان تأیید کرد.
