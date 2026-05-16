import { useState, useEffect } from 'react';
import { Package, Star, ExternalLink, Loader2, RefreshCw, ShoppingCart } from 'lucide-react';
import type { TrendProduct, SupplierCandidate } from '@/types';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { storage } from '@/lib/storage';
import styles from './SupplierPanel.module.css';

interface SupplierPanelProps {
  product:          TrendProduct;
  onSelectSupplier: (s: SupplierCandidate | null) => void;
  selectedSupplier: SupplierCandidate | null;
}

type Status = 'idle' | 'loading' | 'ok' | 'error' | 'unconfigured';

export function SupplierPanel({ product, onSelectSupplier, selectedSupplier }: SupplierPanelProps) {
  const [suppliers, setSuppliers] = useState<SupplierCandidate[]>([]);
  const [status, setStatus]       = useState<Status>('idle');
  const [error, setError]         = useState<string | null>(null);

  async function fetchSuppliers() {
    const backendUrl = storage.get('backendUrl', '');
    if (!backendUrl) {
      setStatus('unconfigured');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const params = new URLSearchParams({
        q:        product.name,
        category: product.category,
      });
      const res  = await fetch(`${backendUrl}/api/suppliers/search?${params}`);
      const json = await res.json() as { suppliers?: SupplierCandidate[]; error?: string; unconfigured?: boolean };

      if (json.unconfigured) {
        setStatus('unconfigured');
        return;
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

      setSuppliers(json.suppliers ?? []);
      setStatus('ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  // Auto-fetch when tab opens
  useEffect(() => { fetchSuppliers(); }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'idle' || status === 'loading') {
    return (
      <div className={styles.centered}>
        <Loader2 size={20} className={styles.spin} />
        <span className={styles.loadingText}>Searching suppliers…</span>
      </div>
    );
  }

  if (status === 'unconfigured') {
    return (
      <div className={styles.notice}>
        <Package size={20} className={styles.noticeIcon} />
        <p className={styles.noticeTitle}>Supplier lookup not configured</p>
        <p className={styles.noticeDesc}>
          Add <code>CJDROPSHIPPING_EMAIL</code> / <code>CJDROPSHIPPING_PASSWORD</code> or{' '}
          <code>ALIEXPRESS_APP_KEY</code> to your backend <code>.env</code> to enable supplier matching.
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.notice}>
        <p className={styles.errorMsg}>{error}</p>
        <Button variant="outline" size="sm" onClick={fetchSuppliers}>
          <RefreshCw size={12} /> Retry
        </Button>
      </div>
    );
  }

  if (suppliers.length === 0) {
    return (
      <div className={styles.notice}>
        <Package size={20} className={styles.noticeIcon} />
        <p className={styles.noticeTitle}>No suppliers found</p>
        <p className={styles.noticeDesc}>Try a more general search term or check back later.</p>
        <Button variant="outline" size="sm" onClick={fetchSuppliers}>
          <RefreshCw size={12} /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>{suppliers.length} suppliers found</span>
        <Button variant="ghost" size="sm" onClick={fetchSuppliers}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>

      <div className={styles.list}>
        {suppliers.map(s => (
          <SupplierCard
            key={s.id}
            supplier={s}
            selected={selectedSupplier?.id === s.id}
            onSelect={() => onSelectSupplier(selectedSupplier?.id === s.id ? null : s)}
          />
        ))}
      </div>

      {selectedSupplier && (
        <div className={styles.selectedNote}>
          <ShoppingCart size={12} />
          Margin Calculator pre-filled with supplier cost &amp; shipping — all values editable.
        </div>
      )}
    </div>
  );
}

function SupplierCard({ supplier, selected, onSelect }: {
  supplier: SupplierCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const sourceLabel = supplier.source === 'cjdropshipping' ? 'CJDropshipping' : 'AliExpress';

  return (
    <div className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
      <div className={styles.cardImage}>
        {supplier.imageUrl ? (
          <img src={supplier.imageUrl} alt={supplier.title} className={styles.image} />
        ) : (
          <Package size={24} className={styles.imageFallback} />
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <Badge variant="default" size="sm">{sourceLabel}</Badge>
          <div className={styles.rating}>
            <Star size={10} fill="currentColor" />
            <span>{supplier.rating.toFixed(1)}</span>
            <span className={styles.ratingCount}>({supplier.orderCount.toLocaleString()} orders)</span>
          </div>
        </div>

        <p className={styles.title}>{supplier.title}</p>

        <div className={styles.meta}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Cost</span>
            <span className={styles.metaValue}>${supplier.cost.toFixed(2)}</span>
          </div>
          <div className={styles.metaDivider} />
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Shipping</span>
            <span className={styles.metaValue}>~${supplier.shipping.toFixed(2)}</span>
          </div>
          <div className={styles.metaDivider} />
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>MOQ</span>
            <span className={styles.metaValue}>{supplier.moq}</span>
          </div>
        </div>

        <div className={styles.cardActions}>
          <Button
            variant={selected ? 'primary' : 'outline'}
            size="sm"
            onClick={onSelect}
          >
            {selected ? 'Selected ✓' : 'Use this supplier'}
          </Button>
          <a href={supplier.url} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm"><ExternalLink size={12} /></Button>
          </a>
        </div>
      </div>
    </div>
  );
}
