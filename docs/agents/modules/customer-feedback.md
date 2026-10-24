# پیشنهادها و شکایت‌های مشتریان

راهنمای بازسازی مستقلِ ارسال بازخورد از پروفایل مشتری و رسیدگی مدیر رستوران.

## نقش و مسیر

- مشتری در منوی عمومی `/m/:slug`، از تب «پروفایل»، پیام پیشنهاد یا شکایت را ثبت می‌کند.
- مدیر/مالک پیام‌ها را در `/dashboard/customer-feedback` می‌بیند و وضعیت رسیدگی را تغییر می‌دهد.
- روشن/خاموش‌کردن قابلیت در `/dashboard/settings`، بخش «پیشنهادها و شکایت‌های مشتریان» است.
- قابلیت به entitlement جداگانه نیاز ندارد؛ فقط تنظیم کسب‌وکار آن را روشن می‌کند. مقدار پیش‌فرض برای کسب‌وکارهای فعلی و تازه خاموش است.

## جریان مشتری

1. سرور مقدار `business.settings.customerFeedbackEnabled` را به شکل boolean در خروجی محدود `buildPublicMenu` می‌دهد. مقدار فقط وقتی `true` باشد به نوار پروفایل پاس داده می‌شود؛ پیش‌نمایش‌های read-only آن را خاموش می‌کنند.
2. فرم فقط برای پروفایلی که نشست OTP همان کسب‌وکار را دارد نشان داده می‌شود. مهمان برای بازکردن فرم باید وارد پروفایل شود.
3. مشتری نوع «پیشنهاد» یا «شکایت» و پیام ۱۰ تا ۱۵۰۰ نویسه‌ای را انتخاب می‌کند؛ متن plain text ذخیره و در UI escape می‌شود. ده پیام اخیر همان مشتری همراه وضعیت رسیدگی نمایش داده می‌شود.
4. موفقیت، خطا، شمارنده نویسه و loading باید نمایش داده شوند. فرم در صفحه‌نمایش کوچک در همان modal اسکرول‌پذیر است.

## قرارداد API و امنیت

- `GET /api/public/:slug/customer/feedback`: بررسی منوی منتشرشده، تنظیم فعال، نشست OTP و تطبیق `customerId` با `businessId`؛ فقط ده پیام همان مشتری را برمی‌گرداند.
- `POST /api/public/:slug/customer/feedback`: همان کنترل‌ها؛ body حداکثر ۸ KiB؛ نوع فقط `suggestion | complaint`؛ پیام ۱۰ تا ۱۵۰۰ نویسه؛ حداکثر ۵ ارسال برای هر مشتری در ۲۴ ساعت. هویت از کوکی امضاشدهٔ OTP گرفته می‌شود، نه شماره‌ای که کاربر در body بفرستد.
- هنگام غیرفعال‌بودن تنظیم، route عمومی `404` برمی‌گرداند تا فرم قابل استفاده نباشد.
- `GET /api/r/customer_feedback`: مدیر/مالک واردشده، ۳۰۰ پیام آخر کسب‌وکار خودش را همراه نام/تلفن ثبت‌شده می‌بیند.
- `PATCH /api/r/customer_feedback/:id`: مدیر/مالک فقط می‌تواند status را به `open | in_progress | resolved` تغییر دهد. شرط `businessId` در read و write اجباری است؛ حذف پیام نداریم تا سابقه رسیدگی حفظ شود.

## مدل داده و rollout

`customer_feedback` هر پیام را به کسب‌وکار و مشتری وصل می‌کند؛ migration `0050_customer_feedback.sql` جدول، check constraintهای نوع/طول/status و دو index برای inbox tenant و سابقه مشتری می‌سازد. rollback متناظر جدول را حذف می‌کند، پس rollback پس از ایجاد داده پیام‌ها را از بین می‌برد. migration خودکار اجرا نمی‌شود؛ پیش از deploy باید مسیر migration محیط مطابق روال انتشار پروژه اجرا شود. در صورت نبود جدول API پاسخ روشن 503 با اشاره به migration 0050 می‌دهد.

## کد و بررسی

- تنظیم: `src/lib/plans.ts`, `src/app/api/business/route.ts`, `src/app/dashboard/settings/page.tsx`, `src/components/settings-center.tsx`.
- منوی عمومی: `src/lib/public-menu.ts`, `src/components/menu-client.tsx`, `src/components/public-menu-navigation.tsx`.
- API و storage: `src/app/api/public/[slug]/customer/feedback/route.ts`, `src/db/schema.ts`, `src/lib/customer-feedback-core.ts`, `src/lib/registry-b.ts`.
- inbox و route guard: `src/modules/customer-feedback.tsx`, `src/app/dashboard/[module]/page.tsx`, `src/lib/roles.ts`, `src/components/dashboard-shell.tsx`.
- آزمون‌ها: `tests/customer-feedback.test.cjs` مقدار پیش‌فرض/فعال‌سازی، اعتبارسنجی ورودی، وابستگی endpoint عمومی به نشست OTP و tenant، و allow-list وضعیت مدیر را بررسی می‌کند. این تست جای آزمون integration با PostgreSQL را نمی‌گیرد.

