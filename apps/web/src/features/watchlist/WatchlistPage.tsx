import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import { useWatchlistStore } from './store';
import { Score } from '@/components/Score';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ProductDrawer } from '@/features/discover/ProductDrawer';
import type { TrendProduct } from '@/types';
import { toast } from '@/components/Toast';
import styles from './WatchlistPage.module.css';

export default function WatchlistPage() {
  const { items, remove } = useWatchlistStore();
  const [selected, setSelected] = useState<TrendProduct | null>(null);

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <Bookmark size={48} strokeWidth={1} className={styles.emptyIcon} />
        <h2 className={styles.emptyTitle}>Your watchlist is empty</h2>
        <p className={styles.emptyDesc}>Click the ☆ on any product in Discover to track it here.</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>Watchlist</h1>
          <p className={styles.subtitle}>{items.length} product{items.length !== 1 ? 's' : ''} tracked</p>
        </div>
      </div>

      <div className={styles.list}>
        {items.map(product => (
          <div key={product.id} className={styles.row} onClick={() => setSelected(product)} role="button" tabIndex={0}>
            <div className={styles.rowInfo}>
              <div className={styles.rowName}>{product.name}</div>
              <div className={styles.rowMeta}>
                <Badge variant="default" size="sm">{product.category}</Badge>
                {product.sources.map(s => <Badge key={s.id} variant={s.id} size="sm">{s.label}</Badge>)}
              </div>
            </div>
            <div className={styles.rowScores}>
              <div className={styles.scoreCol}>
                <Score value={product.viralScore.total} size="sm" showRing />
                <span className={styles.scoreColLabel}>Viral</span>
              </div>
              <div className={styles.scoreCol}>
                <Score value={100 - product.saturation.total} size="sm" showRing />
                <span className={styles.scoreColLabel}>Opportunity</span>
              </div>
            </div>
            <Button
              variant="danger"
              size="icon"
              onClick={e => {
                e.stopPropagation();
                remove(product.id);
                toast('Removed from Watchlist', product.name);
              }}
              title="Remove"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>

      <ProductDrawer product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
