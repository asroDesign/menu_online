# ویرایش دستور تهیه در منوی محلی Windows — ۲۰۲۶-۱۰-۲۷

## هدف

کاربر دارای مجوز دستور تهیه بتواند هنگام قطع اینترنت، recipe محصول همگام‌شده را در اپ Windows اصلاح کند؛ تغییر باید روی همان دستگاه ثبت شود و پس از اتصال با نسخهٔ جاری سرور مقایسه شود.

## رفتار پیاده‌شده

- snapshot منو فقط برای entitlement `recipes` خطوط دستور تهیه و مشخصات حداقلی مواد را حمل می‌کند: شناسه، نام، واحد انبار و مصرف، ضریب تبدیل، فعال‌بودن و ردیابی موجودی. بهای خرید مواد در این snapshot نیست.
- فرم «دستور تهیه» برای محصولات دارای شناسهٔ سرور، ماده، مقدار مصرف به‌ازای یک محصول و درصد ضایعات را ویرایش می‌کند. مواد فقط از snapshot همین کسب‌وکار انتخاب می‌شوند؛ مادهٔ غیرفعال فقط برای حفظ recipe قبلی قابل نگه‌داشتن است.
- PIN مدیر محلی لازم است. Rust خطوط تکراری و بازهٔ نامعتبر را رد و command رمز‌شده با UUID و revision snapshot را در outbox ثبت می‌کند. UI تغییر pending را نشان می‌دهد؛ تا رسید sync و snapshot تازه، POS مرکزی تغییر را اعمال‌شده تلقی نمی‌کند.
- سرور entitlement و tenant را دوباره بررسی می‌کند، recipe جاری را با baseline می‌سنجد و نام/واحد/ضریب تبدیل/فعال‌بودن/ردیابی هر ماده را تطبیق می‌دهد. اختلاف به conflict/rejected می‌رود؛ جایگزینی خطوط recipe و command ledger در transaction serializable ثبت می‌شوند.
- migration افزایشی `0077_offline_menu_recipes.sql` action `menu/set_recipe` را به allowlist ledger اضافه می‌کند. نسخهٔ down در صورت وجود سابقهٔ فرمان از rollback جلوگیری می‌کند.

## دسترسی آفلاین به تاریخچهٔ سفارش

الزام کاربر برای بازکردن تاریخچه و جزئیات سفارش در قطعی اینترنت دوباره با کد تطبیق شد. فهرست صفحه‌بندی‌شده و اقلام/مبالغ تاریخی سفارش‌های دریافت‌شده در SQLite رمز‌شده است و مودال جزئیات از همین دادهٔ محلی باز می‌شود؛ برای بازکردن آن شبکه لازم نیست. سفارش‌های قدیمی تنها پس از پایان backfill آنلاین در دستگاه حاضرند، پس برای دسترسی به کل سابقه باید همگام‌سازی اولیه پیش از قطعی تکمیل شده باشد. در این تغییر مسیر تاریخچه بازنویسی نشده است.

## فایل‌های مرتبط

- `src/lib/offline-dashboard.ts`
- `windows-bridge/offline-core/src/lib.rs`
- `windows-bridge/src-tauri/src/offline.rs`, `main.rs`
- `windows-bridge/ui/index.html`, `pos.js`, `style.css`
- `src/db/migrations/0077_offline_menu_recipes.sql` و `.down.sql`
- راهنماهای `docs/agents/modules/recipes.md`, `offline-full-dashboard.md`, `docs/agents/core-pages/api-contract-map.md` و `docs/agents/module-capabilities.md`

## محدودیت‌ها

این vertical slice فقط دستور تهیهٔ محصولی را ویرایش می‌کند که قبلاً در snapshot منو بوده است. ایجاد هم‌زمان محصول و recipe، مادهٔ تازه‌ساخته‌شده، برآورد بهای جاری آفلاین، رسانه، تنوع قیمت و تعارض هم‌زمان چند دستگاه پشتیبانی نمی‌شوند. فروش آفلاین و کسر موجودی بر اساس recipe تأییدشدهٔ سرور و projection محلی فعلی انجام می‌شود؛ recipe pending تا sync قطعی نیست.

`npm run typecheck -- --incremental false`، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند. هشدار محیط: npm 11.3.0 با Node 18.17.1 سازگاری رسمی ندارد، هرچند typecheck موفق بود. `cargo` و `rustc` در محیط نصب نیستند؛ بنابراین build Rust/Tauri تأیید نشده است. طبق محدودیت کاربر، تست‌ها، دیتابیس و migration اجرا نشدند؛ migration فقط از نظر ترتیب و rollback محافظه‌کارانه بازبینی شد.
