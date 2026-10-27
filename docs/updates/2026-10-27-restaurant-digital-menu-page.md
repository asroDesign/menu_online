# لندینگ اختصاصی منوی دیجیتال رستوران

صفحهٔ `/restaurant-digital-menu` برای ارائهٔ مستقل منوی دیجیتال در فضای رستوران ساخته شد. ساختار آن از الگوی صفحات معرفی محصول—hero روشن، مسئله/راهکار، گام‌های استفاده، امکانات، مقایسه، تعرفه، دمو و پرسش‌های پرتکرار—الهام می‌گیرد و متن و تصویرسازی آن برای MenuPeak نوشته شده است؛ برند و asset سایت مرجع کپی نشده‌اند.

## آنچه پیاده شد

- hero راست‌چین با نمونهٔ دیداری QR میز، منوی موبایل، مبلغ سبد و بلیت آشپزخانه.
- بخش‌های مسئله‌های روزمره، جریان پنج‌مرحله‌ای، قابلیت‌های رستوران و سناریوهای کسب‌وکار.
- جدول قابل اسکرول و قابل focus برای مقایسهٔ گردش دستی و منوی دیجیتال.
- ماشین‌حساب مرورگری هزینهٔ چاپ مجدد با `AmountInput` و نمایش مبلغ فارسی. محاسبه فقط تخمین است، مقدارها به سرور ارسال نمی‌شوند و محدودیت عددی ورودی برای جلوگیری از overflow دارد.
- گالری دموی مشترک، نظرهای تأییدشده در صورت وجود، pricing مشترک واقعی و پرسش‌های متداول.
- metadata برندمحور، canonical، Open Graph/Twitter و JSON-LD صفحه/نرم‌افزار/FAQ؛ بدون ثبت رویداد تحلیلی یا ارسال اطلاعات ماشین‌حساب.
- پیوند در تب منوی دیجیتال ProductTour و footer؛ مسیر در sitemap ثبت شد.
- CSS واکنش‌گرا برای موبایل و تبلت، focus دیداری جدول و احترام به `prefers-reduced-motion`.

## فایل‌ها و منبع داده

- `src/app/restaurant-digital-menu/page.tsx`
- `src/app/restaurant-digital-menu/restaurant-digital-menu.css`
- `src/components/marketing/restaurant-menu-calculator.tsx`
- `src/components/marketing/product-tour.tsx`
- `src/components/marketing/site-footer.tsx`
- `src/app/sitemap.ts`
- راهنمای عامل: `docs/agents/core-pages/restaurant-digital-menu.md`؛ کاتالوگ و فهرست راهنما نیز به‌روز شدند.

نام برند از `getPlatformBranding`، پلن‌ها و feature overrides از تنظیم‌های جاری، گالری از `DemoMenuGallery` و دیدگاه‌ها از `getPublicTestimonials` می‌آیند. هیچ مدل داده یا migration اضافه نشده است.

## بررسی و محدودیت

`npm run typecheck`، ESLint هدفمند روی route، ماشین‌حساب، ProductTour، footer و sitemap، و `git diff --check` موفق شدند. Build و Chrome اجرا نشدند؛ runtime موجود Node.js 18.17 است و با نسخهٔ جاری Next سازگار نیست. پایگاه‌داده/پرداخت واقعی استفاده نشد. پیکربندی پلن و قیمت همچنان از منبع مشترک checkout است؛ پیش‌نمایش hero و اعداد ماشین‌حساب دادهٔ نمونه‌اند.
