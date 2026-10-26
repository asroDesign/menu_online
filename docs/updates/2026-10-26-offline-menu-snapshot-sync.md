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
