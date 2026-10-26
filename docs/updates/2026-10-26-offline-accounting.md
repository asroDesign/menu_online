# حسابداری پایه در اپ آفلاین Windows — ۲۰۲۶-۱۰-۲۶

## نقش ماژول

این vertical slice اجازه می‌دهد صندوق/مدیر رستوران در قطعی اینترنت، حساب‌های پایه و آخرین اسناد را ببیند و یک سند عمومی متوازن را روی همین دستگاه بسازد. نتیجه تا وقتی server فرمان را نپذیرفته «سند قطعی سرور» معرفی نمی‌شود. این مسیر جای دفتر کامل حسابداری، ثبت دریافت/پرداخت، مطالبات، بانک، چک، بستن سال و گزارش‌های مالی را نمی‌گیرد.

## قرارداد داده و رفتار

- `GET /api/offline-dashboard/snapshots/accounting` با Bearer terminal و همان tenant جفت‌شده کار می‌کند و به entitlementهای `cashier_pos` و `accounting` نیاز دارد. پیش از snapshot، chart/year پایه با `ensureAccounting` آماده می‌شود. payload فقط شناسه/کد/نام/سطح/ماهیت/فعال‌بودن حساب‌ها، سال‌های مالی، و حداکثر ۱۰۰ سند اخیر با ردیف‌ها را شامل می‌شود؛ ۱۰۰۰ حساب و ۱۰۰ سال سقف است و پاسخ بزرگ‌تر از ۴MB رد می‌شود.
- `offline-core` snapshot را در SQLite رمز‌شده با DPAPI ذخیره می‌کند. رابط محلی بدون API اطلاعات snapshot را نمایش می‌دهد؛ تاریخ ثبت سند شمسی است و گزینه‌ها از حساب‌های فعال سطح `moein` و `tafsili` ساخته می‌شوند.
- ثبت سند به PIN محلی مدیر، snapshot حسابداری تازه، تاریخ در سال مالی باز، شرح، حداقل دو ردیف صحیح و جمع بدهکار/بستانکار برابر و غیرصفر نیاز دارد. سندهای آفلاین از نوع `general` و `posted` هستند؛ پیش‌نویس، افتتاحیه/اختتامیه و برگشت سند از این فرم صادر نمی‌شود.
- فرمان `accounting/create_document` با UUID، `baseSnapshotId` و `baseRevision` به outbox محلی افزوده می‌شود. worker آن را به `/api/offline-dashboard/commands` می‌فرستد. server دوباره tenant/terminal/entitlement، عمر snapshot، حساب فعال/قابل ثبت، سال مالی باز و تراز را بررسی می‌کند. helper `postDocumentInTransaction` سند را می‌سازد و ledger فرمان در همان transaction ثبت می‌شود؛ `sourceRef=offline-command:<UUID>` در صورت retry پس از timeout سند دوم ایجاد نمی‌کند.
- migration `0060_offline_accounting_commands.sql` datasetهای واقعی snapshot را در constraint می‌پذیرد، action حسابداری را به ledger می‌افزاید و فایل down پیش از rollback وجود snapshot یا فرمان حسابداری را بررسی می‌کند.

## فایل‌های تغییرکرده

- `src/lib/offline-dashboard.ts`: snapshot حسابداری و entitlement.
- `src/lib/offline-accounting.ts`: parser سخت‌گیر، transaction و idempotency ثبت سند.
- `src/db/migrations/0060_offline_accounting_commands.sql` و `.down.sql`: allowlist دیتابیس و مسیر برگشت محافظت‌شده.
- `windows-bridge/offline-core/src/lib.rs`: اعتبارسنجی تراز، حساب، سال مالی، PIN و ذخیره در outbox.
- `windows-bridge/src-tauri/src/offline.rs` و `main.rs`: دریافت snapshot، فرمان Tauri و relay worker.
- `windows-bridge/ui/index.html`, `pos.js`, `style.css`: تب حسابداری، جدول سند، تاریخ شمسی، فهرست اسناد اخیر و وضعیت صف.
- راهنمای API، ماتریس پوشش پنل آفلاین و `IMPLEMENTATION_STATUS.md` هم‌راستا شدند.

## محدودیت‌های صریح

- این slice فقط ۱۰۰ سند اخیر را برای مشاهده cache می‌کند؛ برای سابقهٔ کامل اسناد، cursor لازم است.
- عملیات آنلاین‌وابسته مانند پرداخت بانکی، گزارش‌ها، دریافتنی، دریافت/پرداخت، برگشت سند، ثبت چک، حقوق و بستن سال آفلاین نیستند.
- snapshot باید پیش از قطع اینترنت دریافت شده باشد. دادهٔ جدیدتری که هنوز روی دستگاه نیست، در قطعی قابل مشاهده نخواهد بود.

## اعتبارسنجی

- `npm run typecheck`، ESLint هدفمند فایل‌های API/منطق آفلاین، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند.
- به درخواست کاربر، دیتابیس، تست integration و هر اتصال به دادهٔ تولید اجرا نمی‌شود.
- `cargo` و `rustc` در میزبان نصب نیستند؛ کامپایل Rust/Tauri انجام‌نشده است.
