# مدیریت وبلاگ و آموزش

## نقش و محدوده

- مسیر فهرست: `/admin#content` در پنل مدیر سامانه.
- صفحه مستقل ساخت/ویرایش مقاله یا آموزش: `/admin/content?type=posts` یا `/admin/content?type=tutorials`؛ برای ویرایش `&id={id}` افزوده می‌شود.
- permission لازم: `content` مدیر سامانه؛ صفحه و API هر دو دسترسی را کنترل می‌کنند.
- منابع اصلی: `src/components/admin/marketing.tsx`, `src/components/admin/content-editor-page.tsx`, `src/components/admin/rich-text-editor.tsx`, `src/components/marketing/rich-content.tsx`, `src/lib/rich-document.ts`, `src/lib/admin-api.ts` و routeهای عمومی `/blog`, `/blog/[slug]`, `/tutorials`, `/tutorials/[slug]`.
- FAQ و نظرات کاربران همچنان در همان بخش محتوا مدیریت می‌شوند؛ متن طولانی وبلاگ و آموزش از modal جدا شده و در صفحه مستقل و فضای ویرایش وسیع انجام می‌شود.

## فهرست و جریان کار

`ContentTab` چهار مجموعه وبلاگ، آموزش، FAQ و نظرات را نشان می‌دهد. وبلاگ/آموزش در فهرست تحریریه‌ای با تصویر شاخص، دسته، نشانی عمومی، تاریخ آخرین ویرایش و وضعیت انتشار دیده می‌شوند. شمارنده کل/منتشرشده/پیش‌نویس، جستجو در عنوان/خلاصه/slug/دسته و فیلتر وضعیت دارد. دکمه ساخت یا ویرایش برای متن‌های طولانی به صفحه `/admin/content` می‌رود. دکمه مشاهده فقط برای مورد منتشرشده فعال است؛ حذف محتوا تأیید مرورگر می‌گیرد. FAQ و نظر کاربر همچنان فرم کوتاه modal دارند.

## صفحه ویرایش

صفحه `/admin/content` براساس `type=posts|tutorials` و `id` حالت ساخت/ویرایش را مشخص می‌کند؛ GET تک‌مورد برای ویرایش از `/api/admin/content/{collection}/{id}` خوانده می‌شود. صفحه RTL و responsive است؛ سربرگ بازگشت/وضعیت/ذخیره دارد، بخش اصلی اطلاعات و ادیتور را می‌گیرد و ستون کناری کنترل انتشار، تصویر شاخص و SEO را نشان می‌دهد. در موبایل دکمه ذخیره/انتشار چسبان پایین صفحه است.

فیلدها:

- مشترک: عنوان، slug لاتین، دسته، خلاصه، تصویر شاخص، عنوان و توضیح SEO، وضعیت پیش‌نویس/منتشرشده، `noIndex` و بدنه.
- وبلاگ: نویسنده، برچسب‌ها و canonical URL.
- آموزش: `videoUrl` اصلی آموزش علاوه بر ویدیوهای درون‌متنی.
- slug برای عنوان فارسی با transliteration ساده پیشنهاد می‌شود و قابل ویرایش است؛ backend الگوی حروف کوچک لاتین/عدد/خط‌تیره را enforce می‌کند.

## ادیتور غنی و ذخیره امن

`RichTextEditor` یک contenteditable با نوار ابزار است: bold، italic، underline، strike، code، عنوان H2/H3، فهرست نشانه‌دار/شماره‌دار، نقل‌قول، راست/وسط/چپ‌چین، رنگ متن، پیوند، خط جداکننده، جدول ۳×۳، undo/redo، پیش‌نمایش و شمارش واژه/نویسه. Paste از HTML ابتدا به allowlist تبدیل می‌شود؛ tagهای script/style/iframe/object/form و خصوصیت‌های اجرایی وارد سند نمی‌شوند.

تصویر و ویدیو از toolbar یا فیلدهای رسانه بارگذاری می‌شوند. `POST /api/admin/media` فقط با `content` permission، امضای واقعی JPG/PNG/WebP/GIF یا MP4/WebM را بررسی می‌کند؛ تصویر حداکثر ۲٫۵ MB، ویدیو حداکثر ۵۰ MB و سقف فایل‌های موجود ۴۰۰ است. فایل در `uploads` ذخیره و نشانی عمومی ثابت `/api/files/{24-char-id}` برمی‌گردد. بدنهٔ مقاله فقط نشانی رسانه را نگه می‌دارد و باینری در متن JSON قرار نمی‌گیرد.

محتوای جدید به‌صورت JSON با marker `menupeak-rich-v1` ذخیره می‌شود. `normalizeRichContent` در سرور typeها، markها، سطح heading، alignment، رنگ، URL پیوند و URL رسانه را allowlist می‌کند. صفحهٔ عمومی در `RichContent` سند را به React element تبدیل می‌کند؛ HTML ذخیره‌شده با `dangerouslySetInnerHTML` اجرا نمی‌شود و متن با escaping طبیعی React نمایش می‌یابد. URL پیوند فقط مسیر داخلی یا HTTP(S)/mailto است؛ رسانه فقط مسیر امن `/api/files/:id` یا HTTPS/HTTP می‌پذیرد. Markdown قدیمی همچنان با renderer قبلی خوانده می‌شود تا داده‌های قبلی نیاز به migration نداشته باشند.

## API، SEO و انتشار

- فهرست: `GET /api/admin/content/posts|tutorials`؛ دریافت یک مورد: `GET /api/admin/content/{collection}/{id}`.
- ساخت/ویرایش/حذف: `POST /api/admin/content/{collection}`, `PATCH|DELETE /api/admin/content/{collection}/{id}`.
- create/update محتوا را audit می‌کند. `status=published` زمان انتشار را ثبت یا به‌روز می‌کند؛ draft در مسیر عمومی خوانده نمی‌شود.
- `metaTitle`, `metaDescription`, `canonicalUrl` وبلاگ و `noIndex` در metadata عمومی مصرف می‌شوند؛ تصویر شاخص در OpenGraph/Twitter. آموزش `videoUrl` را در صفحه عمومی با player کنترل‌دار نمایش می‌دهد. ویدیوهای بدنه هم از renderer امن عمومی پخش می‌شوند.
- تغییر schema/migration ندارد؛ محتوای موجود Markdown دست‌نخورده باقی می‌ماند.

## آزمون و محدودیت

`tests/marketing-rich-content.test.cjs` round-trip امکانات، حذف URLهای خطرناک، escaping متن رسانه و مسیر جداگانهٔ ایجاد/ویرایش را بررسی می‌کند. بررسی داده واقعی/Chrome و بارگذاری واقعی فایل در این تغییر انجام نشده است. فهرست فعلی حداکثر ۵۰۰ آیتم می‌خواند و صفحه‌بندی ندارد؛ ویدیو در همان DB upload blob ذخیره می‌شود، پس برای آرشیو حجیم انتقال به object storage موضوع کار زیرساختی جداگانه است.
