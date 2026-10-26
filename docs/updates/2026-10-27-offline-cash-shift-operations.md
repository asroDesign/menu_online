# عملیات آفلاین شیفت صندوق

## کاربرد و نقش

این تغییر باز و بسته‌کردن شیفت صندوق را در اپلیکیشن Windows، هنگام قطع اینترنت، به outbox رمزگذاری‌شدهٔ محلی اضافه می‌کند. هدف این است که ثبت فروش و گزارش پایان شیفت پس از اتصال، با زمان‌بندی درست به همان شیفت متصل شوند.

## مسیر کاربر

1. دستگاه باید قبلاً به کسب‌وکار متصل شده باشد، PIN مدیر محلی داشته باشد و snapshot معتبر `cash_shifts` را دریافت کرده باشد.
2. مدیر می‌تواند با واردکردن موجودی آغاز و PIN محلی، شیفت را باز کند. درخواست همراه زمان UTC دستگاه و توضیح در SQLite رمزگذاری‌شده صف می‌شود.
3. رابط، شیفت محلی را تا دریافت پاسخ سرور با برچسب «در صف» نشان می‌دهد. Worker فرمان بازکردن را پیش از sync فروش‌های محلی می‌فرستد.
4. مدیر می‌تواند موجودی پایان و توضیح را ثبت کند. فرمان بستن در outbox می‌ماند تا همهٔ فروش‌های pending و conflict تعیین‌تکلیف شوند؛ سپس Worker آن را می‌فرستد.
5. تا دریافت snapshot جدید پس از فرمان بستن، ثبت فروش جدید روی دستگاه متوقف است. این محدودیت مانع می‌شود فروش‌های بعد از بسته‌شدن به شیفت قبلی نسبت داده شوند یا چند چرخه روی یک snapshot با ترتیب مبهم صف شوند.

## قرارداد و کنترل سرور

- ماژول فرمان: `cash_shifts`; عملیات: `open`, `close`; dataset پایه: `cash_shifts`.
- هر فرمان UUID، terminal/business، snapshot id/revision و payload محدود دارد. سرور terminal، وضعیت کسب‌وکار، entitlement صندوق، snapshot معتبر، hash idempotency و وضعیت واقعی شیفت را در transaction بازبینی می‌کند.
- بازکردن از قید یکتای پایگاه‌داده برای حداکثر یک شیفت باز استفاده می‌کند. در رقابت هم‌زمان، فرمان دوم conflict می‌شود.
- بستنِ شیفت موجود باید با ردیف باز همان کسب‌وکار و `openedAt` مورد انتظار تطبیق کند. بستن شیفتی که در همین دستگاه به‌صورت آفلاین باز شده، به رسید idempotent فرمان open همان terminal و snapshot وصل می‌شود.
- زمان رخداد محلی حفظ می‌شود تا فروش‌های همگام‌شده با شرط پوشش زمانی شیفت مرتبط شوند؛ زمان دور از snapshot یا بیش از ۵ دقیقه در آینده conflict می‌شود.
- زمان DB transaction باز نگه داشته نمی‌شود مگر برای عملیات محلی PostgreSQL؛ درخواست شبکه بیرون از transaction انجام می‌شود.
- migration `0074_offline_cash_shift_actions.sql` فقط قیدهای allowlist جدول فرمان را گسترش می‌دهد. migration برگشت در صورت وجود سابقهٔ فرمان `cash_shifts` متوقف می‌شود تا audit history حذف نشود.

## فایل‌های تغییرکرده

- `windows-bridge/offline-core/src/lib.rs`: اعتبارسنجی PIN، صف باز/بستن، projection محلی، ترتیب فرمان‌ها، و جلوگیری از فروش پس از صف بستن.
- `windows-bridge/src-tauri/src/offline.rs` و `main.rs`: فرمان Tauri و worker دو مرحله‌ای باز-فروش-بستن.
- `windows-bridge/ui/index.html`, `pos.js`, `style.css`: فرم واکنش‌گرا، نمایش وضعیت صف، خطای تعارض و عملیات snapshot.
- `src/lib/offline-dashboard.ts`: parser محدود و اعمال idempotent در transaction.
- `src/db/migrations/0074_offline_cash_shift_actions.sql` و فایل down: allowlist با محافظت rollback.
- `docs/agents/modules/offline-full-dashboard.md`: ماتریس قابلیت و قرارداد به‌روز شد.

## بررسی و محدودیت اعتبارسنجی

- migration روی هیچ دیتابیسی اجرا نشده است.
- تست database/integration اجرا نشده است؛ مسیر انتخابی فقط بازبینی کد و compile check است.
- این محیط ابزارهای `cargo`/`rustc`/`rustfmt` ندارد؛ بنابراین compile کد Rust/Tauri این بخش قابل اجرا نیست. TypeScript، JavaScript، و diff باید پیش از merge بررسی شوند.
