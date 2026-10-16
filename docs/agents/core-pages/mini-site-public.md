# سایت کوچک عمومی

> مشخصات بازسازی عامل برای صفحه/جریان عمومی یا سیستمی.

- مسیر: `/s/:slug`
- منبع فعلی: `src/app/s/[slug]/page.tsx + src/components/mini-site.tsx`
- هدف: صفحة معرفی برند عمومی مستقل از menu-only experience.

## رابط و جریان

Hero brand/logo/color، اطلاعات تماس/موقعیت/شبکه اجتماعی، CTA منو، دسته‌بندی/محصولات یا معرفی sectionها بسته به تنظیمات؛ responsive؛ CTA اصلی به منوی عمومی `/m/:slug` می‌رود؛ در UI فعلی CTA مستقل رزرو وجود ندارد.

## API و داده

public business lookup + public menu; route فقط feature mini_site.

## قواعد بازسازی

عدم افشای فیلدهای مدیریتی؛ suspended business public نشود؛ custom variant مطابق entitlement؛ SEO metadata tenant-scoped.

برای schema دقیق و شرط‌های موجود، فایل‌های source و API بالا را بخوان. UI عمومی باید tenant-isolated، RTL و responsive باشد.

## مشخصات سطح پیاده‌سازی

### منبع محتوا

سرور ابتدا کسب‌وکار را با slug می‌یابد؛ suspended یا یافت‌نشدن به not-found منجر می‌شود. قابلیت `mini_site` لازم است؛ تنظیم `miniSite` از `business.settings` می‌آید. Hero از `heroTitle/heroSubtitle` یا نام/شرح کسب‌وکار fallback می‌کند؛ `heroImage` و محتوای سفارشی فقط در پلن مجاز نمایش داده می‌شوند. `showMenuButton` پیش‌فرض نمایش CTA `/m/:slug` است.

### بخش‌ها

بخش درباره ما از `about` یا توضیح کسب‌وکار؛ `sections[]` برای بلوک‌های عنوان/متن سفارشی؛ gallery آرایه تصاویر؛ اطلاعات ساعات، تلفن، نشانی، رنگ accent، لوگو و Instagram در footer/کارت‌ها. این صفحه به خودی خود کاتالوگ سفارش نیست؛ CTA به منوی عمومی می‌رود. تنظیم‌های سفارشی محدودیت تعداد/دسترسی مطابق ماژول `mini-site` دارند.

### کیفیت

HTML محتوای tenant را به صورت text render کند؛ URL تصویر/Instagram پیش از link validation شود. تصویر gallery lazy-load، alt مناسب، و طرح موبایل/دسکتاپ داشته باشد. metadata باید tenant-scoped باشد و اطلاعات محرمانه/تنظیم‌های مدیریتی را شامل نکند. کسب‌وکار بدون feature یا suspended نباید از دامنه اختصاصی و slug عمومی عبور کند.

