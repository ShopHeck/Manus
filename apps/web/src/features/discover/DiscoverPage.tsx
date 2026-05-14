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
          <SourceDot label="Reddit"    ok={sources.reddit.ok}    loading={sources.reddit.loading}    />
          <SourceDot label="Amazon"    ok={sources.amazon.ok}    loading={sources.amazon.loading}    />
          <SourceDot label="Pinterest" ok={sources.pinterest.ok} loading={sources.pinterest.loading} />
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

function SourceDot({ label, ok, loading }: { label: string; ok: boolean; loading: boolean }) {
  return (
    <div className={styles.sourceDot} title={`${label}: ${loading ? 'loading' : ok ? 'live' : 'unavailable'}`}>
      <span
        className={styles.dot}
        data-state={loading ? 'loading' : ok ? 'ok' : 'error'}
      />
      <span className={styles.dotLabel}>{label}</span>
    </div>
  );
}
