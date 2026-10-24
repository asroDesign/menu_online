# معرفی صفحه و منوی تصویری با رزرو میز — ۲۰۲۶-۱۰-۲۴

## هدف

صفحهٔ اصلی برای معرفی خدمات با حرکت و انتخاب صحنه بازطراحی شد. منوی مشتری می‌تواند گالری تصویری داشته باشد و قالب «روایی» اطلاعات رستوران و رزرو را بالای فهرست غذا ارائه می‌دهد. رزرو عمومی میز نیز به روند سه‌مرحله‌ای با نمایش ظرفیت و انتخاب میز تبدیل شد. این پیاده‌سازی از تجربهٔ عمومی Orderino الهام می‌گیرد و از متن، برند، تصویر یا دارایی اختصاصی آن کپی نمی‌کند.

## صفحهٔ اصلی

- `src/app/page.tsx` از Hero متمرکز با CTAهای شروع رایگان و نمایش استفاده می‌کند و بخش‌های تعرفه، FAQ، راهنمای خرید، محتوای CMS و رفتار دامنهٔ اختصاصی را نگه می‌دارد.
- `src/components/marketing/homepage-showcase.tsx` چهار صحنهٔ نمونهٔ منو، سفارش، رزرو و گزارش دارد. کاربر با tab هر صحنه را انتخاب می‌کند؛ در حالت عادی هر ۴٫۲ ثانیه صحنهٔ بعدی نمایش داده می‌شود. `prefers-reduced-motion` چرخش خودکار را خاموش می‌کند.
- اعداد داخل preview نمونه هستند؛ برچسب «پیش‌نمایش نمایشی» کنار mock dashboard دیده می‌شود تا آن را با داده زنده اشتباه نگیرند.
- ظاهر responsive و انیمیشن‌ها در `src/components/marketing/home.css` هستند و طرح رنگ آبی برند سامانه حفظ می‌شود.

## گالری عمومی و قالب «روایی»

- در `/dashboard/settings#menu-theme`، مدیر رستوران از حداکثر ۸ تصویر، GIF یا ویدیوی MP4/WebM برای بالای منوی مشتری استفاده می‌کند. ترتیب فهرست، ترتیب نمایش است؛ هر مورد کپشن اختیاری دارد.
- `MenuGalleryItem` در `src/lib/plans.ts` ساختار شناسه، نوع، URL داخلی و کپشن را تعریف می‌کند. `POST /api/business` در `src/app/api/business/route.ts` ورودی را محدود می‌کند و فقط `/api/files/<24 hex>` می‌پذیرد. URL خالی برای پیش‌نویس هنگام بارگذاری در تنظیمات مجاز است، ولی منوی عمومی فقط فایل کامل و معتبر را نمایش می‌دهد.
- GIFهای تا ۲٫۴ مگابایت به همان صورت بارگذاری می‌شوند تا حرکت حفظ شود. `VideoUpload` بارگذاری ویدیو را به مسیر آپلود موجود می‌سپارد.
- شناسهٔ داخلی `orderino` با عنوان نمایشی «روایی» در `src/lib/menu-templates.ts` قابل انتخاب است. بالای کاتالوگ، گالری، لوگو و نام، نشانی، وضعیت و ساعت کاری امروز، context میز، لینک تماس، مسیر نقشه و دکمه‌های مشاهده منو و رزرو دیده می‌شوند.
- قالب‌های دیگر ساختار فعلی خود را حفظ می‌کنند و فقط `PublicMenuGallery` بالای آن‌ها می‌آید. انتخاب قالب در تنظیمات ذخیره می‌شود؛ پیش‌نمایش `?template=` همچنان read-only است.

## رزرو مشتری

- `/m/:slug/reserve` سه گام دارد: نوع و اطلاعات رزرو، انتخاب میز و بازبینی نهایی. تاریخ با `PersianDateInput` شمسی است؛ تعداد مهمان ۱ تا ۳۰، نام و تلفن لازم‌اند و توضیح اختیاری است.
- `GET /api/public/:slug/reservations?startsAt=<ISO>&guestCount=<n>` جدول‌های در دسترس با ظرفیت کافی را بعد از بررسی ساعت کاری و تداخل فعلی ارائه می‌کند؛ حد rate-limit آن ۳۰ درخواست در دقیقه برای هر کسب‌وکار است.
- `POST /api/public/:slug/reservations` نوع `normal|occasion|business` و میز انتخابی را می‌گیرد. `createReservation` داخل transaction ردیف‌های میز همان tenant را قفل می‌کند و وضعیت، ظرفیت و تداخل را دوباره کنترل می‌کند؛ درخواست هم‌زمان برای میز پرشده با خطای 409 رد می‌شود. نرخ محدودیت ثبت رزرو قبلی حفظ شده است.
- ثبت درخواست به معنی تأیید نیست. وضعیت و پیامک تأیید/رد همچنان از پنل رزرو و مسیر موجود ارسال می‌شوند. در صورت پیش‌پرداخت، مبلغ در سرور از تعداد نفر و تنظیم رستوران محاسبه می‌شود.
- مسیر رزرو نمونهٔ read-only بسته است و endpointهای GET/POST رزرو برای slug نمونه رزرو نمی‌دهند.

## داده و migration

- `reservations.reservation_type` در schema با default `normal` افزوده شده است.
- `src/db/migrations/0049_reservation_type.sql` ستون nullable نیست و مقدار پیش‌فرض دارد؛ دادهٔ فعلی با `normal` سازگار می‌شود. migration روی دیتابیس این محیط اجرا نشده است.
- rollback در `0049_reservation_type.down.sql` ستون را حذف می‌کند؛ برچسب‌های نوع رزروهایی که بعد از migration ساخته شده‌اند از بین می‌روند. قبل از rollback دیتای جدید را export کنید اگر حفظ آن لازم است.

## فایل‌های اصلی و راهنماها

`src/app/page.tsx`, `src/components/marketing/homepage-showcase.tsx`, `src/components/marketing/home.css`, `src/lib/plans.ts`, `src/lib/menu-templates.ts`, `src/lib/public-menu.ts`, `src/components/public-menu-showcase.tsx`, `src/components/menu-client.tsx`, `src/components/public-menu-navigation.tsx`, `src/app/dashboard/settings/page.tsx`, `src/app/api/business/route.ts`, `src/app/m/[slug]/reserve/page.tsx`, `src/components/reservation-form.tsx`, `src/app/api/public/[slug]/reservations/route.ts`, `src/lib/reservations.ts`, `src/db/schema.ts`, `src/modules/reservations.tsx`.

راهنماهای بازسازی و کاتالوگ: `docs/agents/home-page.md`, `docs/agents/core-pages/marketing-home.md`, `docs/agents/core-pages/public-menu.md`, `docs/agents/core-pages/public-reservation.md`, `docs/agents/modules/reservations.md`, `docs/agents/module-capabilities.md` و `docs/agents/README.md`.

## اعتبارسنجی و محدودیت

- `npm run typecheck -- --incremental false`, ESLint هدفمند و `npm run build -- --webpack` اجرا شدند و موفق بودند. Build صفحهٔ `/` و مسیرهای رزرو و منو را در route manifest ثبت کرد.
- بنا بر ترجیح ثبت‌شدهٔ کاربر، تست خودکار اجرا یا اضافه نشده است.
- صفحهٔ اصلی از سرور production محلی در Chrome باز شد و تغییر tab به صحنهٔ رزرو تأیید شد. اجرای dev با webpack همچنان به خطای `EMFILE` در Watchpack رسید؛ production build/start مسیر جایگزین نمایش بود.
- `/m/niloofar?template=orderino` در Chrome نتوانست به محصول‌ها برسد: دیتابیس متصل به localhost ستون `products.video_url` را ندارد. این نشان می‌دهد migration موجود برای رسانهٔ محصول (`0044`) در این دیتابیس اعمال نشده؛ آن را اجرا نکردیم. به‌دلیل همین ناسازگاری دیتابیس، گالری/قالب در منوی محلی دیداری تأیید نشده است.
- migration جدید `0049` روی دیتابیس اعمال نشده، Lighthouse/Performance اندازه‌گیری نشده و ورود Orderino تا واردکردن کد توسط کاربر در تب Chrome منتظر است.

