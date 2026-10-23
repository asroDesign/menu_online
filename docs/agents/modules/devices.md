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

برای دستگاه‌های `kind=pos`، فیلد اختیاری `terminalNumber` شمارهٔ واقعی ترمینال بانکی را نگه می‌دارد و هنگام ساخت یا ویرایش همان کارت دستگاه قابل ثبت است. این مقدار از `code` اتصال جداست: شماره ترمینال در انتخاب پوز، snapshot تسویه و تفصیلی/گزارش حسابداری استفاده می‌شود و کد اتصال در API انتخاب تسویه ارسال نمی‌شود. فیلد دیتابیس در migration `0046_order_tender_settlement.sql` افزوده شده است.

روی هر کارت POS، بخش «تنظیم مقصد و محل استفاده» شماره ترمینال، حساب بانکی تسویه، و دو کانال مستقل «صندوق سفارش» و «کیوسک» را نگه می‌دارد. برای فعال کردن هر کانال حساب بانکی متعلق به همان کسب‌وکار الزامی است؛ دستگاه تازه و دستگاه‌های قبلی تا زمان تنظیم مدیر به هیچ‌کدام از کانال‌ها وصل نیستند. داده‌ها در ستون‌های `devices.settlement_bank_account_id`, `cashier_enabled`, `kiosk_enabled` ذخیره می‌شوند و migration `0047_pos_routing_settings.sql` آن‌ها را اضافه می‌کند. rollback فقط وقتی مجاز است که هیچ دستگاهی به حساب یا کانال متصل نباشد.

`GET /api/orders/settlement-options` فقط شناسه و نام دستگاه، شماره ترمینال، نام بانک مقصد، وضعیت آنلاین و پرچم‌های کانال را در tenant نشست برمی‌گرداند؛ `devices.code` و رمز اتصال bridge هرگز جزو گزینه‌های پرداخت نیست. این endpoint برای ماژول تنظیم دستگاه با یکی از entitlementهای `tablet_pos` یا `cashier_pos` مجاز است. انتخاب/تغییر حساب و کانال از PATCH همان resource دستگاه انجام می‌شود و backend مالکیت حساب و الزام حساب برای کانال روشن را بررسی می‌کند.

در فرم تنظیم کیوسک، فقط دستگاه‌های `kioskEnabled` و دارای حساب مقصد فهرست می‌شوند. اگر چند دستگاه وجود داشته باشد مدیر یکی را برای کیوسک ترجیح می‌دهد؛ زمان پرداخت، سرور در صورت آفلاین بودن ترجیح ذخیره‌شده به پوز آنلاین دیگری که برای کیوسک مجاز شده برمی‌گردد. در صورت نبود دستگاه مجاز یا آنلاین پرداخت کیوسکی رد می‌شود و سفارش بدون درخواست پرداخت ساخته/نگه‌داری نمی‌شود.

- وضعیت‌های loading، خطا، داده خالی و موفقیت را جدا و قابل فهم نشان بده؛ خطا را با امکان تلاش مجدد مدیریت کن.
- رابط فارسی و RTL، ارقام فارسی، پول تومان، و تاریخ‌های شمسی را مطابق ابزارهای مشترک پروژه نمایش بده.
- layout را برای موبایل/تبلت/دسکتاپ بازسازی کن؛ فرم‌ها و جدول‌ها در عرض کم قابل استفاده بمانند و اکشن اصلی از دسترس خارج نشود.
- عملیات را با componentهای مشترک `src/components/ui.tsx`, `src/components/resource-page.tsx` و `src/lib/api.ts` هم‌راستا کن؛ بعد از mutation فهرست/cache را تازه کن.
- tenant isolation، احراز هویت، entitlement و نقش باید سمت API نیز enforce شود؛ مخفی کردن دکمه به‌تنهایی مجوز نیست.

## مشخصات سطح پیاده‌سازی

ماژول سه رفتار دارد: `Devices` برای ثبت tablet/POS؛ `PosRequests` برای تأیید عملیات پرداخت؛ `PosSetup` برای خروجی config پل محلی. `DevicePanel` resource `/api/r/dev_tablet` هر ۱۰s poll، code تصادفی ۸ hex از API، name/kind، online اگر lastSeen کمتر از ۵ دقیقه، hint endpoint، ping و remove. تبلت route `/tablet/:code` نمایشگر آشپزخانه است.

POS request list هر ۴s poll؛ statuses pending/approved/failed/canceled؛ pending را تأیید دستی (اختیاری refNo) یا failed کن؛ failed/canceled را نیز اگر پول واقعاً کسر شده تأیید دستی کن. این اقدام settlement است و نباید بدون رسید واقعی خودکار done شود.

تسویهٔ `/dashboard/orders` می‌تواند علاوه بر legacy request کامل، plan تفکیکی نقد/بانک/POS/طلب را به `createPosRequest` بدهد. در plan جدید، `pos_requests.amount` فقط سهم POS است و `settlement_plan` مبلغ‌های نقد/بانک/بدهی، بانک مقصدی که از تنظیم خود دستگاه خوانده شده، دستگاه مشخص و کلید idempotency را نگه می‌دارد. فقط دستگاهی که درخواست برایش ساخته شده می‌گیرد؛ order/ledger/receivable پس از callback `approved` نهایی می‌شوند. bridge باید برای آزمایش مبلغ را از `amountToman` بگیرد و ریال ارسالی را برابر همین سهم (`amountRial`) بسازد؛ جمع کل فاکتور را دوباره ارسال نکند.

`PosSetup` پروتکل‌ها: saman-ssp1126 over TCP/serial؛ HTTP محلی با URL/method/body/successPath/refPath؛ executable با args؛ raw TCP/serial با request frame, LRC, response end/regex. JSON config شامل server origin, pollSeconds=2 و devices است و باید طبق کنترل‌های همین UI ساخته/کپی شود. نوع serial/network روی browser انجام نمی‌شود؛ local bridge عامل اجرای config است. فایل `docs/DEVICES.md`/agent implementation را با source فعلی تطبیق بده.

**پذیرش:** code/URL درست، offline ping، pending/failed payment, protocol config fields, clipboard/download، secret handling، و عدم اعلام payment=paid صرفا از `request sent`.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
