# وضعیت عملیاتی میزها در حالت آفلاین

## تغییر

برنامهٔ Windows یک تب «وضعیت میزها» دارد. فهرست، زون، ظرفیت و وضعیت عملیاتی از snapshot رمز‌شدهٔ `menu` خوانده می‌شوند؛ بنابراین اپراتور در قطع اینترنت به آخرین وضعیت دریافت‌شده دسترسی دارد. با PIN مدیر محلی می‌تواند transitionهای موجود را درخواست کند: آمادهٔ سرویس به نظافت/خارج از سرویس، نظافت به آمادهٔ سرویس/خارج از سرویس و خارج از سرویس به آمادهٔ سرویس. علت خارج از سرویس اجباری است. درخواست در outbox رمز‌شده می‌ماند و وضعیت pending در رابط از وضعیت قطعی سرور جدا نمایش داده می‌شود.

## اعتبارسنجی و همگام‌سازی

فرمان با UUID، شناسه/نسخهٔ snapshot میز، وضعیت مورد انتظار و مقصد در `POST /api/offline-dashboard/commands` ارسال می‌شود. سرور در transaction مالکیت terminal و کسب‌وکار، entitlement صندوق، snapshot و transition را دوباره بررسی می‌کند؛ ردیف میز را قفل می‌کند و وجود سفارش باز پرداخت‌نشده یا رزرو درخواست‌شده/تأییدشدهٔ فعال/آینده را کنترل می‌کند. به‌روزرسانی `dining_tables.operational_status` و ثبت `table_status_events` با ledger فرمان اتمی هستند. فرمان تکراری با همان UUID و payload همان پاسخ قبلی را می‌دهد. conflict وضعیت سرور را overwrite نمی‌کند و snapshot تازه درخواست می‌شود.

در رویداد سرور `actorId` صادرکنندهٔ terminal است؛ PIN محلی تنها در دستگاه اعتبارسنجی می‌شود و شناسهٔ مستقل اپراتور را اثبات نمی‌کند. هنگام sync سرور منبع حقیقت است. رابط آفلاین occupancy و رزرو زنده را تخمین نمی‌زند.

## فایل‌ها و قرارداد داده

- منطق parser و transition: `src/lib/offline-table-status-core.ts` و `src/lib/offline-tables.ts`.
- route dispatch: `src/lib/offline-dashboard.ts`؛ مسیر HTTP همان `POST /api/offline-dashboard/commands` است.
- اپ Windows: `windows-bridge/offline-core/src/lib.rs`, `windows-bridge/src-tauri/src/offline.rs`, `windows-bridge/src-tauri/src/main.rs`, `windows-bridge/ui/index.html`, `windows-bridge/ui/pos.js`, `windows-bridge/ui/style.css`.
- migration `0078_offline_table_status.sql` module/action را به allowlist server می‌افزاید. down migration اگر history فرمان میز وجود داشته باشد rollback را متوقف می‌کند. migration در این توسعه اجرا نشده است.

## محدودیت

این vertical slice مدیریت آفلاین وضعیت عملیاتی است؛ ایجاد/ویرایش میز و zone، طراحی QR، occupancy زنده، رزرو جدید، سفارش‌گیری از میز و تجمیع وضعیت بین چند صندوق را پیاده نمی‌کند. snapshot باید پیش از قطعی دریافت شده و هنوز معتبر باشد؛ در snapshot منقضی فقط مشاهده مجاز است.

## راستی‌آزمایی

در این نوبت فقط typecheck، بررسی syntax فایل JavaScript و `git diff --check` انجام می‌شود. PostgreSQL، migration، integration test و build برنامهٔ Windows اجرا نمی‌شوند؛ toolchain Rust در محیط در دسترس نیست.
