# تبلت و POS

> مشخصات بازسازی ماژول `devices` برای عامل پیاده‌سازی. این سند رفتار و قرارداد ماژول فعلی را خلاصه می‌کند؛ اگر اختلافی با کد زنده وجود داشت، کد و API فعلی منبع حقیقت هستند.

## جایگاه و دسترسی

- مسیر پنل: `/dashboard/devices`
- کامپوننت/منبع فعلی: `src/modules/hardware.tsx — Devices`
- entitlement تعرفه: `tablet_pos`
- هدف: اتصال تبلت آشپزخانه و دستگاه‌های پوز/دریافت درخواست‌های صندوق.

## رابط و جریان کار

DevicePanel برای تولید/مدیریت device code و online status؛ لینک نمایشگر آشپزخانه؛ درخواست‌های POS با polling 4s و نتیجه/خطا و retry/ack طبق device. وضعیت پرینتر و فرستنده‌ی پیجر با `lastSeenAt` حداکثر ۱۵ ثانیه‌ای نمایش داده می‌شود؛ دکمه‌ی پرینتر یک تست چاپ واقعی به همان ایستگاه می‌فرستد و تا نتیجه‌ی عامل منتظر می‌ماند. دکمه‌ی فرستنده‌ی پیجر heartbeat حاصل از probe واقعی عامل را می‌سنجد؛ دریافت فرمان توسط پیجر با تست شماره‌ی پیجر انجام می‌شود.

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

### اتصال و آزمون واقعی پرینتر/پیجر

- `GET /api/device/:code/ping` وضعیت تازه‌ی agent را فقط می‌خواند و timestamp را تغییر نمی‌دهد. برای printer/pager فقط عامل محلی با `POST { connected: true | false }` می‌تواند `lastSeenAt` را ثبت یا پاک کند.
- عامل Windows پیش از polling صف چاپ، صف USB/وضعیت خطا یا بازشدن TCP/COM را بررسی می‌کند. برای پیجر نیز پیش از دریافت فرمان، اتصال TCP/COM را باز می‌کند. خطای probe دستگاه را آفلاین می‌کند؛ timestamp قدیمی پس از ۱۵ ثانیه آنلاین محسوب نمی‌شود.
- POST `/api/r/printjobs` فقط چاپگر همان کسب‌وکار را هدف می‌گیرد و اگر در ۱۵ ثانیه‌ی اخیر heartbeat واقعی نداشته باشد، HTTP 409 می‌دهد. موفقیت نهایی فقط پس از پاسخ عامل ثبت می‌شود. status=`printed` یعنی داده به صف Windows یا درگاه چاپ تحویل شده، نه تأیید فیزیکی خروج کاغذ.
- probe فرستنده‌ی پیجر فقط آماده‌بودن پورت/شبکه را می‌سنجد. پروتکل فعلی acknowledgement از خود pager ندارد؛ برای تأیید دریافت، تست شماره‌ی ۱ را اجرا کنید.
- `bridge.config.json` در تب پیجر شامل host/port یا COM/baud و قالب `format` است. قالب پیش‌فرض `R{n}\\r\\n` است؛ `{n}` شماره‌ی پیجر و escapeهای `\\r` و `\\n` به بایت تبدیل می‌شوند.

## مشخصات سطح پیاده‌سازی

ماژول سه رفتار دارد: `Devices` برای ثبت tablet/POS؛ `PosRequests` برای تأیید عملیات پرداخت؛ `PosSetup` برای خروجی config پل محلی. `DevicePanel` resource `/api/r/dev_tablet` هر ۱۰s poll، code تصادفی ۸ hex از API، name/kind، وضعیت آنلاین بر اساس heartbeat تازه (۱۵s برای printer/pager و ۵ دقیقه برای deviceهای دیگر)، hint endpoint، ping و remove. تبلت route `/tablet/:code` نمایشگر آشپزخانه است.

POS request list هر ۴s poll؛ statuses pending/approved/failed/canceled؛ pending را تأیید دستی (اختیاری refNo) یا failed کن؛ failed/canceled را نیز اگر پول واقعاً کسر شده تأیید دستی کن. این اقدام settlement است و نباید بدون رسید واقعی خودکار done شود.

### عامل جایگزین چاپ به‌صورت Windows Service

- `windows-service-bridge/` عامل مستقل C#/.NET 10 است؛ با اپ Tauri داخل `windows-bridge/` یکی نیست. installer با دسترسی مدیر سرویس `MenuPeakPrinterService` را ثبت می‌کند، startup type آن `Automatic` است و recovery actions فرایند را بعد از crash دوباره اجرا می‌کند.
- نصب‌گر از مدیر فایل `bridge.config.json` دانلودشده از همان پنل را می‌گیرد و در `%ProgramData%\MenuPeak\PrinterService\bridge.config.json` ذخیره می‌کند؛ ACL پوشه به SYSTEM و مدیران محدود می‌شود چون کد اتصال device داخل فایل نقش credential دارد. سرویس تنظیمات را دوره‌ای از همین فایل می‌خواند؛ برای تغییر، Setup را دوباره اجرا می‌کنند. هیچ پنجره‌ای پس از ورود یا reboot لازم نیست.
- عامل فقط پرینترهای `kind=printer` با `transport=tcp` و `transport=usb` را اجرا می‌کند. USB یعنی نام صف spooler نصب‌شده در Windows؛ `printMode=driver` برای متن فارسی/RTL و `raw` برای ESC/POS است. پرینتر شبکه با اتصال TCP و `encoding` موجود در تنظیم پنل کار می‌کند. چند دستگاه با code متفاوت هم‌زمان poll می‌شوند.
- پردازش صف از قرارداد API مشترک `/api/device/:code/ping` و `/api/device/:code/jobs` استفاده می‌کند. قبل از heartbeat، TCP connect یا probe صف Windows انجام می‌شود؛ خطای probe دستگاه را با POST `connected=false` آفلاین می‌کند. چاپ موفق/ناموفق به سرور ack می‌شود و lease پنج‌دقیقه‌ای موجود retry بعد از توقف ناگهانی را حفظ می‌کند.
- فایل log در `%ProgramData%\MenuPeak\PrinterService\service.log` است. سرویس با `services.msc`, `Get-Service MenuPeakPrinterService` و `Restart-Service MenuPeakPrinterService` بررسی می‌شود. نصب مجدد ابتدا سرویس را متوقف می‌کند؛ uninstall سرویس و config/logهای این عامل را پاک می‌کند.
- انتشار در `.github/workflows/windows-printer-service.yml` جدا از workflow عامل Tauri انجام می‌شود؛ خروجی self-contained `win-x64` با Inno Setup به Release `windows-printer-service-latest` می‌رود. پنل هر دو روش دریافت را نشان می‌دهد. سرویس COM، ترازو، پیجر و shareهایی که فقط با credential شخصی کاربر دسترسی دارند پشتیبانی نمی‌کند؛ برای آن‌ها از عامل دسکتاپ استفاده کنید یا صف را machine-wide نصب کنید.
- روی macOS فقط قرارداد source و typecheck قابل بررسی است؛ build نهایی Windows/Inno و نصب/چاپ فیزیکی باید توسط workflow و سخت‌افزار واقعی پذیرش شود.

تسویهٔ `/dashboard/orders` می‌تواند علاوه بر legacy request کامل، plan تفکیکی نقد/بانک/POS/طلب را به `createPosRequest` بدهد. در plan جدید، `pos_requests.amount` فقط سهم POS است و `settlement_plan` مبلغ‌های نقد/بانک/بدهی، بانک مقصدی که از تنظیم خود دستگاه خوانده شده، دستگاه مشخص و کلید idempotency را نگه می‌دارد. فقط دستگاهی که درخواست برایش ساخته شده می‌گیرد؛ order/ledger/receivable پس از callback `approved` نهایی می‌شوند. bridge باید برای آزمایش مبلغ را از `amountToman` بگیرد و ریال ارسالی را برابر همین سهم (`amountRial`) بسازد؛ جمع کل فاکتور را دوباره ارسال نکند.

`PosSetup` پروتکل‌ها: saman-ssp1126 over TCP/serial؛ HTTP محلی با URL/method/body/successPath/refPath؛ executable با args؛ raw TCP/serial با request frame, LRC, response end/regex. JSON config شامل server origin, pollSeconds=2 و devices است و باید طبق کنترل‌های همین UI ساخته/کپی شود. نوع serial/network روی browser انجام نمی‌شود؛ local bridge عامل اجرای config است. فایل `docs/DEVICES.md`/agent implementation را با source فعلی تطبیق بده.

**پذیرش:** code/URL درست، offline ping، pending/failed payment, protocol config fields, clipboard/download، secret handling، و عدم اعلام payment=paid صرفا از `request sent`.

## مرجع بازسازی

برای جزئیات دقیق فیلدها، ترتیب کنترل‌ها، پیام‌های فارسی و قرارداد typeها، فایل منبع بالا را همراه API route متناظر در `src/app/api` بخوان. این راهنما رفتار را مشخص می‌کند و جایگزین بررسی source-of-truth نیست.
