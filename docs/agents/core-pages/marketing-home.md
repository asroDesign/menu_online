# صفحه اصلی و لندینگ

> مشخصات بازسازی عامل برای صفحه/جریان عمومی یا سیستمی.

- مسیر: `/`
- منبع فعلی: `src/app/page.tsx`
- هدف: هم صفحه بازاریابی اصلی است، هم نقطه dispatch برای دامنه اختصاصی verified. اگر host دامنه اختصاصی معتبر باشد، کسب‌وکار suspended نباشد و feature فعال باشد، خروجی MiniSite یا منوی عمومی رندر می‌شود. در غیر این صورت demo data آماده، auth خوانده و CTA ورود به داشبورد یا ثبت‌نام تعیین می‌شود.

## رابط و جریان

Navbar با anchorهای امکانات/تعرفه/FAQ و login/register؛ hero با CTA، لینک فهرست رستوران‌ها و منوی نمونه؛ mock گوشی؛ کارت امکانات؛ مراحل شروع؛ قیمت‌های زنده از getPlanList با متن/لیست feature؛ FAQ بازشونده؛ CTA نهایی و footer. متن و محتوای تصویری mock در همان فایل تعریف شده. UI با palette آبی، زمینه‌های سرد، کنتراست سرمه‌ای، کارت‌های گرد و preview محصول بازطراحی شده است. `src/components/marketing/marketing.css` محل layout و رنگ سطح بازاریابی است؛ بخش‌های اصلی از `--color-primary` استفاده می‌کنند تا رنگ ذخیره‌شده سامانه به CTA و تأکیدها برسد.

CTA هیرو و CTA نهایی «شروع دموی رایگان» به `/register?trial=demo` می‌روند و ثبت‌نام OTP به ترتیب موبایل، کد و اطلاعات فروشگاه را می‌گیرد. `/demo` درخواست نمایش همراه کارشناس باقی می‌ماند. grant و مدت trial از تنظیمات مدیر می‌آیند؛ UI بازاریابی نباید به‌تنهایی entitlement ایجاد کند. جزئیات در [ثبت‌نام و trial](../modules/trial-policy.md) است.

## API و داده

headers host؛ Drizzle lookup روی businesses.customDomain + domainStatus=verified؛ featuresOf؛ getPlanList؛ ensureDemoData؛ getAuth؛ buildPublicMenu؛ MiniSite و MenuClient.

## قواعد بازسازی

دامنه اختصاصی precedence دارد؛ دامنه ناشناخته/تعلیق‌شده نباید tenant دیگری را leak کند؛ قیمت live از getPlanList و مقادیر fallback؛ CTA براساس auth؛ از قیمت/feature سخت‌کدشده برای تصمیم server-side استفاده نشود.

رنگ اصلی سایت از `platformBranding.brandColor` خوانده می‌شود. `PlatformBrandingRuntime` آن را به tokenهای root و رنگ نوار مرورگر می‌نویسد؛ endpoint عمومی branding فقط نام، لوگو و رنگ غیرمحرمانه را می‌دهد. صفحات عملیاتی مدیر و رستوران رنگ را در shell محلی خود override می‌کنند.

برای schema دقیق و شرط‌های موجود، فایل‌های source و API بالا را بخوان. UI عمومی باید tenant-isolated، RTL و responsive باشد.
