# مطالبات و دریافت نقدی در اپ Windows آفلاین

## رفتار اضافه‌شده

- تب «مطالبات» دفتر دریافتنی tenant جاری را از snapshot رمز‌شده نشان می‌دهد؛ جست‌وجو، مانده، سررسید و صورت‌حساب شامل ثبت اولیه، دریافت‌ها و برگشت‌های ثبت‌شده را بدون اینترنت می‌توان دید.
- سرور تا ۵۰۰ طلب، ۵۰۰۰ پرداخت و ۵۰۰۰ برگشت را در snapshot محدود ۴MB صادر می‌کند. اگر داده از سقف بگذرد، به‌جای تحویل فهرست ناقص، 413 برمی‌گرداند. cache هفت‌روزه است؛ نسخهٔ منقضی فقط خواندنی می‌شود.
- مدیر با PIN محلی فقط می‌تواند دریافت نقدی را در حد ماندهٔ snapshot در صف بگذارد. یک دریافت pending برای یک طلب مانع ثبت دریافت دوم تا همگام‌سازی و گرفتن snapshot تازه است؛ مقدار پیش‌بینی‌شده در UI رسمی یا قطعی معرفی نمی‌شود.
- route جدید `POST /api/offline-dashboard/receivables` فرمان UUIDدار را با Bearer terminal می‌گیرد. سرور کسب‌وکار، مجوزهای `cashier_pos` و `accounting`، مالکیت snapshot، revision، انقضا و ماندهٔ مورد انتظار را بررسی می‌کند. سپس زیر قفل ردیف، ماندهٔ واقعی را از پرداخت‌ها و برگشت‌ها دوباره محاسبه می‌کند؛ تعارض پاسخ 409 است.
- helper مشترک `recordReceivablePaymentInTransaction` پرداخت نقدی، تراکنش درآمد، سند دوطرفه، رویداد طلب و command ledger را در یک transaction می‌نویسد. اگر وصول کل طلب سفارش باشد، وضعیت پرداخت سفارش نیز در همان تراکنش به‌روزرسانی می‌شود. retry با UUID و payload یکسان نتیجهٔ ثبت قبلی را برمی‌گرداند.
- migration `0064_offline_receivables.sql` dataset و action جدید را به allowlist پایگاه داده اضافه می‌کند. migration down قبل از rollback، وجود snapshot یا history مطالبات را بررسی می‌کند و با دادهٔ موجود عمداً متوقف می‌شود.

## فایل‌های اصلی

- `src/lib/offline-dashboard.ts`: ساخت tenant-scoped snapshot مطالبات.
- `src/lib/offline-receivables.ts`, `src/app/api/offline-dashboard/receivables/route.ts`: اعتبارسنجی فرمان، کنترل مانده، وصول و idempotency.
- `src/lib/receivables.ts`: helper تراکنشی مشترک برای مسیر online و offline.
- `windows-bridge/offline-core/src/lib.rs`: snapshot محلی، کنترل PIN و صف وصول نقدی.
- `windows-bridge/src-tauri/src/offline.rs`, `windows-bridge/src-tauri/src/main.rs`: worker sync و فرمان‌های Tauri.
- `windows-bridge/ui/index.html`, `windows-bridge/ui/pos.js`: فهرست، صورت‌حساب و فرم دریافت نقدی.
- `src/db/migrations/0064_offline_receivables.sql`: allowlist dataset/command.

## مرزهای قابلیت

پرداخت کارتخوان، بانک و انتقال در حالت آفلاین ثبت نمی‌شود؛ ایجاد طلب دستی، تغییر سررسید، برگشت دریافت و گزارش مالی نیز هنوز آنلاین هستند. فهرست به ۵۰۰ طلب و رخدادهای پرداخت به ۵۰۰۰ ردیف محدود است؛ صفحه‌بندی این دفتر هنوز پیاده نشده است. وضعیت رسمی تا sync موفق و دریافت مجدد snapshot تغییر نمی‌کند. migration دیتابیس اجرا نشده است.

## بررسی

`npx tsc --noEmit --incremental false`، ESLint هدفمند برای route/helperهای TypeScript، `node --check windows-bridge/ui/pos.js` و `git diff --check` اجرا شدند. تست دیتابیس/integration/migration اجرا نشدند. `cargo` و `rustc` در محیط در دسترس نیستند، بنابراین compile Rust/Tauri انجام نشده است. هیچ درگاه یا پیامک واقعی فراخوانی نشده است.
