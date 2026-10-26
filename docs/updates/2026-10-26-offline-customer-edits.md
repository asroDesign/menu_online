# تکمیل CRM محلی در اپ ویندوز آفلاین — ۲۰۲۶-۱۰-۲۶

## هدف

در زمان قطع اینترنت، کارمند مجاز باید بتواند فهرست مشتریانی را که قبلاً روی دستگاه دریافت شده مرور کند و برای مراجعهٔ حضوری، مشتری تازه یا اصلاح محدود نام را ثبت کند. این کار نباید شمارهٔ خام را به‌عنوان اثبات هویت مشتری تلقی کند و نباید امتیاز، کیف پول یا رضایت پیامک را در حالت آفلاین تغییر دهد.

درخواست جداگانهٔ دسترسی به سفارش‌های قبلی نیز با کد موجود تطبیق شد: آرشیو سفارش‌های سرور به‌صورت صفحه‌بندی‌شده در SQLite رمز‌شدهٔ اپ Windows ذخیره می‌شود؛ آخرین ۱۰۰ سفارش مرتب تازه می‌شود و backfill سوابق قدیمی‌تر هنگام اتصال ادامه دارد. تاریخچه و جزئیات cacheشده از خود دستگاه باز می‌شوند. کل تاریخچه تنها وقتی در قطعی کامل در دسترس است که backfill پیش از قطعی پایان یافته باشد. برای این رفتار موجود تغییر کد لازم نبود.

## رفتار افزوده‌شده

- تب مشتریان اکنون ساخت مشتری محلی و اصلاح نام مشتری موجود را ارائه می‌دهد؛ هر دو با PIN مدیر محلی تأیید می‌شوند و فرمان در outbox رمز‌شده می‌ماند.
- ساخت مشتری فقط نام و موبایل ایران را می‌پذیرد. ارقام فارسی/عربی و قالب‌های `+98` یا `98` به `09xxxxxxxxx` نرمال می‌شوند. `smsOptIn` صریحاً false ثبت می‌شود؛ ورود شماره توسط کارمند، رضایت بازاریابی نمی‌سازد.
- اصلاح مشتری فعلاً فقط نام است. تغییر موبایل، امتیاز، موجودی کیف پول، referral و رضایت پیامک در UI و validator رد می‌شوند. مصرف یا افزودن امتیاز/اعتبار با این مسیر ممکن نیست.
- ردیف ساخته‌شده تا sync سرور به شکل «محلی/در صف» نمایش داده می‌شود. conflict و رد سرور در فهرست قابل مشاهده‌اند. موفقیت و conflict باعث درخواست snapshot تازه می‌شوند.
- سرور در transaction، دستگاه فعال، tenant، entitlementهای `cashier_pos` و `loyalty`، TTL/revision snapshot، UUID/hash فرمان، یکتایی موبایل در tenant و دادهٔ مبنای اصلاح را بازبینی می‌کند. mutation مشتری و ledger فرمان اتمی‌اند.
- اگر ثبت فروش آفلاین پیش از فرمان مشتری همان شماره و همان نام را روی سرور ساخته باشد، create به آن رکورد idempotently resolve می‌شود. شمارهٔ همسان با نام متفاوت یا اطلاعات تغییرکرده پس از snapshot به conflict می‌رود.
- migration `0071_offline_customer_edits.sql` actionهای `customers/create|update` را می‌افزاید. همان migration actionهای `cheques/register|set_status` را نیز مجاز می‌کند، چون handler موجود چک‌ها از همان جدول فرمان استفاده می‌کند اما constraint قبلی آن را نمی‌پذیرفت. rollback در صورت وجود command history مشتری متوقف می‌شود و پشتیبانی چک را نگه می‌دارد.

## فایل‌ها و قراردادها

- `src/lib/offline-customer-core.ts`: parser خالص، allowlist فیلدها، نرمال‌سازی نام و موبایل.
- `src/lib/offline-dashboard.ts`: handler سروری tenant-scoped برای create/update، مقایسهٔ snapshot و ledger اتمی.
- `windows-bridge/offline-core/src/lib.rs`: اعتبارسنجی ورودی محلی، الزام PIN و درج command رمز‌شده؛ خواندن وضعیت فرمان‌های مشتری.
- `windows-bridge/src-tauri/src/offline.rs`, `main.rs`: فرمان‌های Tauri برای خواندن CRM، ثبت مشتری و اصلاح نام و refresh پس از sync/conflict.
- `windows-bridge/ui/index.html`, `pos.js`, `style.css`: فرم ویرایش/ساخت، وضعیت محلی و sync، نمایش conflict و overlay تغییرات روی snapshot.
- `src/db/migrations/0071_offline_customer_edits.sql` و `.down.sql`: allowlist محدود دیتابیس و مسیر rollback محافظه‌کارانه.
- `tests/offline-customer-command.test.cjs`: آزمون parser و محدودیت‌های payload.
- راهنماهای همگام‌شده: `docs/agents/modules/offline-pos.md`, `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/core-pages/api-contract-map.md`, `docs/agents/module-capabilities.md`, `docs/agents/README.md`.

## بررسی و محدودیت

- `node --test tests/offline-customer-command.test.cjs tests/offline-modifier-groups.test.cjs`: موفق، ۵ آزمون.
- `node --check windows-bridge/ui/pos.js`: موفق.
- ESLint هدفمند روی فایل‌های TypeScript/JavaScript تغییرکرده: موفق.
- `npx tsc --noEmit --incremental false`: موفق.
- `git diff --check`: موفق.
- Rust/Tauri compile انجام نشد: `cargo` و `rustc` در محیط موجود نیستند. migration روی دیتابیس اجرا نشده و تست یکپارچه/PostgreSQL اجرا نشده است. migration تازه تا زمان اعمال آن روی DB نصب‌شده قابلیت سروری مشتری را فعال نمی‌کند.
- تاریخچهٔ کامل سفارش باید پیش از قطعی روی دستگاه backfill شده باشد. سفارش‌هایی که هنوز cache نشده‌اند در زمان قطع شبکه از سایت قابل بازیابی نیستند.
- این تغییر فقط یک بخش از تبدیل کامل پنل رستوران به اپ آفلاین است؛ ماتریس پوشش و بخش‌های هنوز آنلاین‌محور در [نقشهٔ اپ آفلاین](../agents/modules/offline-full-dashboard.md) پیگیری می‌شوند.
