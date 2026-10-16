# سفارش‌گیر صندوق

> مشخصات بازسازی ماژول `cashier` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/cashier`
- کامپوننت/منبع فعلی: `src/modules/waiter.tsx — Waiter در mode=cashier`
- entitlement تعرفه: `cashier_pos`
- هدف: ثبت سفارش و تسویه در صندوق، با انتخاب میز از modal داخل سفارش جاری.

## رابط و جریان کار

همان کاتالوگ و سبد سفارش‌گیر، همراه انتخاب میز/نوع سفارش؛ در mode صندوق گزینه روش پرداخت، کد تخفیف و استفاده از اعتبار وفاداری؛ خلاصه فاکتور، مالیات/سرویس و دکمه ثبت.

## داده و API

GET /api/products, /api/categories, /api/tables, /api/staff, /api/business, /api/r/zones؛ GET /api/public/:slug/customer?phone=؛ GET /api/public/:slug/discount؛ POST /api/orders.

## قواعدی که بازنویسی باید حفظ کند

قیمت و تخفیف باید server-validated؛ فقط mode صندوق کنترل payment/discount را دارد؛ subtotal/tax/service/total از داده معتبر تشکیل شوند؛ جلوی ثبت تکراری با busy state گرفته شود.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Cashier همان `Waiter` با `mode="cashier"` است، اما query `?phone=` می‌تواند شماره تماس را prefill کند و با feature `delivery_order` شروع را روی delivery بگذارد. پنل معمول: کاتالوگ قابل جست‌وجو + دسته‌بندی؛ سبد با انتخاب نوع سفارش/میز؛ اطلاعات گارسون و نام مشتری؛ محاسبه خلاصه پایین. میز از modal قابل جست‌وجو انتخاب می‌شود و اگر میز order فعال دارد، checkbox «افزودن به سفارش جاری» دارد.

صندوق تنها mode با controls اضافه است: موبایل برای باشگاه/cashback؛ پیش‌سفارش شمسی و زمان‌دار؛ discount code server-checked؛ تخفیف دستی fixed یا percent (حداکثر ۱۰۰٪، UI محدود به subtotal)؛ cashback balance؛ پرداخت `cash`, `pos`, `card` یا `later`; آدرس/نقشه/zone برای delivery. Tax از taxPercent و service از servicePercent کسب‌وکار محاسبه می‌شود؛ service برای delivery صفر؛ delivery fee از zone انتخابی است. اگر order جاری append شود، discount controls غیرفعال می‌شوند.

payload POST `/api/orders`: فقط productId/quantity برای اقلام و business fields برای سفارش؛ `payNow` فقط در صندوق و فقط cash/pos/card. سرور قیمت را دوباره حساب می‌کند. UI total preview منبع حقیقت مالی نیست.

**پذیرش:** تست میز/بیرون‌بر/delivery، کد نامعتبر، مبلغ درصدی، عضو و غیرعضو cashback، `later` در مقابل `payNow`, پیش‌سفارش شمسی، خالی‌بودن cart و حفظ داده پس از خطای شبکه. دکمه submit در Chrome viewport کوچک نباید زیر fold/footer پنهان شود.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
