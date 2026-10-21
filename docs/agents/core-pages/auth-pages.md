# ورود، ثبت‌نام و شروع دموی رایگان

## نقش و مسیرها

- صفحات: `/login`, `/register`; فرم مشترک در `src/components/auth-form.tsx`.
- هدف: ورود مالک/کارمند/مدیر/پیک با موبایل و OTP، ورود جایگزین ایمیلی برای حساب موجود، و ایجاد کسب‌وکار تازه پس از تأیید شماره.
- `next` فقط با `src/lib/safe-next-path.ts` به مسیر داخلی محدود می‌شود. پارامتر `trial=demo` برای معرفی CTA حفظ می‌شود و شرط دریافت trial نیست.
- CTA «شروع دموی رایگان» صفحه خانه به `/register?trial=demo` می‌رود. `/demo` همچنان درخواست تماس/نمایش همراه کارشناس است و با حساب آزمایشی یکی نیست.

## جریان ثبت‌نام و ورود

ثبت‌نام سه مرحلهٔ client دارد: واردکردن موبایل و درخواست کد؛ تأیید OTP؛ ثبت نام فرد و فروشگاه. تا OTP موفق، نام/اطلاعات فروشگاه به سرور ارسال و user/business ساخته نمی‌شوند. پس از OTP، API یک حالت registration را برمی‌گرداند تا فرم اطلاعات نمایش داده شود. ارسال اطلاعات نهایی به `/api/auth/register/complete` انجام می‌شود.

ورود با OTP در همان فرم است؛ شماره ثبت‌نشده پیام خطای امن و انتقال شمارش‌دار به `/register` دارد. ورود ایمیل/رمز فقط برای حساب‌های موجود است. ثبت‌نام legacy ایمیل/رمز در `/api/auth/register` با 410 رد می‌شود. ورود demo account در `/api/auth/demo` مستقل است و با `NEXT_PUBLIC_DEMO_MODE` کنترل می‌شود.

## قرارداد API

- `POST /api/auth/otp/request`: body `{ phone, purpose: "register"|"login" }`; پاسخ `{ challengeId, expiresIn, resendAfter }`. هنگام ثبت‌نام، کوکی HMAC فقط challenge ID را نگه می‌دارد.
- `POST /api/auth/otp/verify`: body `{ challengeId, code }`; ورود عادی با موفقیت session می‌سازد. برای ثبت‌نام با OTP صحیح، `{ ok:true, registrationRequired:true }` می‌دهد و هنوز account/session نمی‌سازد. هنگام ورود مالک یک business قدیمی با `pending` و بدون هیچ trial history، grant تنظیم‌شده را یک‌بار با transaction بازیابی می‌کند و `trialGranted` برمی‌گرداند.
- `POST /api/auth/register/complete`: body `{ name, businessName, businessType, address? }`; نوع کسب‌وکار باید یکی از `cafe|restaurant|fastfood|bakery|shop` باشد. شماره از challenge تأییدشده و کوکی امضاشده می‌آید. تراکنش user/business و grant Premium Plus را می‌سازد، سپس session ایجاد می‌شود.
- `POST /api/auth/login`: ورود ایمیل/رمز حساب موجود، با rate limit و پاسخ خطای یکسان.
- `POST /api/auth/register`: endpoint قدیمی با HTTP 410؛ فقط OTP ثبت‌نام معتبر است.
- `POST /api/auth/demo`, `/api/auth/return`, `/api/auth/logout`: ورود حساب نمونه، پایان impersonation و خروج؛ guard واقعی route را حفظ کن.

همهٔ ثبت‌نام‌های تازه پس از OTP معتبر و تکمیل اطلاعات فروشگاه grant Premium Plus می‌گیرند؛ درخواست به URL `/register?trial=demo` وابسته نیست. کوکی `registration_flow` در `src/lib/registration-flow.ts` HMAC دارد، HttpOnly/SameSite=Lax است و در تولید Secure می‌شود؛ به challenge ID مقید و ۲۰ دقیقه معتبر است. complete باید challenge ثبت‌نام مصرف‌شده را بررسی کند. نام پلن/مدت از body client پذیرفته نمی‌شود.

پس از تکمیل ثبت‌نام، grant Premium Plus به‌مدت تنظیم‌شده در تنظیمات مدیر ایجاد می‌شود (پیش‌فرض ۱۴ روز؛ مقدار نامعتبر به ۱۴ روز برمی‌گردد). کاربر ابتدا به داشبورد می‌رود تا تور مالک تازه خودکار اجرا شود؛ اگر `next` داخلی دیگری داشته باشد بعد از اتمام یا رد تور به آن مقصد می‌رود. grant داخل تراکنش ساخت حساب ثبت می‌شود و خطای grant حساب نیمه‌فعال نمی‌سازد. حساب‌های pending قدیمی بدون trial history هنگام ورود OTP یا بازکردن داشبورد نیز بازیابی می‌شوند. مشخصات تنظیم و تبدیل پلن بعد از خرید در [سیاست trial](../modules/trial-policy.md) هستند.

در همان transaction ثبت‌نام، `seedBusinessMenuTemplate` با نوع کسب‌وکار انتخاب‌شده اجرا می‌شود. templateهای کافه، رستوران، فست‌فود، نانوایی و فروشگاه دسته‌بندی‌های متفاوت و چند محصول نمونهٔ قابل ویرایش می‌سازند. محصولات اولیه با قیمت صفر و `isAvailable=false` ذخیره می‌شوند تا پیش از تکمیل قیمت و اطلاعات در منوی عمومی یا صندوق فروخته نشوند؛ مدیر پس از بازبینی می‌تواند آن‌ها را ویرایش و فعال کند. ساخت category، product، کسب‌وکار و trial اتمیک است؛ شکست هر بخش کل ثبت‌نام را rollback می‌کند. طرح‌ها در `src/lib/business-menu-template.ts` و نویسندهٔ DB در `src/lib/business-menu-seed.ts` قرار دارند. هیچ migration لازم نیست.

## حالت‌ها و بازسازی

صفحه RTL و responsive است. OTP timer پنج دقیقه است و resend تا ۶۰ ثانیه بسته می‌ماند؛ state موقت challenge/phone/expiry فقط در `sessionStorage` است، ولی اثبات احراز هویت در کوکی HttpOnly قرار دارد. ورود/ثبت‌نام باید busy/error را نشان دهد و اطلاعات حساس را در URL یا log قرار ندهد. پاسخ خطای login نباید وجود حساب یا درستی password را لو بدهد. کد SMS یا demo credential را تست واقعی نکن؛ ارسال provider فقط با mock تست شود.

برای رفتار دقیق trial، آزمون‌های تغییر و قرارداد API، [راهنمای سیاست دوره آزمایشی](../modules/trial-policy.md) و `tests/security-regressions.test.cjs` را بخوان. تست browser باید ترتیب OTP→اطلاعات→داشبورد/تور، فرم موبایل، حفظ `next` و رد OTP نامعتبر را پوشش دهد.

### ورود نمونه در سایت

کلید عمومی `NEXT_PUBLIC_DEMO_MODE` فقط حساب‌ها/داده‌های نمونه و endpoint ورود نمونه را کنترل می‌کند. دوره trial ثبت‌نام جدید، حساب نمونه نیست و برای همهٔ شماره‌های تازه پس از تأیید شماره فعال می‌شود. فرم درخواست نمایش مشاور نیز حساب نمی‌سازد.
