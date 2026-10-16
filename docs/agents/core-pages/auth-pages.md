# ورود و ثبت‌نام

> مشخصات بازسازی عامل برای صفحه/جریان عمومی یا سیستمی.

- مسیر: `/login, /register`
- منبع فعلی: `src/app/login/page.tsx, src/app/register/page.tsx + src/components/auth-form.tsx`
- هدف: احراز هویت مدیر/کارمند/پیک و ایجاد حساب.

## رابط و جریان

فرم ورود با email/password و ثبت‌نام با نام، نام کسب‌وکار، email/password؛ validation، busy، error، لینک بین login/register؛ بازگشت امن به dashboard/role home.

## API و داده

POST /api/auth/login؛ POST /api/auth/register؛ POST /api/auth/demo؛ POST `/api/auth/return` برای بازگشت از impersonation و POST `/api/auth/logout` برای خروج.

## قواعد بازسازی

اعتبارسنجی credential فقط backend؛ rate limit؛ عدم افشای وجود حساب/رمز؛ role routing به ROLE_HOME.

برای schema دقیق و شرط‌های موجود، فایل‌های source و API بالا را بخوان. UI عمومی باید tenant-isolated، RTL و responsive باشد.

## مشخصات سطح پیاده‌سازی

### فیلد و مسیر

فرم ورود ایمیل و گذرواژه می‌گیرد؛ ثبت‌نام نام شخص، نام کسب‌وکار، ایمیل و گذرواژه می‌گیرد. فرم حالت login/register مشترک، نمایش خطای API، busy، لینک تعویض صفحه و دکمه‌های ورود demo دارد. پس از ورود نقش کاربر به خانه تعریف‌شده در `ROLE_HOME` هدایت می‌شود؛ اگر کاربر از مسیر بازگشت امن مجاز آمده باشد، مقصد معتبر رعایت شود.

Endpoints واقعی شامل `POST /api/auth/login`, `/register`, `/demo`, `/return`, `/logout` هستند؛ login/register body را از route واقعی بخوان و اطلاعات حساب را در query/صفحه خطا قرار نده. session/cookie، hash password و role از سرور می‌آید. وجود/عدم وجود ایمیل را با پیام قابل سوءاستفاده افشا نکن؛ rate limit و validation backend الزامی‌اند.

### حالت‌ها و پذیرش

بارگذاری صفحه اگر کاربر session دارد باید redirect کند. در فرم، submit تکراری جلوگیری شود، خطای شبکه حفظ ورودی‌های کم‌خطر را از بین نبرد و password در state/render/log چاپ نشود. `next` یا redirect URI فقط مقصد داخلی allowlist شده باشد. صفحه RTL، موبایل‌محور و label/aria برای inputها داشته باشد.



### کنترل نمایش دمو

کلید عمومی `NEXT_PUBLIC_DEMO_MODE` در `.env` بخش دمو را کنترل می‌کند. مقدار `true` دکمه‌های ورود دمو، حساب‌های آزمایشی و رستوران نمونه را فعال نگه می‌دارد؛ مقدار `false` یا `0` آنها را مخفی می‌کند، endpoint ورود دمو را با 404 می‌بندد و مسیرهای منوی نمونه را پنهان می‌کند. برای اعمال تغییر `.env` سرور را دوباره راه‌اندازی کنید. فرم «درخواست دموی رایگان» درخواست فروش برای نمایش محصول است و با ورود به حساب نمونه تفاوت دارد.
