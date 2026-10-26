# فهرست مشتریان روی اپ ویندوز آفلاین — ۲۰۲۶-۱۰-۲۶

## نتیجه

در تب «مشتریان» اپ Windows، فهرست محلی مشتریان همان رستوران با جست‌وجوی نام/موبایل، تعداد سفارش، مجموع خرید، امتیاز، اعتبار کیف پول و آخرین خرید قابل مشاهده است. داده‌ها فقط برای دستگاه paired و پلن دارای `loyalty` ارسال و در SQLite محلی با DPAPI ذخیره می‌شوند.

## قرارداد داده و امنیت

- `GET /api/offline-dashboard/snapshots/customers` فقط با Bearer terminal احرازشده، tenant فعال و entitlementهای صندوق و وفاداری پاسخ می‌دهد.
- فیلدهای snapshot allowlist صریح دارد: شناسه، نام، موبایل، امتیاز، کیف پول، جمع/تعداد خرید، زمان ایجاد و آخرین خرید. `note`, `referralCode`, `smsOptIn` و داده بانکی وارد payload نمی‌شوند.
- Snapshot در transaction با قفل دستگاه، hash canonical و revision per-terminal ذخیره می‌شود؛ TTL برابر هفت روز است.
- پس از اتصال مجدد، پاسخ 401/403 (لغو دستگاه، کسب‌وکار یا entitlement) snapshot مشتری را از SQLite پاک می‌کند؛ تا پیش از اتصال مجدد، revoke سمت سرور به دستگاه آفلاین نمی‌رسد.
- بیشتر از ۱۰٬۰۰۰ ردیف یا ۴MB با خطای قابل نمایش رد می‌شود. نتیجه truncate نمی‌شود؛ pagination/chunking برای فهرست‌های بزرگ هنوز پیاده نشده است.
- `offline_workspace_customers` snapshot را فقط برای tenant جفت‌شده از store برمی‌گرداند. UI اطلاعات را فقط‌خواندنی می‌گیرد و API mutation یا مصرف امتیاز/کیف پول از این تب وجود ندارد.
- worker هر ۱۰ دقیقه و با refresh دستی کنار snapshot منو، snapshot مشتریان را نیز می‌گیرد. در قطع ارتباط نسخهٔ قبلی باقی می‌ماند و UI تاریخ/انقضا را نشان می‌دهد.

## فایل‌های اصلی

- `src/lib/offline-dashboard.ts`: dataset مشتری، projection صریح tenant-scoped، محدودیت حجم/تعداد و revision/hash.
- `windows-bridge/src-tauri/src/offline.rs`: دریافت snapshot و command محلی خواندن customer dataset.
- `windows-bridge/src-tauri/src/main.rs`: ثبت Tauri command.
- `windows-bridge/ui/index.html`, `pos.js`, `style.css`: تب جست‌وجو و نمایش آمار مشتریان.
- `docs/agents/modules/customers.md` و `docs/agents/modules/offline-full-dashboard.md`: قواعد و ماتریس پوشش.

## اعتبارسنجی و موارد باقی‌مانده

- `npm run typecheck`، ESLint هدفمند، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند.
- تست و دیتابیس اجرا نشد. Cargo/rustc/rustfmt در محیط حاضر نیست؛ بنابراین compile برنامهٔ Tauri تأیید نشده است.
- این vertical slice فقط snapshot خواندنی است. ویرایش مشتری، ثبت امتیاز، تبدیل/مصرف کیف پول، دیدن referral history، SMS، خروجی CSV، صفحه‌بندی و cache invalidation remote هنوز آفلاین نشده‌اند. کل پنل رستوران هنوز آفلاین نیست.
