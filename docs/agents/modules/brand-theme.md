# تم و رنگ سازمانی

> راهنمای بازسازی عامل برای سیستم طراحی مشترک و تم‌های چندسطحی.

## نقش و مالکیت رنگ

- سایت عمومی و پنل مدیر از رنگ سامانه استفاده می‌کنند؛ پیش‌فرض آبی `#2563eb` است.
- پنل رستوران و منوی مشتری رنگ جداگانه هر کسب‌وکار را از `businesses.accentColor` می‌گیرند.
- فقط کاربر دارای permission تنظیم سامانه می‌تواند رنگ platform را تغییر دهد. مالک/مدیر کسب‌وکار از `/dashboard/settings` رنگ tenant خودش را تغییر می‌دهد؛ API کسب‌وکار tenant را از نشست تعیین می‌کند.
- تغییر رنگ سامانه هیچ رنگ tenant را بازنویسی نمی‌کند. تغییر tenant نیز رنگ سایت و پنل مدیر را عوض نمی‌کند.

## کد و نگاشت رابط

- `src/lib/brand-color.ts`: default، palette، اعتبارسنجی دقیق `#RRGGBB`، کنتراست رنگ متن و ساخت CSS variableها برای DaisyUI، `brand-*` Tailwind و تقویم.
- `src/components/brand-color-picker.tsx`: presetهای رنگ، picker بومی سفارشی و پیش‌نمایش مقدار.
- `src/app/globals.css`: palette آبی سطح سایت و tokenهای پایه.
- `src/components/marketing/marketing.css`: بازطراحی رنگ و سطح سایت؛ CTA، نشان برند و تأکیدهای تعاملی به `--color-primary` وصل‌اند.
- `src/components/brand.tsx`: `PlatformBrandingRuntime` رنگ عمومی را از `/api/public/branding` می‌خواند، متغیرهای `document.documentElement` و `meta[name=theme-color]` را تازه می‌کند و به تغییر ذخیره‌شده در همان tab گوش می‌دهد.
- `src/components/dashboard-shell.tsx`: tokenهای کسب‌وکار را در wrapper داشبورد قرار می‌دهد. `src/app/dashboard/layout.tsx` مقدار رنگ tenant را از سطر business به shell می‌دهد؛ `src/modules/tables.tsx` همان مقدار را در قاب چاپی QR میز مصرف می‌کند.
- `src/components/admin/shell.tsx`: tokenهای platform را در wrapper پنل مدیر قرار می‌دهد. نوار کناری در `src/components/panel-sidebar.css` سرمه‌ای است و حالت انتخاب‌شده از رنگ محلی shell استفاده می‌کند.

## تنظیم، ذخیره و API

- رنگ سامانه در کارت «هویت بصری سامانه» از `src/components/admin/misc.tsx` تغییر می‌کند.
- `/api/admin/settings` با `GET` مقدار `platformBranding` را می‌دهد؛ `POST { key: "platformBranding", value: { siteName, logoUrl, brandColor } }` آن را می‌نویسد. `src/lib/admin-api.ts` مجوز `settings` را بررسی و کد رنگ را قبل از persist اعتبارسنجی می‌کند.
- `app_settings` JSON کلید `platformBranding` را نگه می‌دارد. `getPlatformBranding()` مقدار قدیمی بدون `brandColor` را به default آبی ارتقا می‌دهد.
- `/api/public/branding` نام، logoUrl مجاز و `brandColor` را بدون اطلاعات حساس ارائه می‌کند.
- رنگ tenant از palette/picker در `/dashboard/settings` به `PATCH /api/business` ارسال می‌شود. route سمت سرور format hex را validate کرده و فقط business نشست را تغییر می‌دهد. تغییرات فرم تا ذخیره‌شدن اثر ندارند؛ پس از save، router refresh توکن‌های shell را نیز تازه می‌کند.
- `businesses.accentColor` در schema default آبی دارد. migration `0023_brand_color_defaults.sql` فقط default ستون برای کسب‌وکار تازه را تغییر می‌دهد؛ مقدار موجود را rewrite نمی‌کند. down فقط default آتی را به مقدار پیشین برمی‌گرداند.

## نکات پیاده‌سازی مجدد

1. تم platform و tenant را در یک رکورد مشترک ذخیره نکن؛ tenant isolation در API ثابت بماند.
2. رنگ ورودی CSS آزاد یا نام رنگ را نپذیر؛ فقط hex شش‌رقمی معتبر قابل ذخیره است.
3. از `brandThemeStyle()` برای shellهای محلی استفاده کن تا utilityهای `bg-brand-*`, `text-brand-*`, DaisyUI primary و تاریخ‌شمار رنگ هم‌خوان داشته باشند.
4. اگر رنگ انتخابی روشن باشد، متن primary باید تیره شود. رنگ‌ها به `text-primary-content` وابسته‌اند تا کنتراست از دست نرود.
5. تغییرات platform از رویداد `platform-branding-updated` برای تازه‌سازی هم‌زمان runtime و admin shell استفاده می‌کند.
6. نتیجه را در هر دو زمینه RTL و صفحه باریک بررسی کن. رنگ سامانه جای رنگ معنی‌دار موفقیت/هشدار/خطا را نمی‌گیرد.

## راستی‌آزمایی

- `tests/brand-color.test.cjs` پذیرش/رد hex، تولید tokenهای متفاوت و متن خوانا روی زمینه روشن را می‌سنجد.
- migration آماده است؛ اجرای آن روی دیتابیس محلی/تولید بخشی از کار UI نیست و در این نوبت انجام نشده است.
