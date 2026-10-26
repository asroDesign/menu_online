# ثبت درخواست رزرو در صندوق آفلاین — ۲۰۲۶-۱۰-۲۶

## هدف و نتیجه

تب «رزروها» به MenuPeak Desktop اضافه شد تا کارمند بتواند هنگام قطع اینترنت درخواست تازه‌ای را ثبت و روی همان دستگاه نگه‌داری کند. متن رابط روشن می‌کند که درخواست آفلاین هنوز رزرو قطعی نیست. پس از اتصال، سرور ساعت کاری، تنظیمات/پلن رزرو، وضعیت میز، ظرفیت و تداخل زمانی را با منطق موجود بررسی می‌کند و فقط رزرو requested می‌سازد. پیش‌پرداخت از برنامه دریافت نمی‌شود.

## جزئیات اجرا

- رابط ویندوز شامل فرم نام، موبایل، تعداد مهمان، تاریخ و ساعت، میز اختیاری، نوع رزرو و توضیح است. ورودی تاریخ شمسی است و به timestamp محلی تبدیل می‌شود؛ برنامه پیش از enqueue بازهٔ ۳۰ دقیقه تا ۹۰ روز را کنترل می‌کند. لیست صف، زمان ذخیره و وضعیت pending/conflict/rejected/synced را نشان می‌دهد.
- هستهٔ Rust فرمان reservations/create را با UUID و payload allowlist می‌سازد و در outbox محلی رمز‌شده، با tenant جفت‌شده و درج تراکنشی enqueue می‌کند. این فرمان snapshot منو را مبنا نمی‌گیرد، پس پایان اعتبار snapshot منو درخواست رزرو را مسدود نمی‌کند. claim فرمان‌ها اکنون این module را نیز می‌پذیرد.
- Tauri فرمان فرم را به هسته می‌سپارد؛ worker پس از pairing، moduleهای menu و reservations را جداگانه relay می‌کند. خطای 409 وضعیت conflict می‌گیرد و درخواست محلی باقی می‌ماند؛ پاسخ 2xx تنها وقتی synced می‌شود که commandId/state/receipt همگی معتبر باشند.
- API مستقل، Bearer ترمینال، وضعیت دستگاه/tenant، rate limit per-terminal، entitlement صندوق و رزرو، UUID، فیلدهای ناشناخته، نام/تلفن/مهمان/تاریخ/نوع/میز/یادداشت را کنترل می‌کند. میز و زمان در سرور مرجع‌اند؛ payload محلی ظرفیت را رزرو قطعی نمی‌کند.
- createReservation کلید منبع اختیاری می‌پذیرد و در transaction با advisory lock تکرار همان فرمان را به رکورد فعلی متصل می‌کند. hash متفاوت برای UUID تکراری رد می‌شود. بررسی تکرار پیش از اعتبار زمانی/ساعت کاری است تا retry پاسخ گم‌شده پس از زمان رزرو، duplicate ایجاد نکند.
- migration 0057_offline_reservation_idempotency.sql: ستون‌های منبع فرمان و hash، check سازگاری، unique index روی tenant و command id. migration down اگر رکورد رزرو آفلاین بماند متوقف می‌شود؛ حذف کلید idempotency می‌تواند retry بعدی را به رزرو مضاعف تبدیل کند.

## فایل‌ها و اسناد

API: src/app/api/offline-dashboard/reservations/route.ts, src/lib/reservations.ts, src/lib/offline-pos.ts, src/lib/offline-pos-core.ts, src/db/schema.ts.

Desktop: windows-bridge/offline-core/src/lib.rs, windows-bridge/src-tauri/src/offline.rs, windows-bridge/src-tauri/src/main.rs, windows-bridge/ui/index.html, windows-bridge/ui/pos.js, windows-bridge/ui/style.css.

راهنماها: [رزرو میز](../agents/modules/reservations.md)، [صندوق آفلاین](../agents/modules/offline-pos.md)، [نقشه اپ کامل](../agents/modules/offline-full-dashboard.md)، [قرارداد API](../agents/core-pages/api-contract-map.md)، [کاتالوگ ماژول‌ها](../agents/module-capabilities.md).

## اعتبارسنجی و محدودیت

- `npm run typecheck`، ESLint هدفمند فایل‌های TypeScript، `node --check windows-bridge/ui/pos.js` و `git diff --check` موفق شدند.
- تست خودکار اجرا نشد و migration روی دیتابیس اجرا نشده است؛ مطابق محدودیت کاربر در این مرحله فقط بازبینی کد و بررسی کامپایل انجام شد.
- در این محیط `cargo`، `rustc` و `rustfmt` در دسترس نبودند؛ بنابراین Tauri و offline-core کامپایل نشدند. نصب/اجرای برنامه روی Windows نیز این مرحله تأیید نشده است.
- این پیاده‌سازی فقط درخواست رزرو تازه را offline enqueue می‌کند. دیدن فهرست رزرو، تأیید/رد، دریافت پیش‌پرداخت، ویرایش/لغو، موجودی رزرو بین چند دستگاه و push/SMS همچنان به سرور نیاز دارند.
