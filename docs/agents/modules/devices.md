# تبلت و POS

> مشخصات بازسازی ماژول `devices` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/devices`
- کامپوننت/منبع فعلی: `src/modules/hardware.tsx — Devices`
- entitlement تعرفه: `tablet_pos`
- هدف: اتصال تبلت آشپزخانه و دستگاه‌های پوز/دریافت درخواست‌های صندوق.

## رابط و جریان کار

DevicePanel برای تولید/مدیریت device code و online status؛ لینک نمایشگر آشپزخانه؛ درخواست‌های POS با polling 4s و نتیجه/خطا و retry/ack طبق device.

## داده و API

GET/CRUD /api/r/dev_tablet؛ GET /api/r/posrequests (poll 4s)؛ POST /api/r/posrequests؛ ping/action /api/device/:code/*.

## قواعدی که بازنویسی باید حفظ کند

کد دستگاه secret است و یک‌بار امن نمایش داده شود؛ route device باید token/code validate کند؛ polling متوقف در unmount.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

ماژول سه رفتار دارد: `Devices` برای ثبت tablet/POS؛ `PosRequests` برای تأیید عملیات پرداخت؛ `PosSetup` برای خروجی config پل محلی. `DevicePanel` resource `/api/r/dev_tablet` هر ۱۰s poll، code تصادفی ۸ hex از API، name/kind، online اگر lastSeen کمتر از ۵ دقیقه، hint endpoint، ping و remove. تبلت route `/tablet/:code` نمایشگر آشپزخانه است.

POS request list هر ۴s poll؛ statuses pending/approved/failed/canceled؛ pending را تأیید دستی (اختیاری refNo) یا failed کن؛ failed/canceled را نیز اگر پول واقعاً کسر شده تأیید دستی کن. این اقدام settlement است و نباید بدون رسید واقعی خودکار done شود.

`PosSetup` پروتکل‌ها: saman-ssp1126 over TCP/serial؛ HTTP محلی با URL/method/body/successPath/refPath؛ executable با args؛ raw TCP/serial با request frame, LRC, response end/regex. JSON config شامل server origin, pollSeconds=2 و devices است و باید طبق کنترل‌های همین UI ساخته/کپی شود. نوع serial/network روی browser انجام نمی‌شود؛ local bridge عامل اجرای config است. فایل `docs/DEVICES.md`/agent implementation را با source فعلی تطبیق بده.

**پذیرش:** code/URL درست، offline ping، pending/failed payment, protocol config fields, clipboard/download، secret handling، و عدم اعلام payment=paid صرفا از `request sent`.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
