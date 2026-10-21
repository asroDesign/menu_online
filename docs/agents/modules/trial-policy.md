# ثبت‌نام دمو و سیاست دوره آزمایشی

## نقش و نتیجه محصول

این جریان برای هر حساب تازه‌ای است که شماره موبایلش تأیید شده و اطلاعات فروشگاه را کامل می‌کند. حساب تازه یک grant از پلن **Premium Plus** به‌مدت تعیین‌شده در تنظیمات مدیر می‌گیرد؛ مقدار پیش‌فرض ۱۴ روز است. دریافت trial به ورود از لینک خاص یا query string وابسته نیست. پس از ورود، وضعیت `setupTourCompletedAt = NULL` موجب اجرای خودکار تور راه‌اندازی در داشبورد می‌شود.

لینک `/register?trial=demo` همچنان ورودی معرفی دموی رایگان است، اما همهٔ ثبت‌نام‌های تازه پس از تأیید شماره و تکمیل مشخصات فروشگاه trial می‌گیرند. endpoint قدیمی ایمیل/رمز `/api/auth/register` با 410 غیرفعال است؛ ورود ایمیلی برای حساب‌های موجود در `/api/auth/login` باقی است.

## مسیر کاربر

1. `src/app/page.tsx` لینک `/register?trial=demo` را به‌عنوان CTA دموی رایگان نشان می‌دهد. `/demo` همچنان فرم درخواست نمایش همراه کارشناس است و معنای دیگری دارد.
2. `src/app/register/page.tsx` پارامتر `trial=demo` را به `AuthForm` می‌دهد. `next` همچنان با `safeNextPath` محدود به مسیر داخلی می‌شود.
3. `src/components/auth-form.tsx` در ثبت‌نام سه مرحله دارد: موبایل، کد OTP و اطلاعات شخص/فروشگاه. تا پیش از تأیید OTP حسابی ساخته نمی‌شود. در مرحله آخر `name`, `businessName`, `businessType` و نشانی اختیاری گرفته می‌شوند؛ شماره موبایل تأییدشده از challenge سرور می‌آید و فرم نمی‌تواند آن را جایگزین کند. نوع کسب‌وکار از گزینه‌های کافه، رستوران، فست‌فود، نان و شیرینی یا فروشگاه انتخاب می‌شود.
4. ثبت‌نام از endpoint عمومی `POST /api/auth/otp/request` کد درخواست می‌کند. سرور چالش را می‌سازد و کوکی `registration_flow` را با HMAC کلید `OTP_SECRET` امضا می‌کند؛ این کوکی فقط challenge ID را نگه می‌دارد، HttpOnly، SameSite=Lax، در تولید Secure، محدود به `/api/auth` و حداکثر ۲۰ دقیقه معتبر است.
5. `POST /api/auth/otp/verify` کوکی را با challenge ID تطبیق می‌دهد و کد را مصرف می‌کند. در purpose ثبت‌نام، فقط `{registrationRequired:true}` برمی‌گرداند و user/business/session ایجاد نمی‌کند. ورود عادی پس از OTP همچنان session می‌سازد.
6. `POST /api/auth/register/complete` فقط با کوکی امضاشده و challenge ثبت‌نامی که OTP آن مصرف شده و در پنجره ۲۰ دقیقه‌ای قرار دارد کار می‌کند. سرور نام، نوع مجاز کسب‌وکار و طول نشانی را اعتبارسنجی می‌کند، تلفن را از challenge می‌خواند و user، business با نوع/نشانی/شمارهٔ تأییدشده و plan=`pending` به‌همراه grant را در یک تراکنش ثبت می‌کند. شماره تلفن یکتا است و تکرار تکمیل، حساب دوم نمی‌سازد. سپس session ایجاد و کوکی جریان حذف می‌شود.
7. grant Premium Plus در همان تراکنش ساخت business درج می‌شود و endpoint فقط پس از موفقیت آن پاسخ `trialGranted: true` می‌دهد. کاربر به `/dashboard` می‌رود تا layout تور موجود را برای مالک تازه به‌صورت خودکار باز کند. مقصد `next` داخلی پس از اتمام/رد تور باز می‌شود. گام‌ها مطابق snapshot واقعی entitlementهای Premium Plus ساخته می‌شوند.
8. برای حساب‌هایی که پیش از اصلاح، با `plan=pending` و بدون هیچ سابقهٔ trial ساخته شده‌اند، ورود OTP یا مراجعه به داشبورد توسط مالک یک‌بار grant را در transaction قفل‌شده بازیابی می‌کند. حساب suspended، دارای invoice پرداخت‌شده، دارای هر سابقهٔ trial، و staff از این مسیر trial تازه نمی‌گیرند؛ فرم login هم در صورت بازیابی به داشبورد می‌رود.

## تنظیم مدت و grant

در تنظیمات مدیر سامانه، کارت «دموی رایگان ثبت‌نام‌های جدید» مدت ۱ تا ۶۰ روز را نگه می‌دارد. پلن انتخاب‌پذیر نیست و همیشه `premium_plus` است. پیش‌فرض API برای نصب تازه ۱۴ روز است. trial برای همهٔ ثبت‌نام‌های جدید فعال است؛ تنظیم قدیمی `enabled=false` نادیده گرفته می‌شود. اگر مقدار مدت ذخیره‌شده نامعتبر باشد، مدت امن ۱۴ روز اعمال می‌شود تا ثبت‌نام بی‌صدا به checkout منحرف نشود.

`trial_grants` دارای یک grant به‌ازای هر کسب‌وکار، تاریخ شروع/پایان، نسخه و snapshot پلن و وضعیت active/expired/converted/revoked است. طرح جدول در migration موجود `0019_trial_grants.sql` است؛ این تغییر migration تازه لازم ندارد. `business.plan` در طول trial برابر pending می‌ماند و `src/lib/entitlements.ts` امکانات را از snapshot grant فعال حل می‌کند.

کاربر دمو در هر زمان می‌تواند `/checkout` یا صفحه پلن‌ها را باز کند. endpointهای quote/checkout با `allowUnpaid` برای او قابل استفاده‌اند. تسویه موفق فاکتور، plan و پایان اشتراک را با پلن خریداری‌شده جایگزین می‌کند و grantهای trial فعال/منقضی همان کسب‌وکار را به `converted` می‌برد؛ قبل از پرداخت هیچ پلن خریداری‌شده‌ای اعمال نمی‌شود.

## امنیت و بازیابی

- مقدار query string در URL روی grant اثر ندارد. سرور کوکی HMAC را به شناسه OTP پیوند می‌دهد؛ payload completion نمی‌تواند plan یا تعداد روز را تعیین کند.
- هیچ حساب/کسب‌وکاری در verify ثبت‌نام ساخته نمی‌شود؛ تکمیل فقط challenge مصرف‌شدهٔ purpose=register را می‌پذیرد. مسیر recovery در verify فقط business متعلق به مالک همان OTP را lock می‌کند؛ مسیر recovery در layout نیز فقط مالک واردشده را بررسی می‌کند. business باید pending و غیرمسدود باشد، فاکتور paid و trial history نداشته باشد. OTP Secret حداقل ۳۲ نویسه‌ای لازم است.
- چالش‌های ورود، شمارهٔ موجود، OTP نامعتبر یا منقضی، و cookie با امضا/شناسه/زمان نادرست باید رد شوند. برای کوکی و challenge مسیر جداگانه‌ای روی client قابل جعل وجود ندارد.
- callback واقعی پیامک/درگاه در این تست‌ها اجرا نمی‌شود. تست HMAC، تغییر محتوا، secret نادرست، انقضا، قرارداد routeها، و حفظ تبدیل فاکتور انجام می‌شود؛ تست integration با PostgreSQL و ارسال OTP واقعی فقط با زیرساخت تست جدا ممکن است.
- زمان پایان trial با `src/lib/trial-window.ts` و ساعت سرور ارزیابی می‌شود؛ تغییر plan در URL یا فرم entitlement ایجاد نمی‌کند. این قابلیت period دوم، تمدید خودکار trial یا بازیابی خودکار از پرداخت ناموفق ندارد.

## فایل‌های اجرایی

- رابط/مسیر: `src/components/auth-form.tsx`, `src/app/register/page.tsx`, `src/app/login/page.tsx`, `src/app/page.tsx`.
- مدت امن trial: `src/lib/trial-policy.ts`؛ مقدار نامعتبر را به پیش‌فرض ۱۴ روز برمی‌گرداند. recovery تک‌بارهٔ pending: `src/lib/trial-grants.ts`.
- صدور/تأیید OTP: `src/app/api/auth/otp/request/route.ts`, `src/app/api/auth/otp/verify/route.ts`, `src/lib/platform-sms.ts`.
- امضا و اعتبارسنجی مرحله ثبت‌نام: `src/lib/registration-flow.ts`.
- ساخت حساب و grant: `src/app/api/auth/register/complete/route.ts`; legacy route: `src/app/api/auth/register/route.ts`.
- تنظیمات مدیر: `src/lib/admin-api.ts`, `src/components/admin/misc.tsx`.
- Entitlement و خرید: `src/lib/entitlements.ts`, `src/app/api/subscription/checkout/route.ts`, تسویه در `src/lib/admin-api.ts`.
- تور پس از ورود: `src/app/dashboard/layout.tsx`, `src/components/restaurant-setup-tour.tsx`, [راهنمای تور](onboarding-tour.md).
- آزمون قرارداد و helper: `tests/security-regressions.test.cjs`; آزمون مراحل و entitlement تور: `tests/onboarding-tour.test.cjs`.
