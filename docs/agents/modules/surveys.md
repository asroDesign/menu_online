# نظرسنجی

> مشخصات بازسازی ماژول `surveys` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/surveys`
- کامپوننت/منبع فعلی: `src/modules/growth-a.tsx — Surveys`
- entitlement تعرفه: `surveys`
- هدف: ساخت پرسش‌نامه و بررسی بازخورد مشتری.

## رابط و جریان کار

CRUD نظرسنجی و پرسش‌ها؛ وضعیت انتشار؛ لینک/QR فرم؛ modal نتایج با تعداد پاسخ و توزیع/متن پاسخ؛ دسته‌بندی نوع سوال و مرتب‌سازی.

## داده و API

ResourcePage /api/r/surveys؛ GET /api/r/surveys/:id برای نتایج؛ فرم عمومی /api/public/survey/:id.

## قواعدی که بازنویسی باید حفظ کند

پاسخ‌دهی عمومی فقط برای survey فعال؛ ورودی‌ها در سرور validate و داده مشتری حداقلی بماند؛ نتایج فقط tenant خود را نشان دهد.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Survey record: `title,description,questions,isActive,responseCount,createdAt`. هر question id/text/type; type یکی از `rating|choice|text`; choice options آرایه است. modal create/edit اجازه افزودن/ویرایش/حذف/reorder سوالات؛ قبل save نام title اجباری، حداقل یک سوال nonblank و choice حداقل ۲ گزینه. گزینه‌ها با comma، Persian comma یا newline شکسته می‌شوند. سوال جدید default rating است.

کارت list status switch، response count، actions edit/share/results/delete دارد. share modal باید URL عمومی `/survey/:id` و QR ایجاد کند (origin فقط client بعد mount می‌آید). results از GET `/api/r/surveys/:id` می‌آید و responses تا حداکثر ۵۰۰ ردیف را سرور می‌دهد. CRUD survey با `isActive` default true و پاسخ عمومی فقط به survey فعال submit شود.

**پذیرش:** draft invalid، survey بدون سوال، choice یک گزینه، نتیجه بدون پاسخ، لینک/QR copy، فعال/غیرفعال، و خطای save/list. پاسخ free-text را safe render کن و هیچ پاسخ tenant دیگری را افشا نکن.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
