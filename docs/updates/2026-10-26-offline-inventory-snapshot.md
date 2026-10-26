# نمایش آفلاین فهرست انبار — ۲۰۲۶-۱۰-۲۶

## هدف

ادامهٔ تبدیل پنل رستوران به اپ مستقل ویندوز. این مرحله داده‌های لازم برای مشاهدهٔ موجودی و هشدارهای انبار را روی دستگاه cache می‌کند تا هنگام قطع اینترنت آخرین نسخه در دسترس باشد.

## پیاده‌سازی

- `GET /api/offline-dashboard/snapshots/inventory` فقط برای Bearer terminal جفت‌شده، کسب‌وکار فعال و اشتراک دارای `cashier_pos` و `inventory` پاسخ می‌دهد.
- projection فقط فیلدهای قلم موردنیاز صفحه، انبارهای tenant و ۳۰۰ گردش اخیر را می‌دهد؛ یادداشت آزاد گردش‌ها ارسال نمی‌شود. بیش از ۱۰٬۰۰۰ کالا یا ۴MB payload با 413 رد می‌شود و snapshot ناقص ساخته نمی‌شود.
- snapshot با hash/revision پایدار و TTL هفت‌روزه در جدول نسخه‌های موجود ثبت می‌شود. worker Tauri هر ۱۰ دقیقه و با refresh دستی دریافت می‌کند و در SQLite رمزگذاری‌شدهٔ DPAPI نگه می‌دارد.
- فرمان `offline_workspace_inventory` داده را فقط از tenant paired می‌خواند. در پاسخ 401/403 هنگام اتصال، cache انبار حذف می‌شود.
- تب تازهٔ «انبار» جست‌وجوی نام/SKU/انبار، فیلتر کمبود و انقضا تا ۳۰ روز، وضعیت نسخه/انقضا، خلاصه هشدار و جدول گردش‌های اخیر را نشان می‌دهد.
- صفحه فقط خواندنی است. گردش ورود/خروج، ضایعات، انتقال، خرید، ویرایش موجودی، فرمول ساخت، ثبت سند یا کسر موجودی فروش آفلاین در این مرحله وجود ندارد.
- متن تصویری صندوق نیز به‌جای برجسته‌کردن مسیرهای چاپ جداگانه، ادامهٔ کار صندوق و آشپزخانه در قطعی اینترنت را نشان می‌دهد.

## فایل‌های اصلی

- `src/lib/offline-dashboard.ts`: query tenant-scoped، projection، entitlement، محدودیت تعداد و حجم و revision.
- `windows-bridge/src-tauri/src/offline.rs`, `main.rs`: دریافت snapshot، پاک‌سازی cache با لغو دسترسی، وضعیت sync و فرمان خواندن محلی.
- `windows-bridge/ui/index.html`, `pos.js`, `style.css`: تب و فیلترهای انبار.
- `src/components/marketing/offline-desktop.tsx`: پیام ادامهٔ کار صندوق و آشپزخانه در قطعی.
- `docs/agents/modules/inventory.md`, `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/modules/offline-pos.md`: قرارداد و محدودیت‌ها.

## بررسی و محدودیت

- `npm run typecheck`، ESLint هدفمند، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند.
- تست و دیتابیس اجرا نشدند بنا بر محدودیت کاربر؛ `cargo`, `rustc` و `rustfmt` در محیط در دسترس نیستند، بنابراین build اپ ویندوز تأیید نشده است.
- موجودی محلی با فروش آفلاین به‌صورت transactionally یکپارچه نیست. اعداد تا sync به سرور، snapshot زمان‌دار هستند و موجودی زنده یا تضمین فروش قلم را نشان نمی‌دهند.
