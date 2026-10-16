# گزارش فروش

> مشخصات بازسازی ماژول `reports` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/reports`
- کامپوننت/منبع فعلی: `src/modules/finance.tsx — Reports`
- entitlement تعرفه: `sales_reports`
- هدف: خلاصه فروش و تحلیل سفارش‌ها در بازه انتخابی.

## رابط و جریان کار

گزینش ۷/۱۴/۳۰ روز، loading/error؛ کارت جمع فروش، سفارش، متوسط فاکتور، نمودار روزانه، آیتم‌ها/وضعیت‌ها بر اساس پاسخ؛ ارقام فارسی.

## داده و API

GET /api/r/report_sales?days=n.

## قواعدی که بازنویسی باید حفظ کند

بازه شمسی/UTC طبق backend؛ مبالغ از تراکنش سفارش پرداخت‌شده؛ نمودار خالی/صفر بدون crash؛ نمایش واحد تومان.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

پیش‌فرض بازه ۱۴ روز؛ selectorها ۷/۱۴/۳۰ روز و تغییرشان GET `/api/r/report_sales?days=n` می‌زند. پاسخ: totals revenue/orders/avg/discounts/tax؛ series روزانه revenue/orders؛ hours تعداد سفارش؛ روش پرداخت method/amount/count؛ type سفارش؛ byProduct name/emoji/qty/revenue؛ byCategory name/revenue/qty. KPIها پنج کارت فروش، تعداد سفارش، میانگین، تخفیف و مالیات. سپس bar فروش روزانه، horizontal bars دسته و ۱۰ محصول، bar سفارش بر ساعت، دو بخش روش پرداخت و نوع سفارش.

فقط سفارش‌های پرداخت‌شده در این گزارش لحاظ می‌شوند (subtitle). map پرداخت شامل cash/pos/card/ipg/snappay/digipay/cashback و نوع dine_in/takeaway/delivery است. `useReport` درخواست قبلی را با live flag بی‌اثر می‌کند؛ هنگام خطا ErrorState، هنگام null skeleton. empty arrays باید «داده‌ای نیست» نشان دهند و chart max حداقل ۱ می‌ماند تا division by zero نشود.

**پذیرش:** هر سه بازه، پاسخ صفر، method/type ناشناخته (fallback raw key)، تاریخ شمسی، درآمد منفی/صفر و tooltip readable؛ اعداد از API authoritative.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
