import { useRedditTrends, ECOM_SUBS } from '@/data/sources/reddit';
import { useAmazonMovers } from '@/data/sources/amazon';
import { usePinterestTrends } from '@/data/sources/pinterest';
import { useGoogleTrends } from '@/data/sources/google';
import { Badge } from '@/components/Badge';
import styles from './SourcesPage.module.css';

export default function SourcesPage() {
  const reddit    = useRedditTrends();
  const amazon    = useAmazonMovers();
  const pinterest = usePinterestTrends();
  const google    = useGoogleTrends();

  const sources = [
    { id: 'reddit',    label: 'Reddit',    ok: !reddit.isError,    loading: reddit.isLoading,    note: 'Public JSON API — no key required', subs: ECOM_SUBS.slice(0, 3).join(', ') },
    { id: 'tiktok',    label: 'TikTok',    ok: false,              loading: false,                note: 'Requires Apify API key (set in Settings)', subs: '' },
    { id: 'pinterest', label: 'Pinterest', ok: !pinterest.isError, loading: pinterest.isLoading, note: 'Requires Backend URL + Pinterest Access Token', subs: '' },
    { id: 'google',    label: 'Google',    ok: !google.isError,    loading: google.isLoading,    note: 'Requires Backend URL — no key needed', subs: '' },
    { id: 'amazon',    label: 'Amazon',    ok: !amazon.isError,    loading: amazon.isLoading,    note: 'Requires Backend URL — no key needed', subs: '' },
  ] as const;

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Sources</h1>
      <p className={styles.subtitle}>Live status of connected trend data sources.</p>

      <div className={styles.list}>
        {sources.map(s => (
          <div key={s.id} className={styles.row}>
            <div className={styles.rowLeft}>
              <span className={styles.dot} data-state={s.loading ? 'loading' : s.ok ? 'ok' : 'error'} />
              <div>
                <div className={styles.sourceLabel}>{s.label}</div>
                <div className={styles.sourceNote}>{s.note}</div>
                {s.subs && <div className={styles.sourceSubs}>{s.subs}</div>}
              </div>
            </div>
            <Badge
              variant={s.loading ? 'warning' : s.ok ? 'success' : 'danger'}
              dot
            >
              {s.loading ? 'Loading' : s.ok ? 'Live' : 'Unavailable'}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
