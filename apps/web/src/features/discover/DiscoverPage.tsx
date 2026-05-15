import { useState } from 'react';
import type { TrendProduct } from '@/types';
import { Skeleton } from '@/components/Skeleton';
import { ProductCard } from './ProductCard';
import { ProductDrawer } from './ProductDrawer';
import { FilterBar, defaultFilters } from './FilterBar';
import { useDiscoverData } from './useDiscoverData';
import styles from './DiscoverPage.module.css';

export default function DiscoverPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [selected, setSelected] = useState<TrendProduct | null>(null);
  const { products, isLoading, sources } = useDiscoverData(filters);
  const sourceList = [
    { id: 'reddit',    label: 'Reddit',    s: sources.reddit },
    { id: 'tiktok',    label: 'TikTok',    s: sources.tiktok },
    { id: 'pinterest', label: 'Pinterest', s: sources.pinterest },
    { id: 'google',    label: 'Google',    s: sources.google },
    { id: 'amazon',    label: 'Amazon',    s: sources.amazon },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>Discover</h1>
          <p className={styles.subtitle}>
            Cross-source trend signals, ranked by Viral Score
          </p>
        </div>
        <div className={styles.sourceStatus}>
          {sourceList.map(({ id, label, s }) => (
            <SourceDot key={id} label={label} ok={s.ok} loading={s.loading} configured={s.configured} />
          ))}
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <Skeleton height={140} borderRadius="var(--radius-2)" />
              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Skeleton height={12} width="60%" />
                <Skeleton height={16} />
                <Skeleton height={12} width="80%" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔍</div>
          <p className={styles.emptyTitle}>No trends match your filters</p>
          <p className={styles.emptyDesc}>Try relaxing the filters or connecting more data sources in Settings.</p>
        </div>
      ) : (
        <>
          <div className={styles.resultsHeader}>
            <span className={styles.resultCount}>{products.length} products</span>
          </div>
          <div className={styles.grid}>
            {products.map(p => (
              <ProductCard key={p.id} product={p} onClick={setSelected} />
            ))}
          </div>
        </>
      )}

      <ProductDrawer product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function SourceDot({ label, ok, loading, configured }: { label: string; ok: boolean; loading: boolean; configured: boolean }) {
  const state = !configured ? 'unconfigured' : loading ? 'loading' : ok ? 'ok' : 'error';
  const stateText = !configured ? 'not configured' : loading ? 'loading' : ok ? 'live' : 'error';
  return (
    <div className={styles.sourceDot} title={`${label}: ${stateText}`}>
      <span className={styles.dot} data-state={state} />
      <span className={styles.dotLabel}>{label}</span>
    </div>
  );
}
