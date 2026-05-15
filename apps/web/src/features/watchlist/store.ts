import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrendProduct } from '@/types';

export interface WatchedItem {
  product: TrendProduct;
  /** Fire when viralScore.total crosses this value upward. */
  viralThreshold: number;
  /** Last viral value we fired an alert for (so we don't spam). */
  lastAlertedViral: number | null;
}

interface WatchlistStore {
  items: WatchedItem[];
  add:       (product: TrendProduct, viralThreshold?: number) => void;
  remove:    (id: string) => void;
  isWatched: (id: string) => boolean;
  setThreshold:    (id: string, threshold: number) => void;
  markAlertFired:  (id: string, viral: number) => void;
  clear:     () => void;
}

export const useWatchlistStore = create<WatchlistStore>()(
  persist(
    (set, get) => ({
      items: [],
      add: (product, viralThreshold = 80) => set(s => ({
        items: s.items.some(i => i.product.id === product.id)
          ? s.items
          : [...s.items, { product, viralThreshold, lastAlertedViral: null }],
      })),
      remove: (id) => set(s => ({ items: s.items.filter(i => i.product.id !== id) })),
      isWatched: (id) => get().items.some(i => i.product.id === id),
      setThreshold: (id, threshold) => set(s => ({
        items: s.items.map(i => i.product.id === id ? { ...i, viralThreshold: threshold } : i),
      })),
      markAlertFired: (id, viral) => set(s => ({
        items: s.items.map(i => i.product.id === id ? { ...i, lastAlertedViral: viral } : i),
      })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'trendz_watchlist',
      version: 2,
      migrate: (persisted: unknown) => {
        const old = persisted as { items?: unknown[] } | null;
        if (!old || !Array.isArray(old.items)) return { items: [] };
        // Older shape stored TrendProduct directly.
        if (old.items.length > 0 && (old.items[0] as { product?: unknown }).product === undefined) {
          return {
            items: (old.items as TrendProduct[]).map(p => ({
              product: p,
              viralThreshold: 80,
              lastAlertedViral: null,
            })),
          };
        }
        return { items: old.items as WatchedItem[] };
      },
    },
  ),
);
