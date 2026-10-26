# دریافت snapshot منو برای اپ آفلاین پنل — ۲۰۲۶-۱۰-۲۶

## هدف

یک مسیر واقعی و محدود از دادهٔ سرور به SQLite رمز‌شدهٔ ویندوز بسازیم تا foundation عمومی snapshot محلی فقط قراردادِ ذخیره‌سازی نباشد. این مرحله آفلاین‌شدن کامل منو یا پنل را ادعا نمی‌کند.

## پیاده‌سازی

- `offline_workspace_snapshots` در migration افزایشی `0055_offline_workspace_snapshots.sql` ساخته شد. قید dataset فعلاً فقط `menu` را می‌پذیرد؛ rollback با وجود هر snapshot سرور متوقف می‌شود تا reference فرمان‌های محلی از بین نرود؛ نسخهٔ محلی دستگاه مستقل می‌ماند.
- `GET /api/offline-dashboard/snapshots/menu` از Bearer ترمینال موجود استفاده می‌کند. بعد از recheck ترمینال زیر قفل، کسب‌وکار معلق رد می‌شود و هر query با businessId همان token فیلتر می‌شود. endpoint فقط نام/برند عمومی، دسته‌ها، محصولات، میزها و اطلاعات قیمت مالیات/خدمات را برمی‌گرداند؛ `business.settings`، اطلاعات مشتری، کارمند، حساب بانکی و اسناد مالی صادر نمی‌شوند. feature `cashier_pos` لازم است و پاسخ `no-store` است.
- revision به ازای terminal و dataset با hash محتوای canonical‌شده جلو می‌رود. تغییر داده snapshot تازه می‌سازد؛ اگر محتوا ثابت باشد UUID و revision ثابت می‌مانند و مهلت اعتبار هفت‌روزه refresh می‌شود. تاریخچهٔ نسخه‌های تغییرکرده فعلاً pruning نمی‌شود؛ بعد از پیاده‌شدن replay باید retention بر اساس قدیمی‌ترین base revision فرمان معلق تعریف شود. ترتیب queryها صریح است تا hash بی‌دلیل تغییر نکند. سقف پاسخ ۴ مگابایت با محدودیت decode محلی سازگار است.
- worker ویندوز هر ۱۰ دقیقه (یا درخواست refresh ذخیره‌شده) endpoint را می‌خواند، business/dataset/schema/revision/UUID را بررسی می‌کند و با `save_workspace_snapshot` آن را در جدول رمز‌شده با DPAPI ذخیره می‌کند. وضعیت snapshot جدا از `health` صندوق POS در `offline_status` گزارش می‌شود. payload به UI JavaScript expose نشده؛ فقط index و وضعیت دریافت نمایان‌اند.
- اگر همان UUID/revision/content دوباره دریافت شود، SQLite حالا issuedAt و validUntil را نیز تمدید می‌کند؛ دریافت تکراری دیگر باعث می‌شود deadline محلی از سرور عقب بماند.
- متن صفحهٔ اصلی در `src/components/marketing/offline-desktop.tsx` نیز با عبارت محاوره‌ای اتصال اپ به منوی آنلاین هم‌تراز شد. پیام ثبت بی‌دردسر و آرامش آشپزخانه/صندوق‌دار حفظ شد؛ عبارت‌های شناسهٔ ثابت و محدودیت فنی قدیمی در صفحه وجود نداشتند.

## فایل‌های مرتبط

- `src/db/schema.ts`
- `src/db/migrations/0055_offline_workspace_snapshots.sql` و rollback آن
- `src/lib/offline-dashboard.ts`
- `src/app/api/offline-dashboard/snapshots/[dataset]/route.ts`
- `windows-bridge/offline-core/src/lib.rs`
- `windows-bridge/src-tauri/src/offline.rs`
- `src/components/marketing/offline-desktop.tsx`
- `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/module-capabilities.md`, `docs/agents/README.md`, `IMPLEMENTATION_STATUS.md`

## محدودیت و اعتبارسنجی

این snapshot هنوز در صفحهٔ محلی پنل مصرف نمی‌شود؛ endpoint برای `orders`, `customers`, `inventory`, `accounting`, HR و سایر datasetها وجود ندارد، command replay پیاده نشده و فقط POS آنلاین‌نشدهٔ نسخهٔ قبلی آفلاین است. migration روی PostgreSQL اجرا نمی‌شود تا rollout جداگانه انجام شود. مطابق محدودیت جاری تست خودکار و دیتابیس اجرا نشدند. `npx tsc --noEmit --incremental false` و ESLint فایل‌های TypeScript تغییرکرده موفق شدند و `git diff --check` بدون خطا بود. در این محیط `cargo` و `rustfmt` نصب/در PATH نبودند، بنابراین Rust compile و format اجرا نشد؛ worker تا بررسی Rust روی محیط دارای toolchain برای انتشار آماده محسوب نمی‌شود.


## نمایش محلی snapshot منو — ۲۰۲۶-۱۰-۲۶

- فرمان ثابت Tauri با نام `offline_workspace_menu` فقط dataset منو را از Store می‌خواند؛ token، تنظیمات محرمانه یا دادهٔ مالی expose نمی‌شود.
- تب «منوی محلی» به برنامه اضافه شد: جست‌وجوی نام/توضیح، فیلتر دسته، قیمت، موجودبودن، شماره revision و زمان/وضعیت انقضا را از snapshot رمز‌شده نشان می‌دهد. دادهٔ منقضی برای مشاهده باقی می‌ماند اما برچسب منقضی دارد. نما read-only است و هیچ command نوشتن ایجاد نمی‌کند.
- محدودیت: به‌روزرسانی محصول/دسته، server replay و بقیهٔ صفحات پنل هنوز پیاده نشده‌اند. احراز هویت نقش محلی پیش از فعال‌کردن هر تغییر داده لازم است.
- بررسی این گام: `node --check windows-bridge/ui/pos.js` موفق شد. TypeScript، route و schema در گام قبلی با `npx tsc --noEmit --incremental false` و ESLint هدفمند بررسی شده‌اند و در این گام TypeScript تغییر نکرد. `cargo` و `rustfmt` در محیط فعلی موجود نیستند؛ Rust compile و اجرای Windows ممکن نشد. تست خودکار و دیتابیس اجرا نشدند.


## Refresh دستی از برنامه — ۲۰۲۶-۱۰-۲۶

فرمان `offline_refresh` اکنون هم catalog فروش و هم workspace snapshot منو را علامت‌گذاری می‌کند. دکمهٔ «دریافت نسخهٔ تازه» در تب منوی محلی همین فرمان را اجرا می‌کند؛ محتوای آخرین snapshot تا دریافت موفق حفظ می‌شود و پیام `workspaceSync` نتیجهٔ آخرین تلاش را نشان می‌دهد. دکمهٔ «به‌روزرسانی منو» در POS نیز هر دو dataset را درخواست می‌کند. `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند؛ Rust و Windows همچنان به‌دلیل نبود toolchain اجرا نشده‌اند و تست خودکار/DB انجام نشد.


## Relay امن فرمان منو — ۲۰۲۶-۱۰-۲۶

- route `POST /api/offline-dashboard/commands` اضافه شد؛ scope آن به دو action منو محدود است و با snapshot پایهٔ همان دستگاه optimistic conflict را ثبت می‌کند. migration `0056` ledger/receipt idempotent و FK مرکب terminal/business دارد.
- worker Tauri فرمان‌های module `menu` را relay می‌کند، receipt موفق را در SQLite ثبت می‌کند و برای conflict/rejected/transient حالت جدا دارد. actor از مدیر جفت‌کنندهٔ دستگاه تعیین می‌شود.
- UI فعلی فقط snapshot را می‌خواند و هیچ command را enqueue نمی‌کند؛ پس ویرایش منو هنگام آفلاین هنوز قابل استفاده نیست. برای همین role محلی یا mutation UI جدیدی expose نشد.
- اعتبارسنجی بعد از این تغییر باید شامل typecheck، lint، `node --check` و `git diff --check` باشد؛ تست/DB اجرا نمی‌شود. `cargo`/`rustfmt` در محیط موجود نیستند، پس Rust compile قابل تأیید نیست.
