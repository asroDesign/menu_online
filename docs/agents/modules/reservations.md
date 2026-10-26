# رزرو میز

> مشخصات بازسازی ماژول `reservations` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/reservations`
- کامپوننت/منبع فعلی: `src/modules/reservations.tsx — Reservations`
- entitlement تعرفه: `reservations`
- هدف: مدیریت درخواست‌های رزرو عمومی، ظرفیت میز و پیش‌پرداخت.

## رابط و جریان کار

کارت هر رزرو: مشتری/تلفن، زمان شمسی، تعداد نفر، میز، مدت، مبلغ و روش پیش‌پرداخت، یادداشت و badge وضعیت؛ لینک عمومی قابل بازکردن/کپی؛ اکشن تأیید، رد، لغو، ثبت پرداخت، تکمیل یا no-show؛ تازه‌سازی/poll 30s.

فرم عمومی سه گام دارد: اطلاعات رزرو، انتخاب میز آزاد و تأیید. میزها به صورت کارت‌های تصویری دو ستونه با شمای گرد/مستطیلی متناسب با ظرفیت، نام، ظرفیت، زون و مبلغ پیش‌پرداخت فعلی نمایش داده می‌شوند. انتخاب یک میز است؛ دکمه‌های مرحله در پایین چسبان هستند تا در فهرست‌های بلند هم دسترسی داشته باشند. قاب فرم دسکتاپ ۵۱۲ پیکسل است. قیمت اختصاصی هر میز در مدل دادهٔ فعلی وجود ندارد.

## داده و API

GET /api/r/reservations؛ PATCH /api/r/reservations/:id؛ GET /api/business برای slug؛ مسیر عمومی `GET/POST /api/public/:slug/reservations`. GET عمومی زمان و ظرفیت را می‌گیرد و میزهای `available` با ظرفیت کافی را پس از بررسی رزروهای `requested` و `confirmed` برمی‌گرداند. POST نوع رزرو و میز انتخابی را دریافت می‌کند؛ قفل و بررسی نهایی تداخل در transaction است. صندوق Windows درخواست تازه را به `POST /api/offline-dashboard/reservations` می‌فرستد؛ این مسیر با Bearer دستگاه، tenant و entitlementهای صندوق/رزرو محدود می‌شود.

## قواعدی که بازنویسی باید حفظ کند

رد/تأیید باید مطابق قرارداد backend پیامک را trigger کند؛ پیش‌پرداخت pending مانع confirmed شدن است؛ ظرفیت تداخل زمانی در سرور کنترل شود؛ Persian/Jalali date.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Reservation fields: customerName/Phone, guestCount, startsAt, durationMinutes, tableName, `reservationType` (`normal|occasion|business`), status, depositAmount/depositStatus/depositMethod, note, optional `smsNotification`. فهرست poll هر ۳۰ ثانیه؛ وضعیت map: requested/confirmed/cancelled/completed/no_show. بالای صفحه CTA لینک `/m/:slug/reserve`، کپی URL مطلق و توضیح رزرو ظرفیت میز را تا پایان duration نگه می‌دارد. فرم مشتری در سه گام اطلاعات/نوع رزرو، میز آزاد و تأیید است.

کارت رزرو تاریخ/ساعت شمسی، تعداد نفر/مدت، میز، مبلغ/وضعیت پیش‌پرداخت، note و روش cash/bank/card را نشان می‌دهد. transition: اگر deposit pending باشد action «ثبت دریافت و تأیید» patch `{depositPaid:true,depositMethod:"cash"}`؛ اگر پرداخت لازم نیست و status هنوز confirmed نیست، «تأیید رزرو»؛ confirmed می‌تواند completed یا no_show شود؛ requested می‌تواند reject/cancel شود. update پاسخ `smsNotification` دارد؛ اگر ارسال failed/skipped، رزرو ذخیره شده اما toast علت شکست را نشان دهد.

**پذیرش:** بدون slug لینک disabled، clipboard fail، deposit pending مانع تأیید خودکار، terminal statuses بدون actions، پیامک موفق/ناموفق، و reload داده بعد از mutation. بررسی ظرفیت/تداخل از UI انجام نمی‌شود و باید در API عمومی/مدیریتی enforce شود.

### تغییرات جاری — ۲۰۲۶-۱۰-۲۴

- فیلد `reservations.reservation_type` با مقدار پیش‌فرض `normal` در schema و migration `0049_reservation_type.sql` اضافه شده است؛ برچسب آن در پنل فهرست رزروها نمایش داده می‌شود.
- API عمومی availability را با GET و limit جداگانه می‌دهد. درخواست ایجاد فقط از یک جدول همان کسب‌وکار، دارای ظرفیت کافی و آزاد برای بازه می‌تواند موفق شود. همه میزها در transaction قفل می‌شوند تا دو درخواست هم‌زمان یک میز را نگیرند.
- rollback ستون تازه را حذف می‌کند؛ اگر داده‌های نوع رزرو پس از migration ثبت شده باشند، rollback این برچسب‌ها را پاک می‌کند. migration اجرا نشده است.

### رفع ۴۰۴ منوی نمونه و بازکردن رزرو عمومی — ۲۰۲۶-۱۰-۲۴

- `DEMO_MODE` دیگر منوی کسب‌وکاری موجود با slug `niloofar` را مخفی نمی‌کند؛ این متغیر فقط seed حساب/داده‌های آزمایشی و ورود آزمایشی را کنترل می‌کند. صفحهٔ `/m/niloofar?template=captainm` دادهٔ همان tenant موجود را می‌خواند و قالب query را صرفاً به‌عنوان ظاهر اعمال می‌کند.
- رزرو نمونه دیگر با slug guard در صفحه یا endpoint قطع نمی‌شود. لینک رزرو در قالب‌های منوی نمونه نمایش داده می‌شود و availability/submit همچنان entitlement `reservations`، تنظیم `settings.reservations.enabled`، rate limit، ساعت کاری، ظرفیت، تداخل و قفل تراکنشی میز را enforce می‌کنند. سفارش و checkout منوی نمونه read-only باقی می‌مانند.
- در تجربهٔ سه‌مرحله‌ای، کاربر اطلاعات/زمان/مهمان را وارد می‌کند، میز آزاد را می‌بیند و خلاصهٔ رزرو را تأیید می‌کند؛ UI بر اساس permission ذخیره‌شدهٔ همان کسب‌وکار تصمیم می‌گیرد CTA رزرو را نمایش دهد.
- اعتبارسنجی: `npm run typecheck`, ESLint هدفمند و build production بررسی شدند؛ تست خودکار و ثبت رزرو در دادهٔ واقعی انجام نشده است. بررسی نهایی لینک زنده پس از deploy لازم است.

### درخواست رزرو از صندوق Windows هنگام قطعی اینترنت — ۲۰۲۶-۱۰-۲۶

- تب رزرو برنامهٔ Tauri نام، موبایل، تعداد مهمان، تاریخ شمسی، ساعت، میز درخواستی اختیاری، نوع رزرو و توضیح را در outbox رمز‌شده SQLite ذخیره می‌کند. درخواست با وضعیت محلی «در انتظار اتصال؛ غیرقطعی» نشان داده می‌شود؛ پیش‌پرداخت یا تأیید رزرو از دستگاه انجام نمی‌شود.
- فرمان sync دارای UUID تصادفی است و payload در سرور hash می‌شود. دو ستون source_command_id/hash و unique index tenant-scoped در migration 0057، به‌علاوهٔ advisory lock، تکرار retry/ارسال هم‌زمان را به همان reservation پیوند می‌دهند. reuse شناسه با payload متفاوت conflict است.
- سرور در زمان sync plan/settings، ساعت کاری، میز فعال، ظرفیت و تداخل زمانی را با همان منطق createReservation دوباره می‌سنجد؛ رزرو موفق فقط requested است. زمان گذشته یا میز/ظرفیت نامعتبر در صف دستگاه برای بررسی باقی می‌ماند.
- down migration در حضور هر reservation دارای source command خطا می‌دهد تا idempotency پاک نشود. این جریان درخواست تازه را پوشش می‌دهد؛ فهرست/تأیید/رد/پرداخت پیش‌پرداخت و عملیات میز هنوز آنلاین‌اند.
- اعتبارسنجی: TypeScript typecheck، ESLint هدفمند، node --check برای رابط و git diff --check اجرا شدند؛ تست و اجرای migration روی دیتابیس انجام نشد. Rust در این محیط به علت نبود cargo/rustc کامپایل نشد.

## مرجع بازسازی

درخواست‌های `requested` به همراه نام، مهمان‌ها، زمان رزرو و میز در [مرکز اعلان مشترک پنل](panel-notifications.md) نمایش داده می‌شوند؛ تلفن و یادداشت رزرو به API خلاصهٔ اعلان افزوده نشده‌اند. رسیدگی و تغییر وضعیت فقط در `/dashboard/reservations` انجام می‌شود.

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
