import { useState, useEffect } from 'react';
import { Store, ExternalLink, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import type { TrendProduct, CompetitorProduct } from '@/types';
import { Button } from '@/components/Button';
import { storage } from '@/lib/storage';
import styles from './CompetitorPanel.module.css';

interface CompetitorPanelProps {
  product:              TrendProduct;
  onCompetitorsLoaded:  (results: CompetitorProduct[]) => void;
}

type Status = 'idle' | 'loading' | 'ok' | 'error' | 'empty';

export function CompetitorPanel({ product, onCompetitorsLoaded }: CompetitorPanelProps) {
  const [competitors, setCompetitors] = useState<CompetitorProduct[]>([]);
  const [status, setStatus]           = useState<Status>('idle');
  const [error, setError]             = useState<string | null>(null);

  async function fetchCompetitors() {
    const backendUrl = storage.get('backendUrl', '');
    if (!backendUrl) {
      setStatus('error');
      setError('Backend URL not set in Settings.');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const params = new URLSearchParams({
        q:        product.name,
        category: product.category,
      });
      const res  = await fetch(`${backendUrl}/api/competitors/search?${params}`);
      const json = await res.json() as {
        competitors?: CompetitorProduct[];
        error?: string;
        rateLimit?: boolean;
      };

      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

      const results = json.competitors ?? [];
      setCompetitors(results);
      onCompetitorsLoaded(results);
      setStatus(results.length === 0 ? 'empty' : 'ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setStatus('error');
      onCompetitorsLoaded([]);
    }
  }

  useEffect(() => { fetchCompetitors(); }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'idle' || status === 'loading') {
    return (
      <div className={styles.centered}>
        <Loader2 size={20} className={styles.spin} />
        <span className={styles.loadingText}>Searching competitor listings…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.notice}>
        <AlertTriangle size={20} className={styles.errorIcon} />
        <p className={styles.noticeTitle}>Competitor search failed</p>
        <p className={styles.errorMsg}>{error}</p>
        <Button variant="outline" size="sm" onClick={fetchCompetitors}>
          <RefreshCw size={12} /> Retry
        </Button>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className={styles.notice}>
        <Store size={20} className={styles.noticeIcon} />
        <p className={styles.noticeTitle}>No competitor listings found</p>
        <p className={styles.noticeDesc}>
          This may be an emerging product with low competition — an opportunity!
        </p>
        <Button variant="outline" size="sm" onClick={fetchCompetitors}>
          <RefreshCw size={12} /> Search again
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>{competitors.length} competitors found</span>
        <div className={styles.headerRight}>
          <span className={styles.rateLimitNote}>⚠ Rate-limited — results may be partial</span>
          <Button variant="ghost" size="sm" onClick={fetchCompetitors}>
            <RefreshCw size={12} /> Refresh
          </Button>
        </div>
      </div>

      <div className={styles.list}>
        {competitors.map((c, i) => (
          <CompetitorCard key={`${c.url}-${i}`} competitor={c} />
        ))}
      </div>
    </div>
  );
}

function CompetitorCard({ competitor: c }: { competitor: CompetitorProduct }) {
  const [imgError, setImgError] = useState(false);

  return (
    <a
      href={c.url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.card}
    >
      <div className={styles.thumb}>
        {c.imageUrl && !imgError ? (
          <img
            src={c.imageUrl}
            alt={c.title}
            className={styles.thumbImg}
            onError={() => setImgError(true)}
          />
        ) : (
          <Store size={20} className={styles.thumbFallback} />
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.storeRow}>
          <span className={styles.storeName}>{c.store}</span>
          <span className={styles.sourceTag}>{c.source === 'google_shopping' ? 'Google Shopping' : c.source}</span>
        </div>
        <p className={styles.title}>{c.title}</p>
        {c.price !== null && (
          <span className={styles.price}>
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: c.currency || 'USD' }).format(c.price)}
          </span>
        )}
      </div>

      <ExternalLink size={12} className={styles.externalIcon} />
    </a>
  );
}
