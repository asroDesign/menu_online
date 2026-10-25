# مرکز اعلان پنل رستوران

این راهنما قرارداد زنگ هدر، toastهای سراسری پنل و اعلان Web Push گارسون را مشخص می‌کند. مرکز یک نمای تجمیعی از سفارش‌های آنلاین، رزروهای میز، درخواست‌های گارسون، هشدار موجودی/انقضا و یادآوری چک است.

## نقش و کاربرد

- آیکن زنگ در هدر داشبورد رستوران دیده می‌شود؛ اگر هیچ‌یک از قابلیت‌های اعلان‌پذیر در نقش/پلن جاری فعال نباشد، زنگ render نمی‌شود.
- عدد نشان روی زنگ جمع آیتم‌های جاری گروه‌های مجاز است. فهرست پنجره‌ای، بخش‌بندی‌شده، قابل‌اسکرول و سازگار با موبایل است؛ انتخاب هر مورد کاربر را به صفحه رسیدگی همان گروه می‌برد.
- برای هر مورد تازه‌ای که API برمی‌گرداند toast پایین صفحه نمایش داده می‌شود: درخواست گارسون، سفارش آنلاین/تغییر وضعیت، رزرو، چک و هشدار انبار. شناسه‌های دیده‌شده برای هر کسب‌وکار/نقش/دسته در storage مرورگر dedupe می‌شوند تا polling همان رویداد را تکرار نکند.
- polling مرکز هر ۱۵ ثانیه در تب قابل‌مشاهده انجام می‌شود و هنگام بازگشت تب refresh می‌شود. در `/dashboard/waiter` و `/dashboard/cashier` کارت اختصاصی `WaiterServiceRequestNotifications` حفظ شده و toast تفصیلی آن پایین صفحه می‌آید؛ مرکز مشترک toast تکراری همان درخواست را خاموش می‌کند. صفحه‌های دیگر از `ToastProvider` سراسری پایین صفحه استفاده می‌کنند.
- کادر بزرگ وضعیت/فعال‌سازی صدا در ماژول گارسون با دکمهٔ شناور سمت چپ جایگزین شده است. تا وقتی صدای مرورگر unlock نشده یا درخواست بازی وجود دارد دکمه می‌ماند؛ تعداد درخواست‌ها روی آن است و popover جزئیات، پیام و رسیدگی را نشان می‌دهد. ترجیح صدای فعال در کوکی یک‌ساله ذخیره می‌شود؛ پس از refresh، در اولین تعامل کاربر AudioContext دوباره unlock می‌شود و تا آن زمان دکمه باقی است.
- هشدار صوتی foreground با Web Audio پخش می‌شود؛ مرکز هنگام تعامل کاربر context صدا را باز می‌کند و دکمهٔ زنگ در popover امکان آزمایش/فعال‌سازی صریح را دارد. مرورگر ممکن است پخش خودکار را تا اولین تعامل کاربر مسدود کند.
- Web Push برای حساب گارسون opt-in است و پنل مجوز مرورگر را فقط بعد از لمس دکمهٔ «فعال‌سازی اعلان» درخواست می‌کند. پس از مجوز، اشتراک همان دستگاه ذخیره می‌شود و Service Worker می‌تواند درخواست میز را هنگام بسته/پس‌زمینه بودن صفحه به اعلان سیستم تبدیل کند. این به VAPID env، HTTPS یا localhost امن، اجرای migration و پشتیبانی مرورگر/سیستم‌عامل نیاز دارد.

## دسته‌ها و شرط نمایش

| گروه | شرط backend | مقصد | جزئیات نمایشی |
|---|---|---|---|
| درخواست گارسون | `waiter_service_requests.status = open` | `/dashboard/waiter` | نام میز، نوع call/message، متن مشتری و زمان ثبت |
| سفارش آنلاین | `orders.source = customer` و سفارش حذف نشده؛ وضعیت `pending` یا `awaiting_payment`، یا `preparing` ثبت‌شده در ۲۴ ساعت گذشته | `/dashboard/orders` | شماره، وضعیت کار، نوع/میز، جمع کل و وضعیت پرداخت؛ موبایل مشتری و متن خصوصی سفارش برگردانده نمی‌شوند |
| رزرو میز | `reservations.status = requested` | `/dashboard/reservations` | نام، تعداد مهمان، میز در صورت تخصیص، زمان رزرو و زمان درخواست؛ موبایل و یادداشت رزرو خوانده نمی‌شود |
| هشدار انبار | منطق `buildInventoryAlerts` موجود: کمبود/اتمام یا انقضای گذشته/هفت روز آینده | `/dashboard/inventory` | نام ماده، موجودی و کف، یا تاریخ انقضای شمسی |
| یادآوری چک | `cheque_register` فعال و تنظیم یادآوری رستوران روشن؛ چک ثبت‌شده در بازهٔ تنظیم‌شده | `/dashboard/cheques` | جهت، شماره، ذی‌نفع، بانک و مبلغ |

گروه‌ها فقط زمانی query می‌شوند که feature مؤثر روی role مجاز باشد: `cashier_pos` برای سفارش آنلاین، `reservations` برای رزرو، `waiter_call` برای درخواست میز و `inventory` برای هشدار کالا. endpoint از map محدودشدهٔ `auth.features` تصمیم می‌گیرد؛ مخفی‌کردن رابط کاربری جای کنترل سرور را نمی‌گیرد.

## API و جداسازی tenant

- `GET /api/r/dashboard-notifications`: نشست `withAuth` الزامی است. هر query با `auth.business.id` محدود می‌شود. join میز هم‌زمان با همان business محدود است. پاسخ فقط فیلدهای لازم برای کارت را برمی‌گرداند، `Cache-Control: no-store` دارد و داده‌های مشتری مثل تلفن و یادداشت رزرو را حذف می‌کند.
- `GET /api/r/inventory-alerts`: endpoint قبلی با entitlement inventory می‌ماند؛ endpoint تجمیع، منطق هشدار یا حد آستانه آن را بازنویسی نمی‌کند.
- پاسخ‌ها در React هر ۱۵ ثانیه تازه می‌شوند و polling هنگام پنهان‌بودن تب متوقف است. دکمهٔ refresh درخواست دستی ایجاد می‌کند.
- هر endpoint رویداد بدون feature فعال برای کاربر احرازشده آرایهٔ خالی همان گروه را می‌دهد. خطای یک منبع، دادهٔ منبع دیگر را مخفی نمی‌کند و UI پیام خطای جزئی/تلاش مجدد دارد.

## اشتراک و ارسال Web Push گارسون

- `GET/POST/DELETE /api/r/push-subscriptions` فقط برای نقش مؤثر `waiter` و entitlement `waiter_call` مجاز است. endpoint و کلیدهای دستگاه در پاسخ GET برگردانده نمی‌شوند. ثبت و حذف با `businessId` و `userId` نشست فعلی محدود است؛ endpoint در کل سامانه یکتا است و به حساب/کسب‌وکار دیگری منتقل نمی‌شود. ثبت endpoint فقط HTTPS و میزبان‌های push شناخته‌شدهٔ Google، Mozilla، Apple و Windows را می‌پذیرد تا URL دلخواه سرور به مقصد outbound تبدیل نشود.
- `push_subscriptions` در migration `0052_waiter_push_subscriptions.sql` کلید endpoint، کلیدهای رمزنگاری و شناسهٔ کسب‌وکار/گارسون را ذخیره می‌کند؛ دسترسی سایر کارکنان به فهرست اشتراک‌ها API ندارد. rollback فقط اشتراک‌های دستگاه را حذف می‌کند.
- بعد از insert موفق `waiter_service_requests`، `sendWaiterCallPush` فقط به حساب‌های کارمند فعال با نقش `waiter` و اشتراک همان کسب‌وکار ارسال می‌کند. payload شامل شناسه، نام میز و متن عمومی است و متن آزاد مشتری را به notification سیستم نمی‌فرستد. پاسخ push از ثبت درخواست جداست؛ شکست ارسال، درخواست میز را rollback نمی‌کند. endpointهای منقضی 404/410 پاک می‌شوند.
- سه متغیر سرور لازم‌اند: `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`. جفت کلید را یک‌بار با `npx web-push generate-vapid-keys --json` بساز، private key را فقط در secret store محیط سرور قرار بده و جفت ثابت را نگه دار. `.env.example` نام متغیرها را دارد، نه کلید واقعی.
- سرویس‌ورکر `public/service-worker.js` روی scope `/` اعلان سیستم و بازگشت به `/dashboard/waiter` را اجرا می‌کند؛ به تب‌های باز فقط شناسهٔ درخواست را broadcast می‌کند و هر تب جزئیات را از API tenant-scoped خودش می‌گیرد. manifest با display مستقل در `src/app/manifest.ts` است. روی iPad/iPhone، مرورگرهای مبتنی بر Web Push ممکن است برای اعلان پس‌زمینه نیاز به افزودن وب‌اپ به Home Screen داشته باشند. صدای اعلان background به تنظیم صدای OS/مرورگر وابسته است و سایت نمی‌تواند آن را اجبار کند؛ toast و صدای foreground جدا هستند.

## فایل‌های منبع

- هدر و entitlement: `src/components/dashboard-shell.tsx`
- UI مشترک و polling: `src/components/dashboard-notification-center.tsx`
- اجازه و ثبت اشتراک همین دستگاه برای گارسون: `src/components/waiter-push-enrollment.tsx`
- ارسال server-side، VAPID و انتخاب اشتراک‌های گارسون فعال: `src/lib/web-push.ts`
- API مدیریت اشتراک دستگاه: `src/app/api/r/push-subscriptions/route.ts`
- دریافت درخواست مشتری و trigger ارسال: `src/app/api/public/[slug]/service-requests/route.ts`
- Service Worker و manifest: `public/service-worker.js`, `src/app/manifest.ts`, `src/app/layout.tsx`
- API tenant-scoped: `src/app/api/r/dashboard-notifications/route.ts`
- منطق pure وضعیت سفارش و تعداد badge: `src/lib/dashboard-notifications.ts`
- هشدار انبار: `src/app/api/r/inventory-alerts/route.ts` و `src/lib/inventory-alerts.ts`
- تست قرارداد و منطق: `tests/dashboard-notifications.test.cjs` و `tests/inventory-alerts.test.cjs`

## پذیرش و محدودیت

- owner/manager با entitlementهای گوناگون فقط گروه‌های مجاز پلن را می‌بیند؛ نقش محدودشده نیز از `auth.features` پیروی می‌کند.
- درخواست باز گارسون، سفارش online جدید/در انتظار و رزرو درخواستی در زنگ و badge دیده می‌شوند. سفارش آماده‌سازی‌شده فقط در پنجرهٔ ۲۴ ساعته دیده می‌شود؛ سفارش‌های انجام‌شده، لغوشده، حذف‌شده و سفارش صندوق/گارسون در گروه online وارد نمی‌شوند.
- نشست‌های جدا یا دستگاه‌های دیگر وضعیت خوانده‌شدن مشترک ندارند؛ شمارنده تعداد موارد جاری است، نه unread.
- تست source-contractهای feed و push در `tests/dashboard-notifications.test.cjs` و `tests/panel-notification-push.test.cjs` است. delivery به push provider واقعی، اجازهٔ سیستم‌عامل در Chrome/iPad و push هنگام بسته‌بودن واقعی مرورگر در این تغییر تست نشده است.
- rollout نیاز دارد migration `0052` روی دیتابیس مقصد اجرا شود و سه VAPID env به runtime وب/API اضافه شوند. تا قبل از آن، toast/poll foreground قابل استفاده است اما کارت setup به‌درستی می‌گوید push پس‌زمینه تنظیم نشده.
