# تنظیم کیوسک

> مشخصات بازسازی ماژول `kiosk` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/kiosk`
- کامپوننت/منبع فعلی: `src/modules/kiosk.tsx — Kiosk`
- entitlement تعرفه: `kiosk`
- هدف: تنظیم نمایشگر سفارش‌گیری خودکار مشتری و دستگاه‌های POS.

## رابط و جریان کار

تنظیم فعال/غیرفعال، قالب و رفتار کیوسک در فرم بخش‌بندی‌شده؛ مشاهده دستگاه‌های متصل POS و وضعیت آنلاین؛ دکمه بازکردن تجربه مشتری در مسیر عمومی کیوسک. تغییرات settings تا فشردن ذخیره محلی‌اند.

## داده و API

GET /api/r/dev_tablet (انتخاب kind=pos)؛ GET /api/business؛ PATCH /api/business با settings.kiosk؛ لینک عمومی /kiosk/:slug.

## قواعدی که بازنویسی باید حفظ کند

اعتبار entitlement روی route و سرور پابرجا باشد؛ تنظیمات ناقص با پیش‌فرض امن پر شوند؛ آدرس کیوسک از slug همین کسب‌وکار ساخته شود.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

### تنظیمات و پیش‌نمایش

`settings.kiosk` با پیش‌فرض‌های `template=classic`, title/subtitle خالی، `idleSeconds=90`, `allowCounter=true`, `allowOnline=false`, `askPhone=true`, `allowPos=false` ساخته می‌شود. پنج کارت template: classic, photo, simple, dark و wizard؛ هر کارت یک mock تصویری و توضیح دارد و لینک full-screen preview با query `?template=` می‌دهد. تنظیمات اصلی: welcome title/subtitle، reset idle بین ۳۰ تا ۶۰۰ ثانیه، قبول پرداخت صندوق، درخواست اختیاری موبایل، POS و IPG.

### اتصال پرداخت

دستگاه‌های `/api/r/dev_tablet` هر ۱۰ ثانیه refresh و فقط `kind=pos` نگه داشته می‌شوند. دستگاه آنلاین است اگر `lastSeenAt` کمتر از ۴۵ ثانیه باشد. `allowPos` تنها زمانی قابل فعال‌سازی است که feature `tablet_pos` وجود داشته باشد؛ انتخاب دستگاه مشخص یا «هر دستگاه متصل» دارد. اگر POS ثبت نشده راهنمای رفتن به Devices نشان بده؛ اگر offline است UI اعلام کند گزینه در کیوسک فعال نمی‌شود. `allowOnline` تنها با `ipg` entitlement و `merchantId` ذخیره‌شده قابل فعال‌سازی است.

لینک `/kiosk/:slug` همراه QR، copy و open all-screen عرضه شود. dirty state با JSON snapshot از config تشخیص داده شود و نوار ذخیره پایین viewport داشته باشد. ذخیره فقط `PATCH /api/business {settings:{kiosk:cfg}}` است.

**پذیرش:** تغییرات ذخیره‌نشده/ذخیره‌شده، locked entitlement، POS offline/online، نبود دستگاه، پیش‌نمایش هر ۵ template و لینک QR قابل کپی را بررسی کن.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
