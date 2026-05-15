import { useEffect } from 'react';
import type { TrendProduct } from '@/types';
import { useWatchlistStore } from './store';
import { toast } from '@/components/Toast';

const MAX_ALERTS_PER_RUN = 3;

function notify(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try { new Notification(title, { body }); } catch { /* ignore */ }
}

export function useWatchlistAlerts(liveProducts: TrendProduct[]) {
  const items          = useWatchlistStore(s => s.items);
  const markAlertFired = useWatchlistStore(s => s.markAlertFired);

  useEffect(() => {
    if (liveProducts.length === 0 || items.length === 0) return;

    try {
      const byId = new Map(liveProducts.map(p => [p.id, p]));
      let fired = 0;

      for (const watched of items) {
        // Guard against legacy / malformed entries.
        if (!watched || typeof watched !== 'object') continue;
        const product = watched.product;
        if (!product || typeof product.id !== 'string') continue;

        const live = byId.get(product.id);
        if (!live || !live.viralScore) continue;

        const current   = live.viralScore.total;
        const threshold = typeof watched.viralThreshold === 'number' ? watched.viralThreshold : 80;
        const last      = watched.lastAlertedViral ?? null;

        if (current >= threshold && (last === null || last < threshold)) {
          if (fired < MAX_ALERTS_PER_RUN) {
            toast(
              `${live.name} crossed ${threshold}`,
              `Viral Score is now ${Math.round(current)}.`,
              'success',
            );
            notify(`${live.name} is spiking`, `Viral Score crossed ${threshold} (now ${Math.round(current)}).`);
            fired++;
          }
          markAlertFired(live.id, current);
        } else if (current < threshold && last !== null && last >= threshold) {
          markAlertFired(live.id, current);
        }
      }
    } catch (err) {
      // Never let an alert evaluation crash the page.
      // eslint-disable-next-line no-console
      console.error('[Manus] useWatchlistAlerts failed:', err);
    }
  }, [liveProducts, items, markAlertFired]);
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'default') {
    try { return await Notification.requestPermission(); } catch { return 'denied'; }
  }
  return Notification.permission;
}
