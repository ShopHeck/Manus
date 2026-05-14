import { useState } from 'react';
import { X, Star, ExternalLink } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import type { TrendProduct } from '@/types';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { useWatchlistStore } from '@/features/watchlist/store';
import { toast } from '@/components/Toast';
import { computeMargin } from '@/lib/margin';
import { defaultMarginInputs } from '@/lib/margin';
import styles from './ProductDrawer.module.css';

interface ProductDrawerProps {
  product: TrendProduct | null;
  onClose: () => void;
}

type Tab = 'overview' | 'margin';

export function ProductDrawer({ product, onClose }: ProductDrawerProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const { isWatched, add, remove } = useWatchlistStore();
  const watched = product ? isWatched(product.id) : false;

  function handleWatch() {
    if (!product) return;
    if (watched) { remove(product.id); toast('Removed from Watchlist', product.name); }
    else { add(product); toast('Added to Watchlist', product.name, 'success'); }
  }

  return (
    <Dialog.Root open={!!product} onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.drawer} aria-label="Product details">
          {product && <DrawerContent product={product} tab={tab} setTab={setTab} watched={watched} onWatch={handleWatch} onClose={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DrawerContent({ product, tab, setTab, watched, onWatch, onClose }: {
  product: TrendProduct;
  tab: Tab;
  setTab: (t: Tab) => void;
  watched: boolean;
  onWatch: () => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.inner}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerMeta}>
          <Badge variant="default">{product.category}</Badge>
          <div className={styles.sourceBadges}>
            {product.sources.map(s => <Badge key={s.id} variant={s.id} size="sm">{s.label}</Badge>)}
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button variant="ghost" size="icon" onClick={onWatch} title={watched ? 'Unwatch' : 'Watch'} className={watched ? styles.watchedBtn : ''}>
            <Star size={16} fill={watched ? 'currentColor' : 'none'} />
          </Button>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" onClick={onClose}><X size={16} /></Button>
          </Dialog.Close>
        </div>
      </div>

      <h2 className={styles.name}>{product.name}</h2>

      {/* Tabs */}
      <div className={styles.tabs}>
        {(['overview', 'margin'] as Tab[]).map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={styles.body}>
        {tab === 'overview' && <OverviewTab product={product} />}
        {tab === 'margin'   && <MarginTab   product={product} />}
      </div>

      {/* Footer CTA */}
      <div className={styles.footer}>
        <Button variant="primary" size="md" onClick={onWatch}>
          <Star size={14} fill={watched ? 'currentColor' : 'none'} />
          {watched ? 'Watching' : 'Add to Watchlist'}
        </Button>
        {Object.entries(product.urls).map(([src, url]) => url ? (
          <a key={src} href={url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="md">
              <ExternalLink size={14} /> {src}
            </Button>
          </a>
        ) : null)}
      </div>
    </div>
  );
}

function OverviewTab({ product }: { product: TrendProduct }) {
  const vs = product.viralScore;
  const sat = product.saturation;

  return (
    <div className={styles.overviewTab}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Viral Score — {Math.round(vs.total)}</h3>
        <div className={styles.scoreBreakdown}>
          {[
            { label: 'TikTok',    value: vs.tiktok,    weight: '35%' },
            { label: 'Reddit',    value: vs.reddit,    weight: '20%' },
            { label: 'Pinterest', value: vs.pinterest, weight: '20%' },
            { label: 'Google',    value: vs.google,    weight: '15%' },
            { label: 'Amazon',    value: vs.amazon,    weight: '10%' },
          ].map(row => (
            <div key={row.label} className={styles.scoreRow}>
              <span className={styles.scoreRowLabel}>{row.label}</span>
              <div className={styles.scoreBar}>
                <div
                  className={styles.scoreBarFill}
                  style={{ width: `${row.value}%`, background: `var(--accent)` }}
                />
              </div>
              <span className={styles.scoreRowValue}>{Math.round(row.value)}</span>
              <span className={styles.scoreRowWeight}>{row.weight}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Saturation — {sat.total} <span className={styles.satNote}>(lower = more opportunity)</span></h3>
        <div className={styles.scoreBreakdown}>
          <div className={styles.scoreRow}>
            <span className={styles.scoreRowLabel}>Store Count</span>
            <div className={styles.scoreBar}><div className={styles.scoreBarFill} style={{ width: `${sat.storeCount}%`, background: 'var(--warning)' }} /></div>
            <span className={styles.scoreRowValue}>{sat.storeCount}</span>
          </div>
          <div className={styles.scoreRow}>
            <span className={styles.scoreRowLabel}>Ad Density</span>
            <div className={styles.scoreBar}><div className={styles.scoreBarFill} style={{ width: `${sat.adDensity}%`, background: 'var(--warning)' }} /></div>
            <span className={styles.scoreRowValue}>{sat.adDensity}</span>
          </div>
          <div className={styles.scoreRow}>
            <span className={styles.scoreRowLabel}>Sentiment</span>
            <div className={styles.scoreBar}><div className={styles.scoreBarFill} style={{ width: `${sat.sentimentScore}%`, background: 'var(--success)' }} /></div>
            <span className={styles.scoreRowValue}>{sat.sentimentScore}</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Tags</h3>
        <div className={styles.tagList}>
          {product.tags.map(t => <Badge key={t} variant="default" size="sm">#{t}</Badge>)}
        </div>
      </section>
    </div>
  );
}

function MarginTab({ product }: { product: TrendProduct }) {
  const [inputs, setInputs] = useState(product.margin ?? defaultMarginInputs('default', 39.99));
  const result = computeMargin(inputs);

  function field(key: keyof typeof inputs) {
    return (
      <label className={styles.marginField} key={key}>
        <span className={styles.marginFieldLabel}>{MARGIN_LABELS[key]}</span>
        <div className={styles.marginInputWrap}>
          <span className={styles.marginPrefix}>$</span>
          <input
            type="number"
            min={0}
            step={0.01}
            className={styles.marginInput}
            value={inputs[key]}
            onChange={e => setInputs(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
          />
        </div>
      </label>
    );
  }

  const marginColor = result.netMarginPct >= 25
    ? 'var(--success)'
    : result.netMarginPct >= 10 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className={styles.marginTab}>
      <div className={styles.marginInputs}>
        {(['cogs', 'shipping', 'retailPrice'] as const).map(k => field(k))}
      </div>

      <div className={styles.marginResult}>
        <div className={styles.marginResultItem}>
          <span className={styles.marginResultLabel}>Gross Margin</span>
          <span className={styles.marginResultValue}>${result.grossMargin.toFixed(2)} ({result.grossMarginPct.toFixed(1)}%)</span>
        </div>
        <div className={styles.marginResultItem}>
          <span className={styles.marginResultLabel}>Net Margin (est.)</span>
          <span className={styles.marginResultValue} style={{ color: marginColor, fontWeight: 'var(--weight-bold)' }}>
            ${result.netMargin.toFixed(2)} ({result.netMarginPct.toFixed(1)}%)
          </span>
        </div>
        <div className={styles.marginResultItem}>
          <span className={styles.marginResultLabel}>Break-even Units</span>
          <span className={styles.marginResultValue}>{result.breakEvenUnits === 9999 ? '∞' : result.breakEvenUnits}</span>
        </div>
      </div>

      <div className={styles.marginAdvanced}>
        <details>
          <summary className={styles.advancedToggle}>Advanced inputs</summary>
          <div className={styles.marginInputs} style={{ marginTop: 'var(--space-3)' }}>
            {(['adCpm', 'platformFee', 'platformFixed'] as const).map(k => field(k))}
          </div>
        </details>
      </div>
    </div>
  );
}

const MARGIN_LABELS: Record<string, string> = {
  cogs:          'Cost of Goods',
  shipping:      'Shipping / unit',
  retailPrice:   'Retail Price',
  adCpm:         'Ad CPM ($)',
  platformFee:   'Platform Fee (%)',
  platformFixed: 'Platform Fixed ($)',
};
