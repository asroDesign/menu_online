# پرداخت‌ها

> مشخصات بازسازی ماژول `payments` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/payments`
- کامپوننت/منبع فعلی: `src/modules/growth-b.tsx — Payments`
- entitlement تعرفه: `ipg OR installment`
- هدف فعلی: تنظیم IPG زرین‌پال در صورت entitlement و مشاهده تراکنش‌ها؛ پرداخت اقساطی در UI صرفاً توضیح وضعیت اتصال‌نیافته است.

## رابط و جریان کار

اگر feature `ipg` فعال باشد، فرم زرین‌پال merchant ID و sandbox را نمایش می‌دهد. اگر `installment` فعال باشد، کارت توضیح می‌دهد اسنپ‌پی/دیجی‌پی وصل نیستند و گزینه‌ای برای مشتری فعال نمی‌شوند. پایین صفحه جدول تراکنش‌های سفارش با شماره، روش، مبلغ، وضعیت و زمان نسبی یا empty state است؛ فیلتر/جزئیات تراکنش در نسخه فعلی دیده نمی‌شود.

## داده و API

GET /api/r/payments؛ public payment setup و callback در /api/public/pay/callback؛ settings از /api/business.

## قواعدی که بازنویسی باید حفظ کند

مقدار merchant ID، provider و sandbox ذخیره می‌شود از طریق PATCH `/api/business`; provider فعلی فقط زرین‌پال است. IPG بدون merchant ID آماده پرداخت نیست. نتیجه پرداخت فقط با verify callback سمت سرور معتبر است؛ هیچ status موفق از querystring به تنهایی trust نشود.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات واقعی نسخه فعلی

صفحه config را از `settings.ipg` و `settings.installment` می‌سازد (default Zarinpal با merchantId خالی و sandbox=true؛ installment flagهای snappay/digipay false). بخش IPG تنها provider انتخابی فعلی `zarinpal` دارد؛ merchant ID، test/sandbox switch و save settings. بدون merchant ID UI توضیح می‌دهد پرداخت آنلاین برای مشتری قابل نمایش نیست و برگشت باید server Verify داشته باشد.

بخش installment صرفاً توضیح است: اتصال اسنپ‌پی/دیجی‌پی بدون قرارداد/token/آدرس API در این نسخه پیاده نشده و هیچ گزینه‌ای به مشتری عرضه نمی‌کند. تراکنش‌های `/api/r/payments` جدول سفارش، provider، amount، status (paid/failed/pending) و time نسبی را نشان می‌دهد؛ empty state توضیح مسیر آنلاین را می‌دهد. این route از feature `ipg` **یا** `installment` باز می‌شود، اما feature gate جای integration واقعی را نمی‌گیرد.

**پذیرش:** ipg feature off/on، merchant id missing/present، sandbox، payments empty و سه status. موفقیت را از browser query یا client response به‌تنهایی قبول نکن؛ callback Verify سرور مرجع است.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
