# ترازو

> مشخصات بازسازی ماژول `scale` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/scale`
- کامپوننت/منبع فعلی: `src/modules/hardware.tsx — Scale`
- entitlement تعرفه: `scale`
- هدف: اتصال ترازو و نگاشت وزن به محصول فروشی.

## رابط و جریان کار

DevicePanel با online state polling 3s؛ فهرست محصولات قابل وزن؛ دستگاه وزن دریافتی؛ نمایش weight/value آخر و تست endpoint.

## داده و API

GET/CRUD /api/r/dev_scale؛ GET /api/products؛ device POST /api/device/:code/weight {value}.

## قواعدی که بازنویسی باید حفظ کند

واحد وزن و تبدیل kg/g شفاف؛ وزن منفی/غیرمنطقی رد؛ server authoritative برای قیمت وزن‌دار؛ پشتیبانی transport در local agent USB/network.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Scale page: device resource `/api/r/dev_scale` poll هر ۳s، محصولات `/api/products`, `BridgeSetup` instruction/config، انتخاب یک scale و یک product. محصول price به عنوان قیمت هر کیلوگرم تلقی می‌شود؛ وزن `lastValue` kg با سه رقم اعشار و due `round(weight*price)`. ورود دستی وزن (kg) فقط برای تست/simulate است و با update device.lastValue اعمال می‌شود؛ negative/NaN رد.

`DevicePanel` endpoint hint POST `/api/device/:code/weight {value}`؛ bridge باید وزن سخت‌افزار USB/network را به همین resource/device route بدهد. UI رندر وزن و total، نه checkout قطعی. ثبت محصول وزن‌دار و قیمت server در order parser باید یکسان باشد.

**پذیرش:** وزن صفر، سه اعشار، product/scale absent، invalid negative، bridge offline، و تغییر محصول/دستگاه. وزن از browser query قابل اعتماد مالی نیست؛ server price calculation authoritative.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
