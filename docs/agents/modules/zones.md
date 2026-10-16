# مناطق ارسال

> مشخصات بازسازی ماژول `zones` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/zones`
- کامپوننت/منبع فعلی: `src/modules/hardware.tsx — Zones`
- entitlement تعرفه: `zones`
- هدف: تعریف محدوده‌های پیک با هزینه و شعاع/موقعیت.

## رابط و جریان کار

ResourcePage برای نام منطقه، هزینه ارسال، شعاع کیلومتر و مشخصات نقشه؛ CRUD و وضعیت؛ zone picker به سایر جریان‌ها feed می‌شود.

## داده و API

ResourcePage /api/r/zones؛ نقشه مشترک MapPicker; مصرف در waiter/public checkout.

## قواعدی که بازنویسی باید حفظ کند

شعاع/هزینه غیرمنفی؛ مختصات validate؛ بررسی اینکه آدرس داخل محدوده است سمت سرور.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Zone fields: name اجباری، fee تومان، minOrder، etaMinutes، radiusKm، areas متن آزاد، isActive. صفر fee به «رایگان»، صفر minimum به خط تیره و radius=0 به «دستی» ترجمه می‌شود. radius غیرصفر بر اساس موقعیت کسب‌وکار از تنظیمات نقشه auto zone selection می‌دهد؛ `areas` sample محله‌های comma separated. ResourcePage list/search از endpoint `/api/r/zones`؛ selectorهای checkout و cashier فقط zone مناسب/فعال را باید مصرف کنند.

UI این صفحه CRUD می‌کند؛ server logic باید minOrder/area/radius/distance و fee واقعی را validate کند. cashier/public order `zoneId`/مختصات می‌فرستد و سرور بر اساس zone معتبر fee را دوباره محاسبه کند.

**پذیرش:** رایگان، min order، radius manual/automatic، مختصات رستوران تعریف‌نشده، غیرفعال و search؛ منطقه خارج از محدوده نباید با دستکاری client پذیرفته شود.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
