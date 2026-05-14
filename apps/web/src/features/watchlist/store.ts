import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrendProduct } from '@/types';

interface WatchlistStore {
  items: TrendProduct[];
  add:       (product: TrendProduct) => void;
  remove:    (id: string) => void;
  isWatched: (id: string) => boolean;
  clear:     () => void;
}

export const useWatchlistStore = create<WatchlistStore>()(
  persist(
    (set, get) => ({
      items: [],
      add: (product) => set(s => ({
        items: s.items.some(i => i.id === product.id) ? s.items : [...s.items, product],
      })),
      remove: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
      isWatched: (id) => get().items.some(i => i.id === id),
      clear: () => set({ items: [] }),
    }),
    { name: 'trendz_watchlist' },
  ),
);
