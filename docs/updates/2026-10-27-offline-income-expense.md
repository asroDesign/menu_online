# ثبت درآمد و هزینه در اپ Windows هنگام قطعی اینترنت

## هدف و نقش

این vertical slice به تب حسابداری اپ Windows امکان می‌دهد درآمد یا هزینهٔ دستی را هنگام قطع اینترنت روی همان دستگاه ثبت کند. این قابلیت، گردش‌های ثبت‌شده در تب بانک را همچنان فقط‌خواندنی نگه می‌دارد و ادعای آفلاین بودن کامل حسابداری/بانک، انتقال وجه یا ارتباط بانکی ندارد.

## رابط و جریان داده

- فرم محلی نوع درآمد/هزینه، دسته، مبلغ تومان، حساب درآمد/هزینه، محل وجه، تاریخ شمسی، شرح اختیاری و PIN مدیر را می‌گیرد.
- حساب‌های درآمد و هزینه از snapshot `accounting` فیلتر می‌شوند؛ فقط حساب فعال با نوع و ماهیت متناسب قابل انتخاب است. حساب‌های بانکی مجاز نیز در همان snapshot با id، نام و نام بانک می‌آیند؛ شماره حساب برای این فرم دریافت نمی‌شود. گزینهٔ بدون بانک به صندوق نقد وصل است.
- Tauri/Rust PIN را روی دستگاه بررسی می‌کند؛ مقدار PIN هیچ‌گاه در command payload قرار نمی‌گیرد. بعد از اعتبارسنجی amount، تاریخ سال مالی، حساب و بانک در برابر snapshot جاری و غیرمنقضی، فرمان UUIDدار `accounting/create_transaction` در SQLite رمزگذاری‌شده و در تراکنش محلی ثبت می‌شود.
- UI ردیف‌های `create_transaction` را از خلاصهٔ فرمان‌ها می‌خواند و مبلغ، نوع، دسته، شرح و وضعیت pending/conflict/rejected/synced را نشان می‌دهد. داده تا receipt سرور، فقط درخواست محلی است و در گزارش رسمی یا projection حساب‌های بانکی وارد نمی‌شود.

## اعمال سمت سرور

- مسیر فعلی `POST /api/offline-dashboard/commands` فرمان `module=accounting` را dispatch می‌کند؛ route عمومی یا دور زدن auth اضافه نشده است.
- سرور schema سخت‌گیرانه، idempotency UUID، business/terminal و feature `cashier_pos`+`accounting` را بررسی می‌کند. snapshot همان terminal، dataset و revision و TTL باید معتبر باشد.
- سال مالی باید در snapshot باز باشد. حساب انتخابی باید فعال و از نظر `type`/`nature` با درآمد/هزینه متناسب باشد؛ حساب تفصیلی، والد معین متناسب می‌خواهد. حساب بانکی نیز هم از snapshot و هم با query tenant-scoped دوباره بررسی می‌شود.
- سرور ردیف `transactions` را با `sourceRef=offline-command:<uuid>` درج می‌کند و از helper تراکنشی حسابداری برای سند دوبل استفاده می‌کند؛ در صورت نیاز حساب تفصیلی بانک در همان transaction ساخته می‌شود. سند از `sourceRef=tx:<transaction id>` استفاده می‌کند. `offline_workspace_commands` نیز در همان transaction receipt نتیجه را نگه می‌دارد. بنابراین transaction، سند/حساب بانک و ledger یا همگی commit می‌شوند یا همگی rollback.
- سقف مبلغ `2,147,483,647` تومان با نوع عددی ستون `transactions.amount` هماهنگ است؛ تاریخ باید داخل سال مالی باز باشد.

## فایل‌های تغییرکرده

- `src/lib/accounting.ts`: helper `postManualTxInTransaction` برای استفادهٔ امن از transaction فراخواننده و ایجاد تفصیلی بانک.
- `src/lib/offline-accounting.ts`: parser و اعمال idempotent فرمان create_transaction، درج ردیف و سند در تراکنش مشترک.
- `src/lib/offline-dashboard.ts`: افزودن حداکثر ۵۰۰ حساب بانکیِ لازم به snapshot حسابداری.
- `windows-bridge/offline-core/src/lib.rs`: اعتبارسنجی PIN، نوع و ماهیت حساب، بانک و تاریخ؛ enqueue رمزگذاری‌شده و نمایش payload محدود فرمان در صف.
- `windows-bridge/src-tauri/src/offline.rs`, `windows-bridge/src-tauri/src/main.rs`: ثبت فرمان Tauri.
- `windows-bridge/ui/index.html`, `windows-bridge/ui/pos.js`: فرم، فیلتر حساب‌ها/بانک‌ها، صف و خطاهای فرم.
- `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/modules/offline-pos.md`, `docs/agents/README.md`, `docs/agents/module-capabilities.md`, `IMPLEMENTATION_STATUS.md`: وضعیت و راهنمای بازسازی.

## سازگاری و محدودیت

تغییر schema یا migration ندارد. این قابلیت به وجود حساب درآمد/هزینه و سال مالی از snapshot وابسته است. اگر حساب یا بانک پس از snapshot تغییر کرده باشد، سرور فرمان را conflict/reject می‌کند و ثبت محلی به‌عنوان ثبت رسمی معرفی نمی‌شود. گزارش بانک و سودوزیان رسمی پس از sync و snapshot تازه به‌روز می‌شوند. برگشت سند، CRUD بانک، انتقال وجه، چندخطی بودن یک تراکنش، تخصیص چند روش پرداخت و تسویه کارتخوان در این تغییر نیست.

## بررسی

`npm run typecheck`، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند. بررسی `cargo fmt` و `cargo check` اجرا نشد چون در محیط `cargo` و `rustc` نصب/در دسترس نیستند؛ بنابراین بخش Rust/Tauri از نظر کامپایل تأیید نشده است. مطابق محدودیت صریح مالک محصول، به دیتابیس یا دادهٔ تولید وصل نشدیم و آزمون یکپارچهٔ PostgreSQL اجرا نشد. موفقیت TypeScript به‌تنهایی تست تراکنش، پنل یا دستگاه Windows محسوب نمی‌شود.
