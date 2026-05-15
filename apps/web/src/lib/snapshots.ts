import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrendProduct } from '@/types';

export interface Snapshot {
  ts:         number; // ms epoch
  viral:      number;
  saturation: number;
  rank:       number;
  sources:    number;
}

const MAX_PER_PRODUCT = 60;
const MIN_GAP_MS      = 6 * 60 * 60 * 1000; // 6h between snapshots

interface SnapshotStore {
  byProduct: Record<string, Snapshot[]>;
  record:    (product: TrendProduct) => void;
  recordMany:(products: TrendProduct[]) => void;
  history:   (productId: string) => Snapshot[];
  latest:    (productId: string) => Snapshot | undefined;
  previous:  (productId: string) => Snapshot | undefined;
  clear:     () => void;
}

export const useSnapshotStore = create<SnapshotStore>()(
  persist(
    (set, get) => ({
      byProduct: {},

      record: (product) => set(s => insertSnapshot(s.byProduct, product)),

      recordMany: (products) => set(s => {
        let next = s.byProduct;
        for (const p of products) {
          const updated = insertSnapshot(next, p);
          if (updated.byProduct !== next) next = updated.byProduct;
        }
        return { byProduct: next };
      }),

      history:  (id) => get().byProduct[id] ?? [],
      latest:   (id) => {
        const h = get().byProduct[id];
        return h && h.length ? h[h.length - 1] : undefined;
      },
      previous: (id) => {
        const h = get().byProduct[id];
        return h && h.length > 1 ? h[h.length - 2] : undefined;
      },
      clear:    () => set({ byProduct: {} }),
    }),
    { name: 'trendz_snapshots', version: 1 },
  ),
);

function insertSnapshot(
  current: Record<string, Snapshot[]>,
  p: TrendProduct,
): { byProduct: Record<string, Snapshot[]> } {
  const now = Date.now();
  const existing = current[p.id] ?? [];
  const last = existing[existing.length - 1];
  if (last && now - last.ts < MIN_GAP_MS) {
    return { byProduct: current };
  }
  const next: Snapshot = {
    ts:         now,
    viral:      Math.round(p.viralScore.total),
    saturation: Math.round(p.saturation.total),
    rank:       p.rank,
    sources:    p.sources.length,
  };
  const updated = [...existing, next].slice(-MAX_PER_PRODUCT);
  return { byProduct: { ...current, [p.id]: updated } };
}
