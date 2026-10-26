# ثبت فاکتور چندقلمی انبار در حالت آفلاین — ۲۰۲۶-۱۰-۲۶

## رفتار و مرزهای قابلیت

- تب انبار اپ Windows دکمهٔ «ثبت فاکتور ورود» و فرم مستقل دارد. مدیر با PIN محلی تاریخ شمسی تهران، شماره فاکتور، فروشندهٔ موجود، یک یا چند کالای فعالِ قابل‌ردیابی، مقدار، بهای واحد خرید، تخفیف، هزینه جانبی، حمل، مالیات، روش تسویه، مبلغ پرداخت‌شده و توضیح را وارد می‌کند. ساخت کالای جدید در فاکتور آفلاین هنوز پشتیبانی نمی‌شود.
- فهرست کالا و فروشنده از snapshot رمز‌شده می‌آید. snapshot فروشنده فقط id، نام، فعال‌بودن و وجود حساب پرداختنی را دارد؛ شماره تماس، نشانی، اطلاعات بانکی و مالیاتی فروشنده به دستگاه منتقل نمی‌شوند.
- محاسبهٔ مبلغ هر ردیف و جمع فاکتور مطابق `stockReceiptTotal` و `allocateStockValue` سرور است؛ command مقدار، بهای مورد انتظار، هزینهٔ تخصیص‌یافته و بهای میانگین پس از رسید را نگه می‌دارد تا چند فرمان پشت‌سرهم همان snapshot به ترتیب درست قابل replay باشند. UI موجودی رسمی snapshot را از projection محلی درخواست‌های pending/synced جدا نشان می‌دهد.
- درخواست ضایعات موجود نیز projection مشترک دارد؛ ابتدا receiptهای محلی و ضایعات قبلی اعمال می‌شوند، بعد ماندهٔ قابل خرج فرمان بعدی محاسبه می‌شود. conflict/reject وارد projection نمی‌شود و اقلام همان فرمان تا snapshot تازه‌تر از زمان ثبت آن برای گردش جدید مسدود می‌مانند؛ پس از refresh موفق، اگر revision/محتوا ثابت باشد هم refresh محلی به‌عنوان مبنای تازه قابل استفاده است.
- هنگام اتصال، `POST /api/offline-dashboard/inventory` هر دو action `receive` و `waste` را می‌پذیرد. سرور terminal/business/entitlement/snapshot، فعال‌بودن کالا، موجودی و بهای جاری، شناسهٔ فروشنده، محاسبهٔ مجدد جمع/تخصیص و ماندهٔ قابل پرداخت را بازبینی می‌کند. duplicate item، مبلغ نامعتبر، فروشندهٔ غیرمجاز یا تغییر concurrent پذیرفته نمی‌شود.
- پس از اعتبارسنجی، `applyStockReceipt` رسید، ردیف‌های گردش، stock، میانگین بهای کالا، تخصیص هزینه‌های فاکتور و سند حسابداری را در transaction PostgreSQL می‌نویسد؛ command ledger با UUID idempotency در همان transaction است. پس از sync worker snapshot انبار را تازه می‌کند؛ تا آن زمان UI مقدار صف را به‌عنوان موجودی رسمی نمایش نمی‌دهد.
- بازبینی کد migrationهای قبلی نشان داد `0059/0060` و action check در `0061` هرچند Rust و worker `inventory` را مجاز می‌دانستند، constraint ماژول/عملیات PostgreSQL آن را نمی‌پذیرفت. migration `0062_offline_inventory_receipts.sql` allowlist را برای `inventory/receive` و `inventory/waste` اصلاح می‌کند؛ down migration تاریخچهٔ هر command انبار را بررسی و در صورت وجود rollback را رد می‌کند.
- فرمان‌های conflict/rejected برای همان snapshot در projection باقی موجودی را تغییر نمی‌دهند و آن اقلام تا دریافت snapshotی که پس از زمان فرمان صادر شده باشد از ثبت گردش تازه باز می‌مانند؛ بنابراین refresh همان revision پس از conflict انقضای snapshot هم می‌تواند مسیر کار را دوباره باز کند.

## فایل‌های اصلی

- `src/lib/offline-inventory.ts`: parser strict فاکتور، کنترل idempotency/tenant/snapshot/stock و مسیر سرور برای receive؛ مسیر ضایعات نیز بهای projectionشده را کنترل می‌کند.
- `src/app/api/offline-dashboard/inventory/route.ts`: dispatch به receive یا waste از body محدودشده.
- `src/lib/offline-dashboard.ts`: اضافه‌شدن فهرست محدود و کم‌حساسیت فروشندگان به inventory snapshot.
- `windows-bridge/offline-core/src/lib.rs`: PIN، اعتبارسنجی و queue فاکتور، محاسبهٔ allocation/average cost و projection دریافت/ضایعات بر اساس sequence همین snapshot؛ خواندن فرمان‌های محلی و allowlist claim worker برای ارسال `inventory`.
- `windows-bridge/src-tauri/src/offline.rs`, `main.rs`: command Tauri و وضعیت فهرست گردش‌های محلی.
- `windows-bridge/ui/index.html`, `pos.js`, `style.css`: فرم واکنش‌گرا، ردیف‌های تکرارشونده، preview جمع و نمایش status/projection.
- `src/db/migrations/0062_offline_inventory_receipts.sql` و `.down.sql`: allowlist ledger با rollback محافظت‌شده.
- شرح بازسازی در `docs/agents/modules/offline-full-dashboard.md`, `docs/agents/modules/offline-pos.md`, `docs/agents/core-pages/api-contract-map.md` و `docs/agents/module-capabilities.md` آمده است.

## اعتبارسنجی و محدودیت

- `npx tsc --noEmit --incremental false`, ESLint هدفمند سه فایل API، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند.
- طبق محدودیت کاربر، دیتابیس و تست integration اجرا نشدند؛ migration روی هیچ دیتابیسی اعمال نشد. `cargo` و `rustc` در میزبان موجود نیست، بنابراین compile باینری Rust/Tauri و runtime Windows تأیید نشده است.
- فقط ورود چندقلمی کالاهای ازپیش‌تعریف‌شده و ضایعات آفلاین‌اند. تعریف کالا/فروشنده، خروج مصرف، تعدیل، انتقال، lot/expiry و recipe هنوز به سرور نیاز دارند. پرداخت نسیه به فروشنده‌ای با حساب پرداختنیِ فعال نیاز دارد. تعارض سرور در صف محلی می‌ماند و به بازبینی نیاز دارد.
