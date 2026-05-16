import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Star, ExternalLink, Sparkles, CookingPot, HeartPulse, Cpu, PawPrint, Shirt, Dumbbell, House, Package } from 'lucide-react';
import type { TrendProduct } from '@/types';
import { Badge } from '@/components/Badge';
import { Score } from '@/components/Score';
import { Sparkline } from '@/components/Sparkline';
import { VelocityBadge } from '@/components/VelocityBadge';
import { Button } from '@/components/Button';
import { useWatchlistStore } from '@/features/watchlist/store';
import { useSnapshotStore } from '@/lib/snapshots';
import { computeVelocity } from '@/lib/velocity';
import { toast } from '@/components/Toast';
import styles from './ProductCard.module.css';

interface ProductCardProps {
  product: TrendProduct;
  onClick: (product: TrendProduct) => void;
}

export function ProductCard({ product, onClick }: ProductCardProps) {
  const { isWatched, add, remove } = useWatchlistStore();
  const watched    = isWatched(product.id);
  const [imgError, setImgError] = useState(false);
  const snapshots  = useSnapshotStore(s => s.history(product.id));
  const velocity   = computeVelocity(snapshots);

  function handleWatch(e: React.MouseEvent) {
    e.stopPropagation();
    if (watched) {
      remove(product.id);
      toast('Removed from Watchlist', product.name);
    } else {
      add(product);
      toast('Added to Watchlist', product.name, 'success');
    }
  }

  const margin = product.margin;
  const netMarginPct = margin
    ? Math.round(((margin.retailPrice - margin.cogs - margin.shipping - margin.retailPrice * margin.platformFee - margin.platformFixed) / margin.retailPrice) * 100)
    : null;

  return (
    <div className={styles.card} onClick={() => onClick(product)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick(product)}>
      {/* Rank badge */}
      <div className={styles.rankBadge} data-top={product.rank <= 3}>
        #{product.rank}
      </div>

      {/* Image area */}
      <div className={styles.imageArea}>
        {product.imageUrl && !imgError ? (
          <img src={product.imageUrl} alt={product.name} className={styles.image} onError={() => setImgError(true)} />
        ) : (
          <div className={styles.imageFallback} data-category={product.category}>
            <CategoryIcon category={product.category} size={64} strokeWidth={1.25} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.meta}>
            <Badge variant="default" size="sm">{product.category}</Badge>
            <RankDelta delta={product.rankDelta} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleWatch}
            className={watched ? styles.watchedBtn : ''}
            title={watched ? 'Remove from Watchlist' : 'Add to Watchlist'}
          >
            <Star size={14} fill={watched ? 'currentColor' : 'none'} />
          </Button>
        </div>

        <div className={styles.nameRow}>
          <h3 className={styles.name}>{product.name}</h3>
          <Sparkline productId={product.id} metric="viral" width={56} height={18} />
        </div>

        {/* Velocity badge — only show meaningful states */}
        {velocity.state !== 'not-enough-data' && (
          <div className={styles.velocityRow}>
            <VelocityBadge result={velocity} size="sm" showDelta />
          </div>
        )}

        {/* Source badges */}
        <div className={styles.sourceBadges}>
          {product.sources.map(s => (
            <Badge key={s.id} variant={s.id} size="sm">{s.label}</Badge>
          ))}
        </div>

        {/* Score row */}
        <div className={styles.scoreRow}>
          <div className={styles.scoreItem}>
            <Score value={product.viralScore.total} size="md" showRing />
            <span className={styles.scoreLabel}>Viral</span>
          </div>
          <div className={styles.scoreDivider} />
          <div className={styles.scoreItem}>
            <Score value={100 - product.saturation.total} size="md" showRing />
            <span className={styles.scoreLabel}>Opportunity</span>
          </div>
          {netMarginPct !== null && (
            <>
              <div className={styles.scoreDivider} />
              <div className={styles.scoreItem}>
                <span className={styles.marginValue} data-good={netMarginPct >= 25} data-ok={netMarginPct >= 10 && netMarginPct < 25}>
                  {netMarginPct}%
                </span>
                <span className={styles.scoreLabel}>Est. Margin</span>
              </div>
            </>
          )}
        </div>

        {/* Tags */}
        <div className={styles.tags}>
          {product.tags.slice(0, 3).map(tag => (
            <span key={tag} className={styles.tag}>#{tag}</span>
          ))}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.firstSeen}>since {product.firstSeen}</span>
          {Object.values(product.urls).find(Boolean) && (
            <a
              href={Object.values(product.urls).find(Boolean)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className={styles.sourceLink}
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryIcon({ category, ...props }: { category: string; size?: number; strokeWidth?: number }) {
  const map: Record<string, typeof Sparkles> = {
    Beauty: Sparkles,
    Kitchen: CookingPot,
    Health: HeartPulse,
    Electronics: Cpu,
    Pets: PawPrint,
    Fashion: Shirt,
    Sports: Dumbbell,
    Home: House,
  };
  const Icon = map[category] ?? Package;
  return <Icon {...props} />;
}

function RankDelta({ delta }: { delta: number }) {
  if (delta > 0)  return <span className={styles.rankUp}><TrendingUp size={11} />{delta}</span>;
  if (delta < 0)  return <span className={styles.rankDown}><TrendingDown size={11} />{Math.abs(delta)}</span>;
  return <span className={styles.rankFlat}><Minus size={11} /></span>;
}
