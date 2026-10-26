# دفتر چک در اپ Windows آفلاین — ۲۰۲۶-۱۰-۲۶

## هدف و نتیجه

کاربر پنل رستوران باید در قطعی اینترنت بتواند دفتر چک cacheشده را بخواند و ثبت چک/درخواست تغییر وضعیت را روی دستگاه نگه دارد. یک vertical slice کامل به تب Windows اضافه شد: snapshot tenant، فهرست و جزئیات، ذی‌نفع، ثبت چک، تغییر وضعیت، صف امن و replay idempotent.

## پیاده‌سازی

- `GET /api/offline-dashboard/snapshots/cheques` در `src/lib/offline-dashboard.ts` entitlementهای صندوق، چک و حسابداری را کنترل می‌کند؛ دادهٔ صریح و tenant-scoped برای چک‌ها، ذی‌نفعان، رویدادها، حساب‌های انتخابی و فهرست بانک/بابت می‌سازد. snapshot از ۵۰۰۰ چک، ۱۰۰۰ ذی‌نفع، ۲۰٬۰۰۰ event، ۱۰۰۰ حساب یا ۴MB فراتر برود با خطا رد می‌شود تا cache ناقص به‌جای دفتر کامل نمایش داده نشود.
- `src/lib/offline-cheques.ts` دو فرمان ثبت و تغییر وضعیت را parse می‌کند. Bearer دستگاه، tenant، کسب‌وکار فعال، entitlement، snapshot معتبر، شناسهٔ idempotency و hash فرمان در سرور بازبینی می‌شوند. شماره/سریال، حساب، ذی‌نفع، کد ملی و موبایل دوباره اعتبارسنجی می‌شوند. ایجاد ذی‌نفع (در صورت نیاز)، چک، سند پایه، event و ledger فرمان یک transaction مشترک دارند. تغییر وضعیت زیر قفل، نسخهٔ چک را تطبیق می‌دهد و سندهای برگشت/وضعیت، event و ledger را در یک transaction ثبت می‌کند.
- `windows-bridge/offline-core/src/lib.rs` allowlistهای `cheques/register|set_status` و enqueue PINدار را اضافه می‌کند. payload با لایهٔ رمزگذاری محلی ذخیره می‌شود؛ فقط snapshot معتبر اجازهٔ نوشتن فرمان می‌دهد.
- `windows-bridge/src-tauri/src/offline.rs` snapshot را دریافت، در 401/403 حذف و فرمان‌ها را sync می‌کند؛ commandهای ثبت یا conflict باعث refresh می‌شوند. commandهای Tauri در `windows-bridge/src-tauri/src/main.rs` ثبت شده‌اند.
- `windows-bridge/ui/index.html`, `windows-bridge/ui/pos.js`, `windows-bridge/ui/style.css` تب دفتر چک را با تاریخ شمسی، فیلتر، خلاصه، فرم، مودال جزئیات و status، تاریخچهٔ فرمان‌ها و نمایش صف اضافه می‌کنند. تغییر دوبارهٔ وضعیت یک چک تا sync و snapshot تازه غیرفعال است؛ وضعیت پیشنهادی محلی به‌عنوان وضعیت رسمی جا زده نمی‌شود.
- نمایش projection وضعیت محلی فقط برای فرمان‌های متصل به snapshot فعلی انجام می‌شود، بنابراین فرمان قدیمی پس از refresh به رکورد جدید نسبت داده نمی‌شود.

## دسترسی آفلاین به تاریخچهٔ سفارش‌ها

این نیاز با کد موجود تطبیق شد و تغییر تازهٔ کد لازم نداشت: آخرین ۱۰۰ سفارش فوراً و سفارش‌های قدیمی‌تر به‌صورت صفحات cursorدار شامل اقلام و جزئیات، در آرشیو SQLite رمز‌شدهٔ همان دستگاه ذخیره می‌شوند. UI از cache محلی برای فهرست و مودال جزئیات استفاده می‌کند و هنگام قطع اینترنت درخواست شبکه لازم ندارد. backfill ادامه پیدا می‌کند تا تاریخچه کامل شود؛ بنابراین برای تضمین همهٔ سوابق، دستگاه باید پیش از قطعی به اینترنت وصل بماند تا backfill پایان یابد. سفارش‌های cacheشده از زمان قطعی قابل مشاهده‌اند حتی اگر backfill قدیمی‌تر هنوز تمام نشده باشد. این نکته در `docs/agents/modules/offline-full-dashboard.md` و `docs/agents/modules/offline-pos.md` نیز درج شده است.

## فایل‌های راهنما

- قرارداد ماژول: [راهنمای دفتر چک آفلاین](../agents/modules/offline-cheques.md)
- پوشش کل پنل: [نقشهٔ اپ آفلاین](../agents/modules/offline-full-dashboard.md)
- قرارداد endpointها: [نقشهٔ API](../agents/core-pages/api-contract-map.md)
- وضعیت کلی کار: [IMPLEMENTATION_STATUS.md](../../IMPLEMENTATION_STATUS.md)

## محدودیت‌ها

Snapshot دفتر چک صفحه‌بندی نشده است؛ بیش از سقف به‌صورت صریح خطا می‌دهد. یادآوری SMS، اتصال بانک/صیاد، گزارش کامل، مدیریت ذی‌نفع و پرداخت واقعی آفلاین نیستند. هیچ بانک، پیامک یا سند واقعی خارج از دیتابیس اجرا نشده است. این vertical slice به معنی آفلاین‌شدن کامل پنل رستوران نیست.

## اعتبارسنجی

`npx tsc --noEmit --incremental false`، ESLint هدفمند روی `src/lib/offline-dashboard.ts` و `src/lib/offline-cheques.ts`، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند. دیتابیس، تست یکپارچه و migration اجرا نشدند؛ هیچ داده‌ای به دیتابیس وصل یا تغییر داده نشد. `cargo` و `rustc` در محیط موجود نبودند، پس کامپایل Rust/Tauri تأیید نشده است.
