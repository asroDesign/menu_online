# کدهای تخفیف

> مشخصات بازسازی ماژول `discounts` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/discounts`
- کامپوننت/منبع فعلی: `src/modules/growth-a.tsx — Discounts`
- entitlement تعرفه: `discount`
- هدف: CRUD کدهای تخفیف و قواعد اعمال.

## رابط و جریان کار

ResourcePage برای کد، نوع/مقدار تخفیف، محدودیت استفاده، حداقل خرید و بازه اعتبار/فعال بودن؛ نمایش وضعیت و حذف/ویرایش.

## داده و API

ResourcePage /api/r/discounts؛ اعتبارسنجی عمومی سفارش در /api/public/:slug/discount و سمت سرور هنگام order submit.

## قواعدی که بازنویسی باید حفظ کند

کد تخفیف صرفاً نمایش رابط نیست؛ بازه، حداقل سفارش، سقف/تعداد مصرف و کسب‌وکار باید server-side بررسی شوند.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Code record: `code,type,value,minOrder,maxUses,usedCount,expiresAt,isActive`. فرم type برابر percent/fixed؛ code انگلیسی LTR uppercase، value لازم، minOrder تومان، maxUses=0 یعنی نامحدود، expiry شمسی optional، active toggle. list code mono, درصد یا مبلغ، حداقل سفارش، counter `used of max`, expiry و badge مشتق‌شده: expired اولویت دارد، سپس exhausted، سپس active/inactive.

API registry normalizes code با uppercase و حذف whitespace؛ percent بالاتر از ۱۰۰ را 400 می‌کند؛ fixed/percent حداقل value=1 و required؛ discount check عمومی `/api/public/:slug/discount` صرفاً preview است و createOrder باید دوباره validate و مصرف را اتمیک ثبت کند. همین کد در public menu و mode صندوق قابل استفاده است؛ waiter mode اجازه کد ندارد.

**پذیرش:** case-insensitive code، ناموجود، حداقل خرید، expire، سقف مصرف و رقابت دو سفارش آخر. تاریخ انقضا UI Jalali ولی API date/ISO است.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
