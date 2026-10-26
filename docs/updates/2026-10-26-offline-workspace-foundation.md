# بنیاد محلی اپ ویندوزی پنل کامل — ۲۰۲۶-۱۰-۲۶

## مسئله

SQLite پل Windows قبلاً فقط تنظیمات دستگاه، فروش POS و کارهای چاپ را نگه می‌داشت. برای خارج‌شدن از وابستگی صرف به `/api/offline-pos/*`، ماژول‌های دیگر به یک قرارداد پایدار برای snapshot و ثبت فرمان نیاز دارند. هدف این مرحله ساخت قرارداد و ذخیره‌ساز محلی است؛ این گزارش ادعای آفلاین‌شدن صفحه‌های فعلی را نمی‌کند.

## تغییرات

- `windows-bridge/offline-core/src/lib.rs`
  - مهاجرت محلی از user_version=1 به ۲ اضافه شد. دیتابیس با نسخه بالاتر از برنامه رد می‌شود و جداول فروش/چاپ موجود حذف نمی‌شوند.
  - `workspace_snapshots` با tenant، نام dataset از allowlist، revision، schemaVersion، UUID، بازه اعتبار و payload حفاظت‌شده اضافه شد. tenant از pairing خوانده می‌شود؛ tenant ناهماهنگ، revision عقب‌رفته، payloadهای متفاوت با revision برابر، schema ناشناخته، مهلت نامعتبر، payload غیر object/array و payload بزرگ‌تر از ۱۰MB رد می‌شود. snapshot قدیمی تا ثبت کامل snapshot جدید باقی می‌ماند.
  - `workspace_commands` برای فرمان‌های domain با UUID یکتا، ترتیب محلی، tenant، module/action محدودشده، base dataset/snapshot/revision، payload حفاظت‌شده، تعداد تلاش، retry و وضعیت‌های pending/conflict/rejected/synced اضافه شد. اعتبار snapshot پایه در تراکنش Immediate بازبینی می‌شود؛ claim با تراکنش Immediate و lease ۱۲۰ ثانیه‌ای duplicate worker را محدود می‌کند. enqueue تکراری با همان شناسه و محتوای یکسان idempotent است؛ شناسه با محتوای متفاوت رد می‌شود. سقف هر فرمان ۱MB و صف ۵۰٬۰۰۰ فرمان است؛ چاپ و پیجر به‌عنوان side effect در این outbox نیستند.
  - اطلاعات خلاصه برای status پل افزوده شد.
- `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/module-capabilities.md`, `docs/agents/README.md` و `IMPLEMENTATION_STATUS.md`
  - تفاوت foundation محلی با ماژول عملیاتی و وضعیت کامل آفلاین صریح شد.

## مرز امنیتی و محدودیت

روی Windows، `blob()` به DPAPI متصل به حساب کاربری Windows تکیه می‌کند. buildهای غیر Windows payload را رمز نمی‌کنند و فقط برای توسعه/کامپایل‌اند. registry عملیات صرفاً اجازهٔ نگهداری محلی می‌دهد و مجوز سرور برای اجرای آن نیست.

در این مرحله endpoint سرور برای تولید snapshotهای پنل ساخته نشده، Tauri worker outbox را replay نمی‌کند، دادهٔ Next API از SQLite خوانده نمی‌شود و هیچ module UI به این API وصل نشده است. بنابراین هنگام قطع اینترنت، جز صندوق POS نسخهٔ ۰٫۲، صفحه‌های پنل همچنان در دسترس/قابل ویرایش آفلاین نیستند. قبل از هر replay باید handlerهای server-side برای هر فرمان، tenant/actor/feature/permission، idempotency، transaction، side effect و سیاست conflict را جدا پیاده‌سازی کرد.

## بررسی

- `rustfmt --check` برای فایل‌های Rust تغییرکرده و `git diff --check` موفق شدند.
- `cargo check --locked --offline` به‌علت نبودن crate `rusqlite` در cache محیط متوقف شد. تلاش برای دریافت وابستگی‌ها از crates.io با timeout شبکه مواجه شد و متوقف گردید؛ build موفق ادعا نمی‌شود.
- به درخواست قبلی کاربر، تست تازه یا اجرای test suite انجام نشد. migration روی دیتابیس واقعی اجرا نشد؛ نصب و اجرای Windows هم در این مرحله انجام نشده است.

## فایل‌ها

`windows-bridge/offline-core/src/lib.rs`, `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/module-capabilities.md`, `docs/agents/README.md`, `IMPLEMENTATION_STATUS.md`, `docs/updates/2026-10-26-offline-workspace-foundation.md`.
