# مدیریت میزها

> مشخصات بازسازی ماژول `tables` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/tables`
- کامپوننت/منبع فعلی: `src/modules/tables.tsx — Tables و src/components/table-manager.tsx`
- entitlement تعرفه: `self_order + cashier_pos`
- هدف: تعریف سالن/زون، میز و QR اختصاصی و نمایش وضعیت اشغال.

## رابط و جریان کار

میزها با polling ده‌ثانیه‌ای به تفکیک zone؛ افزودن/ویرایش/حذف میز و زون؛ نمایش آزاد، اشغال، رزرو، نظافت یا خارج از سرویس؛ نمایش سفارش جاری؛ تغییر وضعیت عملیاتی و ثبت علت؛ تولید/چاپ QR اختصاصی هر میز؛ پیوند منوی عمومی میز.

## داده و API

GET/CRUD /api/tables؛ `POST /api/tables/:id/status` برای transition عملیاتی؛ DELETE میز با قفل سطر و بررسی سفارش/رزرو؛ GET /api/business برای slug؛ CRUD زون طبق /api/r/zones (جزئیات در TableManager). QR route `/m/:slug?table=:id`.

## قواعدی که بازنویسی باید حفظ کند

حالت `occupied` از سفارش باز و `reserved` از رزرو جاری مشتق می‌شود و از کلاینت set نمی‌شود. `cleaning` و `out_of_service` ستون `operational_status` هستند. هر عملیات سفارش/رزرو/تغییر وضعیت/حذف، میز tenant جاری را قفل می‌کند تا سفارش یا رزرو هم‌زمان روی میز در حال انتقال ثبت نشود. میز با سفارش باز یا هر رزرو فعال/آینده حذف یا از سرویس خارج نمی‌شود؛ QR باقی می‌ماند ولی API سفارش برای نظافت/تعمیر/رزرو جاری با خطای روشن رد می‌کند. رویداد تغییر وضعیت actor، علت و snapshot نام میز را نگه می‌دارد.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

مدل هر میز `id,name,zone,capacity,operationalStatus,status,hasActiveReservation,openOrder` است. status مؤثر با اولویت operational-status، سفارش باز، رزرو جاری و سپس available محاسبه می‌شود. `openOrder` شماره/status/total سفارش فعال را می‌آورد. داده `/api/tables` هر ۱۰ ثانیه poll می‌شود و کسب‌وکار برای slug از `/api/business` خوانده می‌شود. گروه‌های zone از مقادیر موجود میزها ساخته می‌شوند؛ افزودن میز نام پیشنهادی «میز N»، zone پیش‌فرض موجود یا «سالن اصلی» و capacity برابر ۴ دارد. ذخیره نام اجباری است و capacity عدد فارسی normalize می‌شود.

هر کارت میز ظرفیت، وضعیت مؤثر، خلاصه order و actionهای QR/status/edit/delete دارد. مسیرهای وضعیت کاربر: available→cleaning/out_of_service، cleaning→available/out_of_service و out_of_service→available؛ علت خروج از سرویس اجباری است. statusهای occupied/reserved فقط نمایشی و مشتق هستند. QR value دقیقاً `${origin}/m/${slug}?table=${id}` است؛ modal QR شامل copy link و چاپ یک برگه با عنوان میز، متن راهنما، QR و URL است. حذف confirm می‌کند که QR چاپ‌شده از کار می‌افتد و server هم order/reservation فعال را چک می‌کند. zone با input/datalist است، نه resource مستقل در این صفحه.

**پذیرش:** گروه با نام zone، میز اشغال‌شده با ring متفاوت، شناسه منفی optimistic بدون امکان QR، QR را روی دامنه/slug درست بساز، popup-blocked/error clipboard را graceful کن؛ refresh/poll unmount cleanup داشته باشد.

## چرخه عملیاتی میز — ۲۰۲۶-۱۰-۱۹

- «اشغال» از سفارش باز و «رزرو» از رزرو درخواست‌شده/تأییدشدهٔ جاری محاسبه می‌شوند. کاربر فقط وضعیت پایدار را تغییر می‌دهد: آزاد، در حال نظافت یا خارج از سرویس.
- route وضعیت `withAuth` با feature `self_order|cashier_pos` و نقش مالک/مدیر/صندوقدار اجرا می‌شود. transition در transaction ردیف میز را قفل می‌کند، وضعیت قبلی/جدید، علت، actor و نام میز را در `table_status_events` نگه می‌دارد؛ میز با سفارش باز یا رزرو آینده قابل حذف/خروج از سرویس نیست.
- `createOrder`, `createReservation`, transition و delete میز با lock روی همان ردیف هماهنگ می‌شوند. endpoint سفارش، میز نظافت/خارج از سرویس و رزرو هم‌پوشان زمان سفارش را رد می‌کند. selector گارسون و منوی مشتری حالت غیرقابل سفارش را نشان/غیرفعال می‌کند.
- migration افزایشی `0029_table_lifecycle.sql`، rollback محافظه‌کارانه و تست state/tenant و PostgreSQL هم‌زمانی اضافه شدند. migration روی دیتابیس این نوبت اجرا نشده؛ به‌علت نبود `MENUPEAK_TEST_DATABASE_URL` تست‌های integration skip شدند.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
