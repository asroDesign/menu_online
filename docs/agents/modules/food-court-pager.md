# پیجر فودکورت

> مشخصات بازسازی ماژول `food-court-pager` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/food-court-pager`
- کامپوننت/منبع فعلی: `src/modules/hardware.tsx — FoodCourtPager`
- entitlement تعرفه: `foodcourt_pager`
- هدف: اتصال دستگاه pager و تحویل شماره/پیجر به سفارش آماده.

## رابط و جریان کار

ثبت و وضعیت پیجرها با poll 5s؛ دریافت سفارش‌های pending/preparing/ready؛ انتخاب سفارش و پیجر و assign؛ کارت وضعیت پیجر/شماره سفارش؛ DevicePanel.

## داده و API

GET/CRUD /api/r/pagers؛ GET orders pending/preparing/ready limit80؛ POST /api/r/pagerack {ids}؛ /api/device/:code/pager.

## قواعدی که بازنویسی باید حفظ کند

یک pager همزمان به یک سفارش فعال؛ آزادسازی هنگام تحویل/لغو؛ وضعیت دستگاه و سفارش همگام و tenant-scoped.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

Pager record `number,status,orderId,orderNumber,ringRequestedAt,ringSentAt`; grid statuses free/busy/ringing. افزودن شماره integer 1..9999؛ حذف؛ free را به سفارش فعال تخصیص می‌دهد. Modal سفارش‌های pending/preparing/ready بدون pager را می‌چیند؛ order آماده مستقیم ringing، سایر وضعیت‌ها busy. Busy: «زنگ بزن» status را ringing می‌کند؛ هر nonfree: آزادسازی و پاک‌کردن orderId. Pager list poll 5s.

Serial bridge `SerialPagerBridge` از Web Serial API (HTTPS + Chrome/Edge) port را با baud قابل تنظیم باز می‌کند؛ default baud 9600، command template `R{n}
`, token `{n}` یا zero-padded `{n:3}`. تنظیمات fmt/baud در localStorage. برای pager با status ringing و request جدید، writer command را می‌فرستد؛ موفقیت id در POST `/api/r/pagerack` acknowledge می‌شود و list reload. DevicePanel فرستنده شبکه‌ای `/api/r/dev_pager` جدا دارد. راهنمای local bridge در `docs/DEVICES.md`.

در عامل Windows، تنظیمات همان صفحه deviceهای `dev_pager` را با TCP یا Serial به فایل ترکیبی bridge config اضافه می‌کند. عامل پیش از polling صف اتصال واقعی پورت را باز و heartbeat می‌فرستد؛ ping صفحه فقط این heartbeat حداکثر ۱۵ ثانیه‌ای را می‌خواند. probe دریافت فرمان توسط pager را تأیید نمی‌کند؛ تست شمارهٔ ۱ یا زنگ‌زدن یک پیجر واقعی برای بررسی خروجی لازم است. ACK سرور فعلی یعنی فرمان به فرستنده ارسال شده و خود pager تأیید مستقیمی نمی‌دهد.

**پذیرش:** no serial support، permission denied، serial connection, template escape، failed write بدون ack، ring duplicate prevention، busy/free lifecycle، order delivered auto-free, multiple pager assignment.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
