# ساخت شیفت تکی در اپ Windows هنگام قطعی — ۲۰۲۶-۱۰-۲۶

## رفتار و قرارداد

- تب «شیفت‌ها و مرخصی‌ها» اکنون دکمهٔ ثبت یک شیفت جدید دارد. کاربر فعال از snapshot همان tenant انتخاب می‌شود؛ زمان شروع/پایان با تاریخ شمسی و منطقهٔ زمانی تهران ثبت می‌شود، ورودی ساعت با ارقام فارسی/عربی نیز پذیرفته می‌شود و مدت هر شیفت حداکثر ۲۴ ساعت است.
- snapshot باید تازه باشد و PIN محلی مدیر برای افزودن فرمان لازم است. فرمان با UUID، نسخه/شناسه snapshot و payload کوچک در outbox رمز‌شدهٔ SQLite قرار می‌گیرد؛ تا رسید سرور، به‌صورت «در صف همگام‌سازی» نشان داده می‌شود و برنامهٔ رسمی را وانمود نمی‌کند.
- هنگام اتصال، worker فرمان `staff/create_shift` را به `/api/offline-dashboard/commands` می‌فرستد. سرور entitlement و pairing، فعال‌بودن کسب‌وکار/terminal، مالکیت snapshot، نسخه و عمر آن، بازهٔ snapshot، فعال‌بودن کارمند، تداخل شیفت‌های زمان‌بندی‌شده و مرخصی تأییدشده را بازبینی می‌کند. ساخت شیفت و ثبت command ledger idempotent در یک transaction است؛ قفل ردیف کارمند ثبت هم‌زمان از پنل آنلاین را سری می‌کند.
- پاسخ موفق رسید و شناسهٔ شیفت را ثبت می‌کند؛ worker snapshot شیفت را برای نمایش برنامهٔ قطعی تازه می‌گیرد. تعارض یا رد سرور در صف می‌ماند و به کاربر نمایش داده می‌شود.
- migration `0061_offline_staff_shift_creation.sql` فقط action جدید را به allowlist ledger می‌افزاید. rollback تا زمانی که سابقهٔ فرمان `create_shift` وجود دارد متوقف می‌شود.

## فایل‌ها

- `windows-bridge/offline-core/src/lib.rs`: اعتبارسنجی PIN، snapshot، بازه، زمان و تداخل موجود؛ ساخت فرمان.
- `windows-bridge/src-tauri/src/offline.rs`, `main.rs`: command Tauri و relay worker.
- `windows-bridge/ui/index.html`, `pos.js`: فرم تاریخ/ساعت شمسی، تبدیل دقیق زمان تهران و ارقام فارسی/عربی، فهرست فرمان‌های local pending/synced/conflict.
- `src/lib/offline-dashboard.ts`: parser سخت‌گیر و transaction سرور.
- `src/db/migrations/0061_offline_staff_shift_creation.sql` و `.down.sql`: allowlist و rollback محافظت‌شده.
- راهنماها: `docs/agents/modules/offline-pos.md`, `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/core-pages/api-contract-map.md` و `IMPLEMENTATION_STATUS.md`.

## اعتبارسنجی و محدودیت

- `npx tsc --noEmit --incremental false`, `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند.
- به محدودیت کاربر، migration روی دیتابیس اجرا نشد و تست دیتابیس/integration انجام نشد. `cargo` و `rustc` روی میزبان نصب نیستند؛ کامپایل Rust/Tauri و اجرای native Windows تأیید نشده‌اند.
- این slice فقط ساخت شیفت تکی است. اعمال الگوهای ثابت/دسته‌ای، ویرایش یا لغو شیفت و غیبت آفلاین نیستند؛ server در sync نقطهٔ نهایی اعتبارسنجی است.
