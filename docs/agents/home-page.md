# راهنمای Agent برای صفحه اصلی

این سند فقط صفحه `/` را توضیح می‌دهد؛ آن را همراه [نقشه ماژول‌ها](README.md) بخوان.

## فایل و مسئولیت

- پیاده‌سازی: `src/app/page.tsx` (Server Component با `dynamic = "force-dynamic"`).
- اجزای مورد استفاده: `MiniSite`, `MenuClient`, `IconText/EmojiIcon`, `Link`، helperهای plan/auth، DB business و feature resolver.
- دو نقش دارد: landing بازاریابی روی hostname اصلی، و dispatcher برای دامنه اختصاصی متصل‌شده به یک کسب‌وکار.

## ترتیب تصمیم سرور

1. host از `headers()` خوانده، port حذف و lowercase می‌شود. localhost و 127.0.0.1 دامنه مشتری محسوب نمی‌شوند.
2. در host اختصاصی، رکورد business با `customDomain=host` و `domainStatus=verified` جست‌وجو می‌شود.
3. اگر business وجود دارد و suspended نیست، `featuresOf` بررسی می‌شود. با entitlement دامنه، mini-site در صورت فعال بودن `mini_site` وگرنه منوی مشتری از `buildPublicMenu`/`MenuClient` نمایش داده می‌شود.
4. اگر مسیر custom-domain سرو نشد، demo data با `ensureDemoData()` آماده و `getAuth()` بررسی می‌شود. CTA ورود به `/dashboard` برای کاربر واردشده و `/register` برای مهمان است.

## ساختار صفحه بازاریابی

- Navbar sticky: نشان محصول، anchor امکانات/تعرفه/FAQ، لینک login برای مهمان و CTA اصلی.
- Hero: ارزش پیشنهادی منوی QR و سفارش گارسون؛ CTA ثبت‌نام/داشبورد، `/restaurants` و منوی نمونه `/m/${DEMO_SLUG}?table=3`؛ اعداد social proof.
- Phone mock: کارت‌های نمونه منو و سفارش/فروش؛ نمایشی است و نباید مثل data واقعی مشتری معرفی شود.
- Features: شش feature cards در grid responsive.
- مراحل شروع: ثبت‌نام و ساخت منو، چاپ QR و دریافت سفارش.
- Pricing: سه کارت پلن، قیمت زنده از `getPlanList()` بر مبنای ترتیب موجود در `PLANS`، old price، bulletها و CTA.
- FAQ: چهار disclosure/native details.
- CTA نهایی و footer.

## داده و محتوا

`FEATURES`, `PLANS`, `FAQ` اکنون constants در فایل‌اند؛ قیمت‌های نمایش‌داده‌شده از `livePlans[pi]` می‌آیند و متن‌ها/ویژگی‌های bullet در component تعریف شده‌اند. ارقام قیمت با `formatNumber` فارسی می‌شوند. صفحه فعلی از `daisyui` و utility classes استفاده می‌کند.

## الزامات بازسازی دقیق

- حفظ ترتیب dispatch دامنه پیش از landing؛ host header را فقط روی سرور بخوان. دامنه unverified/suspended نباید render شود.
- CTA با وضعیت authentication هماهنگ بماند؛ نمونه منو و directory مسیرهای واقعی باشند.
- محتوای landing، بخش‌های anchors، داده‌های قیمت و FAQ را حفظ کن مگر خود کاربر بخواهد copy تغییر کند. قیمت را برای تصمیم access از UI نخوان.
- پیاده‌سازی RTL و responsive: navbar موبایل، hero تک‌ستونه در عرض کم، phone mock بدون overflow، کارت‌های تعرفه stack شده و FAQ/CTA قابل لمس.
- تصاویر/آیکن‌ها/فونت‌ها باید پایدار و در دسترس باشند؛ alt مناسب، focus keyboard، semantic headings و reduced-motion رعایت شوند.
- `MiniSite` و `MenuClient` داده لازم برای public route را از همان helperهای فعلی بگیرند؛ دامنه اختصاصی private settings را به client نده.

## مرجع‌های source

`src/app/page.tsx`, `src/lib/seed.ts`, `src/lib/app-settings.ts`, `src/lib/entitlements.ts`, `src/lib/auth.ts`, `src/lib/public-menu.ts`, `src/components/mini-site.tsx`, `src/components/menu-client.tsx`.
