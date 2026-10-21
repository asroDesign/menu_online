# برنامه شیفت و مرخصی کارکنان

## کاربرد و دسترسی

ماژول `/dashboard/staff-schedule` برنامه کاری و درخواست مرخصی را برای یک کسب‌وکار نگه می‌دارد. entitlement: `staff_scheduling`. owner/manager برنامه می‌سازد، تغییر می‌دهد و درخواست مرخصی را تأیید/رد می‌کند؛ کارمند فقط شیفت‌های profile متصل به همان `users.id` را می‌بیند و برای خودش درخواست می‌سازد. مجوز هر درخواست در API دوباره بررسی می‌شود.

## مدل و API

- `staff_schedules`: tenant، کارمند، زمان شروع/پایان، عنوان/یادداشت و ایجادکننده.
- `staff_leave_requests`: tenant، کارمند، بازه، توضیح، وضعیت pending/approved/rejected، پاسخ‌دهنده/زمان پاسخ.
- migration `0016_staff_scheduling.sql` و rollback جفت‌شده.
- `GET/POST /api/staff-schedule`; `PATCH/DELETE /api/staff-schedule/:id`; `GET/POST /api/staff-schedule/leave`; `PATCH /api/staff-schedule/leave/:id`.
- همه سطرها با `businessId` جاری محدود می‌شوند. شیفت و مرخصی نامعتبر/معکوس یا overlap در API رد می‌شوند؛ مدیر در تغییرات حساس قفل/بررسی overlap دارد.
- UI: `src/modules/staff-schedule.tsx`, route registry در `src/app/dashboard/[module]/page.tsx`, sidebar در `src/components/dashboard-shell.tsx`.

## بازسازی و محدودیت

از session، نه businessId ارسالی مرورگر، هویت tenant و user را بگیر. کارمند بدون profile با userId متصل امکان دیدن یا ساخت مورد به نام همکار ندارد. صفحه فارسی/شمسی است؛ timestamp ذخیره‌شده ISO/Date باقی می‌ماند. ماژول فعلاً حضور و غیاب، ساعت‌زنی، حقوق، ارسال اعلان و محاسبه اضافه‌کاری نیست.

تست overlap، tenant scope و self view در `tests/security-regressions.test.cjs`. برای هم‌زمانی واقعی قید دیتابیس یا integration PostgreSQL را اضافه کن؛ migrations هنوز اعمال نشده‌اند.
