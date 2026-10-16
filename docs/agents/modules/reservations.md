# رزرو میز

> مشخصات بازسازی ماژول `reservations` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/reservations`
- کامپوننت/منبع فعلی: `src/modules/reservations.tsx — Reservations`
- entitlement تعرفه: `reservations`
- هدف: مدیریت درخواست‌های رزرو عمومی، ظرفیت میز و پیش‌پرداخت.

## رابط و جریان کار

کارت هر رزرو: مشتری/تلفن، زمان شمسی، تعداد نفر، میز، مدت، مبلغ و روش پیش‌پرداخت، یادداشت و badge وضعیت؛ لینک عمومی قابل بازکردن/کپی؛ اکشن تأیید، رد، لغو، ثبت پرداخت، تکمیل یا no-show؛ تازه‌سازی/poll 30s.

## داده و API

GET /api/r/reservations؛ PATCH /api/r/reservations/:id؛ GET /api/business برای slug؛ ثبت عمومی /api/public/:slug/reservations.

## قواعدی که بازنویسی باید حفظ کند

رد/تأیید باید مطابق قرارداد backend پیامک را trigger کند؛ پیش‌پرداخت pending مانع confirmed شدن است؛ ظرفیت تداخل زمانی در سرور کنترل شود؛ Persian/Jalali date.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Reservation fields: customerName/Phone, guestCount, startsAt, durationMinutes, tableName, status, depositAmount/depositStatus/depositMethod, note, optional `smsNotification`. فهرست poll هر ۳۰ ثانیه؛ وضعیت map: requested/confirmed/cancelled/completed/no_show. بالای صفحه CTA لینک `/m/:slug/reserve`، کپی URL مطلق و توضیح رزرو ظرفیت میز را تا پایان duration نگه می‌دارد.

کارت رزرو تاریخ/ساعت شمسی، تعداد نفر/مدت، میز، مبلغ/وضعیت پیش‌پرداخت، note و روش cash/bank/card را نشان می‌دهد. transition: اگر deposit pending باشد action «ثبت دریافت و تأیید» patch `{depositPaid:true,depositMethod:"cash"}`؛ اگر پرداخت لازم نیست و status هنوز confirmed نیست، «تأیید رزرو»؛ confirmed می‌تواند completed یا no_show شود؛ requested می‌تواند reject/cancel شود. update پاسخ `smsNotification` دارد؛ اگر ارسال failed/skipped، رزرو ذخیره شده اما toast علت شکست را نشان دهد.

**پذیرش:** بدون slug لینک disabled، clipboard fail، deposit pending مانع تأیید خودکار، terminal statuses بدون actions، پیامک موفق/ناموفق، و reload داده بعد از mutation. بررسی ظرفیت/تداخل از UI انجام نمی‌شود و باید در API عمومی/مدیریتی enforce شود.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
