import { Bell } from 'lucide-react';
import styles from './AlertsPage.module.css';

export default function AlertsPage() {
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Alerts</h1>
      <p className={styles.subtitle}>Get notified when a product's Viral Score crosses your threshold.</p>

      <div className={styles.empty}>
        <Bell size={48} strokeWidth={1} className={styles.emptyIcon} />
        <p className={styles.emptyTitle}>No alerts yet</p>
        <p className={styles.emptyDesc}>
          Alerts are set per product from the watchlist or product drawer. This view will show triggered notifications.
        </p>
      </div>
    </div>
  );
}
