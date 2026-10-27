# نمایش درآمد و هزینه‌های همگام‌نشده در تب بانک اپ Windows

## هدف

درآمد/هزینه‌ای که در تب حسابداری هنگام قطعی ثبت شده، تا دریافت receipt سمت سرور فقط یک فرمان محلی است. تب بانک باید بتواند همان فرمان‌ها را هنگام قطعی نشان دهد، اما نباید آن‌ها را به مانده یا گردش رسمی cacheشده اضافه کند؛ افزودن زودهنگام می‌تواند مبلغ تأییدنشده را واقعیت مالی جلوه دهد.

## رفتار پیاده‌سازی‌شده

- Rust store فرمان‌های `accounting/create_transaction` همان کسب‌وکار pairشده را که هنوز `synced` نشده‌اند، با سقف ۲۰۰ مورد و newest-first از SQLite رمز‌شده می‌خواند.
- خروجی محدود است به نوع، دسته، مبلغ، بانک/صندوق، شرح، تاریخ محلی، وضعیت، خطای sync و زمان ثبت. سایر فرمان‌های حسابداری و payload کامل سند به این فهرست نمی‌آیند.
- Tauri پاسخ تب بانک را با `localTransactions` کامل می‌کند؛ اگر هنوز snapshot بانکی دریافت نشده باشد، envelope محلی را برمی‌گرداند تا درخواست‌های pending نیز قابل مشاهده باشند.
- رابط بانک، موارد pending/conflict/rejected را در یک جدول جدا از snapshot رسمی، همراه با نام حساب بانکی در صورت cache و خطای retry نشان می‌دهد. اقلام همگام‌شده از این فهرست حذف می‌شوند و بعد از refresh در فهرست رسمی بانک دیده خواهند شد.
- متن رابط و راهنما روشن می‌کند که این ردیف‌ها جزو ماندهٔ رسمی نیستند. هیچ جمعی روی مانده‌ها یا سری گزارش‌های snapshot اعمال نمی‌شود.

## فایل‌های تغییرکرده

- `windows-bridge/offline-core/src/lib.rs`: query محدود `workspace_bank_local_transactions` روی outbox فعلی؛ migration ندارد.
- `windows-bridge/src-tauri/src/offline.rs`: افزودن `localTransactions` به snapshot بانکی محلی یا envelope بدون snapshot.
- `windows-bridge/ui/index.html` و `windows-bridge/ui/pos.js`: جدول وضعیت مالی محلی و تفکیک آن از ماندهٔ رسمی.
- `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/modules/offline-pos.md`, `docs/agents/README.md`, `docs/agents/module-capabilities.md`, `IMPLEMENTATION_STATUS.md`: نقشهٔ پوشش، محدودیت و راهنمای ماژول.

## محدودیت و بررسی

این فهرست فقط ۲۰۰ فرمان مالی همگام‌نشدهٔ اخیر را نشان می‌دهد و آرشیو همهٔ تراکنش‌های محلی یا cache مستقل ویرایش‌پذیر نیست. sync موفق آن را از فهرست بیرون می‌برد؛ تازگی ردیف رسمی وابسته به دریافت snapshot بانک است. این تغییر هیچ مبلغی را روی دادهٔ تولید اعمال نمی‌کند و schema یا migration دیتابیس ندارد.

`node --check windows-bridge/ui/pos.js` و `git diff --check` اجرا می‌شوند. در این محیط `cargo` و `rustc` نصب نیستند؛ بخش Rust/Tauri کامپایل نشده و اجرای GUI/Windows واقعی تأیید نشده است. PostgreSQL یا آزمون یکپارچه اجرا نمی‌شود.
