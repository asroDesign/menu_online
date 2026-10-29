# معرفی AI و ساخت منوی رستوران — ۲۰۲۶-۱۰-۳۰

## هدف

درخواست بازسازی صفحهٔ معرفی هوش مصنوعی بیامنو با قابلیت‌های متناظر در MenuPeak. ساختار و مسیرهای اصلی تجربه حفظ شد، اما رنگ، نام، محتوا و هویت بصری برای MenuPeak ساخته شده‌اند؛ ادعاها/شمارنده‌های اجتماعی یا testimonialهای مرجع کپی نشده‌اند.

## صفحهٔ عمومی `/ai`

- Hero با معرفی ساخت منوی QR، CTA ثبت‌نام و نمای CSS از تلفن/منوی نمونه.
- چهار تب: فهرست غذا، عکس منوی چاپی، متن توضیح محصول، ساخت یا بهبود عکس غذا.
- جریان سه‌مرحله‌ای ارائهٔ ورودی، بازبینی مدیر، فعال‌سازی دستی.
- بخش قابلیت‌های متصل: پیشنهاد مکمل، وضعیت موجودی، گزارش فروش، شناخت مشتری، توضیح محصول و سفارش QR.
- حسابگر فروش مکمل با ورودی سفارش روزانه/نرخ پذیرش/قیمت مکمل. عدد آن فروش ناخالص نمونه است، نه سود یا وعدهٔ درآمد.
- responsive در تبلت و موبایل، RTL، reduced motion، canonical، OpenGraph، Twitter metadata و JSON-LD.
- Header، Footer و sitemap به صفحه متصل شدند.

## قابلیت عملیاتی `/dashboard/ai`

### ساخت منو از فهرست یا عکس

`POST /api/ai/menu/parse` تا ۵۰ قلم نام/دسته/شرح/قیمت را برمی‌گرداند. متن تا ۲۰هزار نویسه است؛ فهرست متنی با OpenAI پردازش می‌شود یا بدون کلید parser قاعده‌محور اجرا می‌شود. OCR عکس به OpenAI vision نیاز دارد؛ عکس حداکثر ۲٫۵MB و signature آن با MIME مقایسه می‌شود.

نتیجه را مدیر در فرم draft ویرایش می‌کند. `PUT /api/ai/menu/parse` فقط پس از `confirmed: true` و در transaction، دسته‌های جدید و محصول‌های تازه را می‌سازد. نام تکراری در همان draft رد می‌شود و دسته/نام موجود در دیتابیس skip می‌شود. محصول تازه `isAvailable:false` دارد تا مدیر قیمت و اطلاعات را کامل و سپس دستی منتشر کند. آدرس تصویر نیز پیش از ثبت به مالکیت فایل در tenant مربوطه بررسی می‌شود.

### توضیح و عکس محصول

توضیح محصول از `POST /api/r/ai` ساخته می‌شود، در UI قابل ویرایش است و فقط با دکمهٔ جداگانه PATCH می‌شود. ساخت/ویرایش تصویر از `POST /api/ai/menu/image` انجام می‌شود؛ فایل خروجی WebP در uploads همان کسب‌وکار ذخیره می‌شود. مدیر می‌تواند عکس را صرفاً پیش‌نمایش کند یا محصول موجود را انتخاب کند و صریحاً تغییر تصویر را روی آن ذخیره کند.

مدل از GPT Image 2.5 Sunburst استفاده می‌کند. مستندات رسمی در زمان پیاده‌سازی اعلام می‌کنند `gpt-image-1` از ۲۳ اکتبر ۲۰۲۶ خاموش شده است؛ [راهنمای تولید](https://developers.openai.com/api/docs/guides/image-generation) و [مرجع ویرایش تصویر](https://developers.openai.com/api/reference/resources/images/methods/edit).

### امنیت/محدودیت

- با `withAuth`: manager و entitlement `ai`.
- rate limit: parse ۱۲ درخواست در ساعت برای business/user؛ تصویر ۸ درخواست در ساعت.
- بدنهٔ parse، طول متن، شمار آیتم‌ها، ابعاد/نوع تصویر، حد ثبت فایل در tenant و URL مالکیت فایل محدود می‌شوند.
- OpenAI API key سمت سرور لازم است برای OCR، متن مدل‌محور و تصویر. بدون کلید، فقط فهرست متنی parser ساده دارد. AI Insights موجود عمدتاً قواعدی است؛ engine badge صرف وجود key را اعلام می‌کند و نشانهٔ آن نیست که آمار توسط مدل مولد ساخته شده است.
- پیشنهاد مکمل و تحلیل مشتری/فروش از قابلیت‌های موجود هستند و در این تغییر به مدل AI مولد تبدیل نشده‌اند.
- schema یا migration دیتابیس تغییر نکرده است.

## فایل‌ها

- کد: `src/app/ai/page.tsx`, `src/components/marketing/ai-page-interactions.tsx`, `src/components/marketing/ai-page.module.css`, `src/components/ai-menu-builder.tsx`, `src/modules/growth-b.tsx`, `src/app/api/ai/menu/parse/route.ts`, `src/app/api/ai/menu/image/route.ts`.
- اتصال ناوبری/کشف: `src/components/marketing/site-header.tsx`, `src/components/marketing/site-footer.tsx`, `src/app/sitemap.ts`.
- مستندات: `docs/agents/modules/ai.md`, `docs/agents/core-pages/ai-menu-builder.md`, `docs/agents/core-pages/api-contract-map.md`, `docs/agents/module-capabilities.md`, `docs/agents/README.md`, `IMPLEMENTATION_STATUS.md`.

## اعتبارسنجی

`npm run typecheck` موفق است؛ ESLint هدفمند روی صفحه، endpointها، builder و فایل‌های ناوبری موفق است؛ `git diff --check` موفق است. `npm run build` با Node سیستم (۱۸٫۱۷) به‌دلیل حداقل Node ۲۰٫۹ Next 16 قابل اجرا نبود. build مستقیم با Node ۲۴ آغاز شد اما Turbopack تا بیش از دو دقیقه بدون خروجی پیشرفت ماند و متوقف شد؛ بنابراین build تولید تأیید نشده است. صفحهٔ محلی در Chrome روی `localhost:3002/ai` پاسخ ۵۰۰ موجود داشت و بررسی تصویری UI کامل نشد. دیتابیس/endpointهای provider و OpenAI واقعی آزمایش نشدند؛ image generation production به کلید و اعتبار provider وابسته است.
