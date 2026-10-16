# بهای تمام‌شده

> مشخصات بازسازی ماژول `costing` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/costing`
- کامپوننت/منبع فعلی: `src/modules/inventory.tsx — Costing`
- entitlement تعرفه: `costing`
- هدف: تحلیل حاشیه سود هر محصول با نرخ مواد اولیه جاری.

## رابط و جریان کار

جدول/کارت محصول با فروش، بهای recipe، سود ناخالص و درصد margin؛ نشان‌دادن محصولات بدون recipe؛ بازکردن جزئیات خطوط مواد و هزینه واحد؛ آمار میانگین حاشیه سود محصولات recipeدار.

## داده و API

GET /api/r/costing؛ recipe و item data در سرور محاسبه شده.

## قواعدی که بازنویسی باید حفظ کند

قیمت تمام‌شده از recipe*costPerUnit و منبع server؛ بدون recipe با صفر اشتباه نشود؛ درصد حاشیه برای price=0 تقسیم بر صفر نکند.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

GET `/api/r/costing` فهرست محصول شامل price, cost, hasRecipe, margin, marginPct, lines{name,unit,qty,cost}. سه KPI: count محصول دارای formula از کل، میانگین marginPct فقط از recipeدارها و کم‌سودترین recipeدار. جدول روی اول recipeدارها و بعد margin کمتر مرتب می‌شود. ستون محصول، فروش، cost، margin و bar marginPct با threshold زیر ۴۰ قرمز، زیر ۶۰ amber، در غیر این صورت سبز. ردیف بدون recipe به جای هزینه صفر متن «فرمول ساخت تعریف نشده» و جزئیاتش باز نمی‌شود.

Click row باز/بسته کردن detail row lines؛ هزینه از recipe quantity × latest costPerUnit محاسبه شده در endpoint. Empty state اگر product list خالی باشد به تعریف محصول و recipe اشاره کند.

**پذیرش:** بدون formula، formula با ماده حذف‌شده، price=0، margin منفی، حاشیه بیش از ۱۰۰، cost updates و table overflow. clamp bar بین ۰-۱۰۰ را حفظ کن و API را مرجع رقم قرار بده.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
