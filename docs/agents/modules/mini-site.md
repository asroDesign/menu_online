# ویرایش سایت کوچک

> مشخصات بازسازی ماژول `mini-site` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/mini-site`
- کامپوننت/منبع فعلی: `src/modules/growth-b.tsx — MiniSiteEditor`
- entitlement تعرفه: `mini_site`
- هدف: تنظیم microsite عمومی برند از داده منو و اطلاعات کسب‌وکار.

## رابط و جریان کار

فرم تنظیمات بخش‌های صفحه/نمایش، preview و لینک عمومی؛ تغییرات تنظیمات کسب‌وکار ذخیره می‌شوند؛ public view در /s/:slug و verified custom domain.

## داده و API

GET/PATCH /api/business (settings/branding); public route /s/:slug؛ dispatch دامنه از /.

## قواعدی که بازنویسی باید حفظ کند

قابلیت entitlement mini_site لازم است؛ public renderer نباید private fields را serialize کند؛ preview و صفحه عمومی از یک schema استفاده کنند.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

تنظیم `settings.miniSite`: `heroTitle`, `heroSubtitle`, `about`, `hours`, `showMenuButton`, `gallery[]`, و در سطح custom، `heroImage`, `sections[{title,text}]`. Defaults شامل showMenuButton=true, gallery/sections خالی است. UI دو ستون: متن‌های معرفی/ساعات/دکمه منو در ستون اول؛ گالری (هر URL یک خط، حداکثر ۸) و سفارشی‌سازی در دوم. در level `custom` امکان hero image و حداکثر ۶ section با title/text و حذف/افزودن؛ در standard با کارت قفل و پیام پرمیوم پلاس.

Header دکمه save با loading، badge استاندارد/اختصاصی و preview `/s/:slug` در tab جدید دارد. `useBiz()` business/settings را می‌آورد و patch فقط کلید `miniSite` را تغییر می‌دهد. صفحه public `MiniSite` جداگانه از route `/s/[slug]` render می‌شود و custom-domain root نیز ممکن است همان را رندر کند.

**پذیرش:** preset default، no content، 8 gallery limit، custom max 6 section، تغییر entitlement به custom، save error و لینک preview tenant صحیح.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
