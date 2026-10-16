# فرم عمومی نظرسنجی

> مشخصات بازسازی عامل برای صفحه/جریان عمومی یا سیستمی.

- مسیر: `/survey/:id`
- منبع فعلی: `src/app/survey/[id]/page.tsx + src/components/survey-form.tsx`
- هدف: ثبت پاسخ عمومی به survey فعال کسب‌وکار.

## رابط و جریان

خواندن definition؛ عنوان/توضیح و سوال‌ها با نوع پاسخ مناسب (متن/امتیاز/گزینه)؛ نام اختیاری مشتری؛ submit، validation و صفحه تشکر/خطا.

## API و داده

GET public survey /api/public/survey/:id؛ POST همان endpoint {answers,customerName}.

## قواعد بازسازی

survey غیر فعال/ناموجود not-found؛ validate نوع و تعداد answer سرور؛ از script injection جلوگیری؛ داده پاسخ tenant-scoped.

برای schema دقیق و شرط‌های موجود، فایل‌های source و API بالا را بخوان. UI عمومی باید tenant-isolated، RTL و responsive باشد.

## مشخصات سطح پیاده‌سازی

### تعریف و اجزای پاسخ

صفحه با شناسه عددی survey بارگذاری می‌شود؛ survey باید فعال باشد، کسب‌وکار معتبر داشته باشد و entitlement نظرسنجی برقرار باشد. مدل هر پرسش `id,text,type` است و type یکی از `rating`, `choice`, `text`؛ گزینه‌ها برای choice از تعریف سرور می‌آیند. rating پنج گزینه ۱ تا ۵ دارد، choice یک گزینه را انتخاب می‌کند و text textarea است. نام مشتری اختیاری است.

### ارسال و حالات

`POST /api/public/survey/:id` بدنه `{answers,customerName}` دارد. خطای ارسال کنار فرم می‌ماند؛ success state فرم را با پیام تشکر عوض می‌کند. صفحه خالی/تعریف سوال بدون سوال، survey بسته یا ID نامعتبر را به حالت not-found/پاسخ‌ناپذیر تبدیل کند. دکمه submit نباید همزمان چند پاسخ ارسال کند.

### قرارداد داده

کلیدهای answer باید با ID پرسش‌های همین survey تطابق داشته باشند؛ سرور type، rating range و گزینه مجاز را validate کند و پاسخ را به tenant مرتبط بنویسد. نام/متن را escape و طول محدود کن. صفحه ترجیحاً نیاز به حساب کاربری ندارد و اطلاعات هویتی اضافی جمع نکند.

