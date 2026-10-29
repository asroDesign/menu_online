"use client";

import { Cloud, Database, Laptop, Printer, ReceiptText, WifiOff } from "lucide-react";
import styles from "./offline-sync-animation.module.css";

/** A CSS-only, illustrative sequence; it never reads or sends real sales data. */
export function OfflineSyncAnimation() {
  return (
    <div className={styles.wrap}>
      <div className={styles.stage} role="img" aria-label="نمایش مفهومی ثبت سفارش روی صندوق ویندوز هنگام قطعی اینترنت و همگام‌سازی آن پس از وصل‌شدن">
        <div className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}><Laptop size={19} aria-hidden="true" /></span>
            <span><b>صندوق فروش MenuPeak</b><small>صندوق محلی · دستگاه ۱</small></span>
          </div>
          <div className={styles.state}>
            <span className={styles.offline}><i /> <WifiOff size={13} aria-hidden="true" /> اینترنت قطع است</span>
            <span className={styles.syncing}><i /> در حال ارسال صف</span>
            <span className={styles.synced}><i /> سفارش‌ها همگام شد</span>
          </div>
        </div>

        <div className={styles.network}>
          <article className={styles.terminal}>
            <div className={styles.windowBar}><span /><span /><span /><small>فروش محلی</small></div>
            <div className={styles.saleHead}><span><ReceiptText size={15} aria-hidden="true" /> فاکتور جدید</span><b>میز ۴</b></div>
            <div className={styles.orderLine}><span>لاته × ۲</span><b>۲۴۰٬۰۰۰</b></div>
            <div className={styles.orderLine}><span>کیک شکلاتی × ۱</span><b>۱۲۰٬۰۰۰</b></div>
            <div className={styles.total}><span>جمع فاکتور</span><b>۳۶۰٬۰۰۰ تومان</b></div>
            <div className={styles.localSaved}><Database size={13} aria-hidden="true" /><span>ثبت‌شده روی همین دستگاه</span><b>✓</b></div>
            <div className={styles.printer}><Printer size={16} aria-hidden="true" /><span>چاپ محلی</span><div className={styles.paper}><i /><i /><i /></div></div>
          </article>

          <div className={styles.connection} aria-hidden="true">
            <div className={styles.linkLine} />
            <span className={styles.packet} />
            <span className={`${styles.packet} ${styles.packetLate}`} />
            <div className={styles.connectionLabel}>
              <span className={styles.noLink}>ارتباط قطع</span>
              <span className={styles.hasLink}>اتصال برگشت</span>
            </div>
          </div>

          <article className={styles.server}>
            <span className={styles.cloudIcon}><Cloud size={24} aria-hidden="true" /></span>
            <b>سامانهٔ مرکزی</b>
            <small>فروش‌های همگام‌شده</small>
            <div className={styles.queue}><span>صف ارسال</span><b className={styles.queueCount}>۲</b><b className={styles.queueDone}>۰</b></div>
            <div className={styles.serverNote}><i /> <span className={styles.waiting}>تا اتصال، منتظر می‌ماند</span><span className={styles.received}>فروش تازه دریافت شد</span></div>
          </article>
        </div>

        <div className={styles.progress} aria-hidden="true"><span /></div>
        <div className={styles.steps} aria-hidden="true">
          <span><i className={styles.stepOne}>۱</i> ثبت روی دستگاه</span>
          <span><i className={styles.stepTwo}>۲</i> نگهداری در صف</span>
          <span><i className={styles.stepThree}>۳</i> ارسال پس از اتصال</span>
        </div>
      </div>
      <p className={styles.caption}>نمایش مفهومی با اطلاعات نمونه؛ فروش‌های محلی هر صندوق روی همان دستگاه نگهداری می‌شوند.</p>
    </div>
  );
}
