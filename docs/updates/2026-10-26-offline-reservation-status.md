# تغییر وضعیت رزرو در اپ ویندوز هنگام قطعی — ۲۰۲۶-۱۰-۲۶

## رفتار افزوده‌شده

- تب رزروهای اپ ویندوز برای رزروهای `requested` امکان تأیید یا رد/لغو دارد؛ اگر پیش‌پرداخت pending باشد، تأیید غیرفعال است. رزرو `confirmed` نیز قابل لغو، انجام‌شده یا عدم‌حضور است.
- مدیر برای هر تغییر PIN محلی می‌زند. فرمان کمینه شامل شناسهٔ رزرو، وضعیت قبلی، `updatedAt` قبلی، وضعیت مقصد و snapshot مبناست و در outbox رمز‌شده ثبت می‌شود. UI آن را تا دریافت رسید سرور «در انتظار همگام‌سازی» نشان می‌دهد و تغییر دوم را تا snapshot تازه مسدود می‌کند.
- سرور با Bearer دستگاه، tenant/entitlement، وضعیت terminal، snapshot و reservation row را در transaction بررسی می‌کند. اختلاف `status/updatedAt` conflict است؛ تغییر و command ledger idempotent به‌صورت اتمی ثبت می‌شوند. پیش‌پرداخت یا refund از این فرمان‌ها انجام نمی‌شود.
- پس از commit برای وضعیت confirmed/cancelled تلاش ارسال SMS می‌شود. ارسال best-effort است و retry پایدار پیامک در این مرحله پیاده نشده است؛ شکست SMS وضعیت رزرو را rollback نمی‌کند.
- worker بعد از موفقیت یا conflict snapshot رزرو را تازه می‌کند. migration `0063_offline_reservation_status.sql` action `reservations/set_status` را به ledger سرور می‌افزاید؛ down migration با وجود history مربوطه متوقف می‌شود.

## فایل‌های تغییرکرده

- `src/lib/offline-reservations.ts`: parser strict، بررسی optimistic/versioned و اعمال idempotent تغییر وضعیت در transaction.
- `src/app/api/offline-dashboard/reservations/route.ts`: dispatch `create` و `set_status`.
- `src/db/migrations/0063_offline_reservation_status.sql` و `.down.sql`: allowlist و guard rollback.
- `windows-bridge/offline-core/src/lib.rs`: queue با PIN/snapshot، محافظت تکرار تغییر تا snapshot تازه و شناسهٔ رزرو/وضعیت در summary محلی.
- `windows-bridge/src-tauri/src/offline.rs`, `main.rs`: فرمان Tauri و refresh snapshot رزرو بعد از نتیجهٔ sync.
- `windows-bridge/ui/index.html`, `pos.js`, `style.css`: عملیات وضعیت، مودال تأیید و نشانهٔ صف.
- راهنماها در `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/modules/offline-pos.md` و `docs/agents/core-pages/api-contract-map.md` به‌روز شدند.

## بررسی و محدودیت

- `npx tsc --noEmit --incremental false`, ESLint هدفمند، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند.
- دیتابیس، migration و تست‌های integration اجرا نشدند. `cargo` در محیط وجود ندارد؛ کامپایل Rust/Tauri و اجرای Windows تأیید نشده است.
- فهرست رزروها همچنان آخرین ۱۰۰ مورد است. تغییر جزئیات، پرداخت پیش‌پرداخت و refund آفلاین نیستند. SMS وضعیت پس از commit best-effort است و outbox مستقل retry ندارد.
