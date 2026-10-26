# درخواست مرخصی و تعویض شیفت در اپ آفلاین — ۲۰۲۶-۱۰-۲۶

## رفتار پیاده‌شده

- در تب «شیفت‌ها و مرخصی‌ها»، مدیر می‌تواند با PIN محلی برای کارمند فعال درخواست مرخصی بسازد. نوع مرخصی شخصی، استعلاجی یا بدون حقوق است؛ بازه باید حداکثر ۳۱ روز و داخل محدودهٔ snapshot کارکنان باشد.
- برای شیفت برنامه‌ریزی‌شدهٔ آینده، دکمهٔ «درخواست تعویض» کارمند مقصد را از roster cacheشده انتخاب می‌کند. صاحب شیفت تا پاسخ همکار مقصد و تصمیم مدیر تغییر نمی‌کند.
- هر دو درخواست در SQLite محلی با همان command UUID، snapshot شیفت، tenant، revision، payload رمز‌شده و state صف ثبت می‌شوند. worker اقدام‌های staff را بر اساس action به endpoint حضور یا command endpoint عمومی می‌فرستد.
- سرور entitlement صندوق و برنامه‌ریزی کارکنان، terminal جفت‌شده، کسب‌وکار، UUID، schema payload و snapshot مبنا را دوباره بررسی می‌کند. مرخصی به `staff_leave_requests` با وضعیت pending وارد می‌شود. تعویض به `staff_shift_swap_requests` با وضعیت `pending_target` وارد می‌شود. برای تعویض، شیفت و کارکنان زیر قفل دوباره خوانده می‌شوند، version/owner/start time بررسی می‌شود و درخواست pending تکراری رد می‌شود.
- `offline_workspace_commands` به صورت command ledger برای هر دو عمل staff استفاده می‌شود: درج درخواست و receipt/idempotency در یک PostgreSQL transaction هستند؛ درخواست تکراری با hash یکسان همان نتیجه را می‌گیرد و استفادهٔ دوباره از UUID با payload متفاوت conflict می‌دهد. متن آزاد دلیل در payload این ledger خالی است و متن دلیل فقط در ردیف درخواست دامنه ذخیره می‌شود.
- دریافت snapshot تازه پس از اعمال یا تعارض درخواست اجرا می‌شود و فهرست محلی، درخواست‌های سمت سرور و وضعیت همگام‌سازی را در تب نشان می‌دهد. تعارض باعث overwrite برنامه نمی‌شود.

## migration و rollback

`src/db/migrations/0059_offline_staff_requests.sql` constraintهای module/action را از منو به ترکیب مجاز منو و دو action کارکنان گسترش می‌دهد. فایل rollback متناظر قبل از بازگرداندن constraintهای قبلی وجود رکورد staff در ledger را بررسی می‌کند و در صورت وجود، rollback را متوقف می‌سازد تا درخواست/رسید بدون ثبت از دست نرود. migration روی دیتابیس اجرا نشده است.

## فایل‌ها

- سرور: `src/lib/offline-dashboard.ts`, `src/db/migrations/0059_offline_staff_requests.sql`, `src/db/migrations/0059_offline_staff_requests.down.sql`
- Tauri/Rust: `windows-bridge/offline-core/src/lib.rs`, `windows-bridge/src-tauri/src/offline.rs`, `windows-bridge/src-tauri/src/main.rs`
- UI: `windows-bridge/ui/index.html`, `windows-bridge/ui/pos.js`, `windows-bridge/ui/style.css`
- راهنماها: `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/modules/offline-pos.md`, `IMPLEMENTATION_STATUS.md`

## مرزهای فعلی

ایجاد/ویرایش خود برنامهٔ شیفت، ثبت غیبت، تأیید/رد آفلاین، CRUD کارمند و محاسبهٔ حقوق هنوز آفلاین نیستند. مرخصی با workflow موجود مدیر رسیدگی می‌شود؛ تعویض، ابتدا به کارمند مقصد و سپس مدیر می‌رود. این پیاده‌سازی workflow جاری سرور را تغییر نمی‌دهد. `tsc --noEmit --incremental false`، ESLint هدفمند، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند. تست DB/integration اجرا نشده و `cargo` و `rustc` در محیط حاضر نصب نیستند؛ کامپایل Rust/Tauri انجام نشد.
