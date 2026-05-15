import { Link } from 'react-router-dom';
import { MessageCircle, Music2, PinIcon, Globe, ShoppingCart, ArrowRight } from 'lucide-react';
import { useRedditTrends, ECOM_SUBS } from '@/data/sources/reddit';
import { useAmazonMovers } from '@/data/sources/amazon';
import { usePinterestTrends } from '@/data/sources/pinterest';
import { useGoogleTrends } from '@/data/sources/google';
import { useTikTokTrends } from '@/data/sources/tiktok';
import { storage } from '@/lib/storage';
import styles from './SourcesPage.module.css';

type SourceState = 'ok' | 'loading' | 'unconfigured' | 'error';

interface SourceRowData {
  id: string;
  label: string;
  Icon: typeof MessageCircle;
  note: string;
  hint?: string;
  state: SourceState;
  error?: string;
}

const stateCopy: Record<SourceState, string> = {
  ok:           'Live',
  loading:      'Loading',
  unconfigured: 'Not configured',
  error:        'Error',
};

export default function SourcesPage() {
  const reddit    = useRedditTrends();
  const tiktok    = useTikTokTrends();
  const amazon    = useAmazonMovers();
  const pinterest = usePinterestTrends();
  const google    = useGoogleTrends();

  const hasBackend = !!storage.get('backendUrl', '');
  const hasApify   = !!storage.get('apifyApiKey', '');

  function backendState(q: { isLoading: boolean; isError: boolean; isSuccess: boolean }, errMsg?: string): SourceState {
    if (!hasBackend) return 'unconfigured';
    if (q.isLoading) return 'loading';
    if (q.isError)   return 'error';
    return q.isSuccess ? 'ok' : 'loading';
  }

  const sources: SourceRowData[] = [
    {
      id:    'reddit',
      label: 'Reddit',
      Icon:  MessageCircle,
      note:  hasBackend ? 'Proxied through your backend' : 'Public JSON, fetched in browser',
      hint:  ECOM_SUBS.slice(0, 3).join(', '),
      state: reddit.isLoading ? 'loading' : reddit.isError ? 'error' : 'ok',
      error: reddit.error instanceof Error ? reddit.error.message : undefined,
    },
    {
      id:    'tiktok',
      label: 'TikTok',
      Icon:  Music2,
      note:  hasApify && hasBackend
        ? 'Apify TikTok scraper'
        : 'Needs Apify API key + Backend URL',
      state: !hasApify || !hasBackend
        ? 'unconfigured'
        : tiktok.isLoading ? 'loading'
        : tiktok.isError   ? 'error'
        : 'ok',
      error: tiktok.error instanceof Error ? tiktok.error.message : undefined,
    },
    {
      id:    'pinterest',
      label: 'Pinterest',
      Icon:  PinIcon,
      note:  hasBackend
        ? 'Pinterest Trends v5'
        : 'Needs Backend URL with PINTEREST_ACCESS_TOKEN',
      state: backendState(pinterest, pinterest.error instanceof Error ? pinterest.error.message : undefined),
      error: pinterest.error instanceof Error ? pinterest.error.message : undefined,
    },
    {
      id:    'google',
      label: 'Google',
      Icon:  Globe,
      note:  hasBackend ? 'Daily trending searches' : 'Needs Backend URL',
      state: backendState(google),
      error: google.error instanceof Error ? google.error.message : undefined,
    },
    {
      id:    'amazon',
      label: 'Amazon',
      Icon:  ShoppingCart,
      note:  hasBackend ? 'Movers & Shakers (live scrape)' : 'Needs Backend URL',
      state: backendState(amazon),
      error: amazon.error instanceof Error ? amazon.error.message : undefined,
    },
  ];

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Sources</h1>
      <p className={styles.subtitle}>Live status of trend data feeds.</p>

      <div className={styles.list}>
        {sources.map(s => <SourceRow key={s.id} source={s} />)}
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: SourceRowData }) {
  const { Icon, state } = source;
  return (
    <div className={styles.row} data-state={state}>
      <div className={styles.iconWrap}>
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className={styles.body}>
        <div className={styles.label}>{source.label}</div>
        <div className={styles.note}>{source.note}</div>
        {source.hint && <div className={styles.hint}>{source.hint}</div>}
        {state === 'error' && source.error && (
          <div className={styles.errorMsg}>{source.error}</div>
        )}
      </div>
      <div className={styles.status}>
        <span className={styles.dot} data-state={state} />
        <span className={styles.statusLabel}>{stateCopy[state]}</span>
        {state === 'unconfigured' && (
          <Link to="/settings" className={styles.configureLink}>
            Configure <ArrowRight size={11} />
          </Link>
        )}
      </div>
    </div>
  );
}
