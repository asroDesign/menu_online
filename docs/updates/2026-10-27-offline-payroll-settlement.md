# صف آفلاین تسویهٔ حقوق و دستمزد در Windows

تاریخ: ۲۰۲۶-۱۰-۲۷

## هدف و رفتار

تب حقوق Windows از آرشیو/چاپ فقط‌خواندنی به ثبت محدود درخواست تسویه نیز گسترش یافت. مدیر، پس از بازکردن آرشیو با PIN محلی، یک لیست قطعی را انتخاب می‌کند و پرداخت خالص حقوق، حق بیمه یا مالیات حقوق را به‌صورت نقدی از صندوق یا از حساب بانکی انتخاب‌شده صف می‌کند. فرم مبلغ قابل ویرایش ندارد: عددی که دیده می‌شود از snapshot محلی دوره محاسبه می‌شود و سرور هنگام همگام‌سازی عدد جاری را دوباره از `payrollItems` محاسبه می‌کند. UI به‌صراحت می‌گوید تا دریافت رسید سرور پرداخت قطعی نیست.

هر پرداخت، PIN مدیر را هنگام ثبت دوباره می‌خواهد. snapshot منقضی، دورهٔ پیش‌نویس، مبلغ صفر، پرداخت ثبت‌شده، درخواست pending/synced/conflict همان دوره یا حساب بانکی خارج از snapshot مانع صف جدید می‌شود. کاربر منبع وجه را بین نقد و بانک انتخاب می‌کند؛ اگر بانک باشد فقط شناسه و نام حساب همان کسب‌وکار در snapshot لازم است. شمارهٔ حساب/شبا و PIN محلی در command ذخیره نمی‌شوند.

## مسیر سرور و یکپارچگی مالی

فرمان `module=payroll`, `action=settlement` روی endpoint عمومی commandهای پنل آفلاین می‌رود. parser فیلدهای اضافه و نوع‌های نامعتبر را رد می‌کند؛ payload مبلغ پرداخت ندارد. handler سرور entitlement صندوق و payroll، مالکیت terminal/tenant، کسب‌وکار فعال، UUID idempotency، snapshot همان terminal و revision معتبر، انقضا، دورهٔ حاضر در snapshot و وضعیت `approved` را کنترل می‌کند.

در transaction جاری، سطر payroll run قفل می‌شود؛ مبلغ از اقلام جاری حقوق دوباره جمع زده و با مجموع snapshot مقایسه می‌شود. حساب بانکی باید هم در snapshot و هم در tenant زنده موجود باشد. تفصیلی بانک در صورت نیاز زیر advisory lock و در همان transaction ساخته می‌شود. سپس سند پرداخت با sourceRef ثابت `payroll-settlement:<runId>:<kind>`, دو ردیف بدهکار/بستانکار، رکورد `payrollSettlements` و رکورد ledger/receipt در همان transaction ثبت می‌شوند. unique روی `(runId,kind)` از ثبت دوم همان نوع تسویه جلوگیری می‌کند؛ تکرار همان UUID و payload همان receipt قبلی را می‌دهد. خطای transaction همهٔ آثار مالی و ledger آن فرمان را rollback می‌کند.

زمان دستگاه در سمت سرور محدود به ۳۱ روز گذشته تا پنج دقیقه آینده است تا ساعت نامعتبر به سند مالی منتقل نشود. تاریخ پرداخت و سند از زمان فرمان محلی استفاده می‌کنند؛ پرداخت‌هایی که دیرتر از بازهٔ قابل‌قبول sync شوند نیاز به ثبت/بازبینی آنلاین دارند.

این قابلیت پول را از دستگاه به کارمند، سازمان بیمه یا بانک منتقل نمی‌کند و کارتخوان/بانک را صدا نمی‌زند. اپ یک عملیات انجام‌شدهٔ کاربر را در صف ثبت می‌کند؛ رسید سرور ثابت می‌کند ثبت نرم‌افزاری انجام شده، نه اینکه انتقال وجه فیزیکی/بانکی اثبات شده باشد. پرداخت واقعی و خروجی رسمی بیمه/مالیات همچنان آنلاین و جدا از این صف هستند.

## فایل‌های تغییرکرده

- `src/lib/offline-payroll-settlement.ts`: parser محدود، auth/entitlement، بررسی snapshot و مبلغ جاری، ایجاد تفصیلی بانک، سند و settlement اتمیک و ذخیرهٔ receipt.
- `src/lib/offline-dashboard.ts`: دادهٔ محدود نام بانک‌ها در snapshot حقوق و dispatch فرمان payroll.
- `src/lib/accounting.ts`: helper تفصیلی بانک که در transaction caller مشارکت می‌کند.
- `windows-bridge/offline-core/src/lib.rs`: کنترل PIN، دوره/مبلغ/بانک از snapshot و outbox رمز‌شده با جلوگیری از فرمان تکراری.
- `windows-bridge/src-tauri/src/offline.rs`, `main.rs`: commandهای Tauri، ارائهٔ تغییرهای محلی فقط بعد از PIN، replay فرمان و تازه‌کردن snapshot پس از receipt/conflict.
- `windows-bridge/ui/index.html`, `pos.js`, `style.css`: فرم responsive نوع تسویه/منبع/حساب، تأیید PIN، پیام pending و جدول وضعیت درخواست‌های محلی.
- `docs/agents/modules/offline-payroll.md`, `offline-full-dashboard.md`, `offline-pos.md`, `docs/agents/README.md`, `docs/agents/module-capabilities.md`, `IMPLEMENTATION_STATUS.md`: راهنمای agent و وضعیت قابلیت به‌روز شدند.

## migration و بررسی

تغییر migration ندارد؛ از جدول ledger و unique موجود `payroll_settlements_run_kind_uq` استفاده می‌کند. `npm run typecheck`، ESLint هدفمند روی فایل‌های TypeScript، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند. `cargo`/`rustc` نصب نیست؛ بنابراین `cargo fmt/check` و build واقعی Windows/Tauri اجرا نشدند. اتصال دیتابیس، تست PostgreSQL، نسخهٔ واقعی بانک و انتقال پول در این تغییر انجام نشده است.
