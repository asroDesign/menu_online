# دامنه اختصاصی

> مشخصات بازسازی ماژول `domain` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/domain`
- کامپوننت/منبع فعلی: `src/modules/growth-b.tsx — Domain`
- entitlement تعرفه: `custom_domain`
- هدف: اتصال، تأیید و حذف دامنه اختصاصی رستوران.

## رابط و جریان کار

نمایش وضعیت DNS، دامنه ثبت‌شده، hostname سرویس و راهنمای رکوردهای لازم؛ ثبت/حذف؛ دکمه Verify و پیام وضعیت در حال انتشار/تأیید.

## داده و API

GET/PUT /api/domain؛ POST /api/domain/verify.

## قواعدی که بازنویسی باید حفظ کند

hostname را normalize و validate کن؛ فقط دامنه tenant جاری؛ dispatch فقط دامنه verified و کسب‌وکار فعال را سرویس دهد.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

GET `/api/domain` پاسخ `{domain,status,appHost}` است. input دامنه LTR؛ save با PUT `{domain}` و بعد reload؛ مقدار خالی به معنی حذف. Save disabled وقتی input مساوی مقدار ثبت‌شده است. status verified badge سبز و بقیه در انتظار DNS زرد؛ POST `/api/domain/verify` بعد از درخواست دوباره load و toast نتیجه را نشان می‌دهد.

راهنمای صفحه یک رکورد CNAME با Name برابر بخش اول domain یا `menu` و Value برابر appHost نشان می‌دهد؛ توضیح می‌دهد پس از verified، دامنه ریشه سایت/منو را serve می‌کند و SSL در proxy/CDN تنظیم می‌شود. در backend root dispatch فقط exact verified customDomain و business غیر suspended را قبول می‌کند؛ بسته به entitlement، MiniSite یا MenuClient.

**پذیرش:** دامنه قبل از save، در انتظار، verified، حذف، DNS هنوز منتشر نشده، خطای verify، subdomain/CNAME display و host معمولی را تست کن. status را فقط از پاسخ API بگیر.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
