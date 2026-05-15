import { useEffect } from 'react';
import type { TrendProduct } from '@/types';
import { useWatchlistStore } from './store';
import { toast } from '@/components/Toast';

function notify(title: string, body: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch { /* ignore */ }
  }
}

export function useWatchlistAlerts(liveProducts: TrendProduct[]) {
  const items          = useWatchlistStore(s => s.items);
  const markAlertFired = useWatchlistStore(s => s.markAlertFired);

  useEffect(() => {
    if (liveProducts.length === 0 || items.length === 0) return;
    const byId = new Map(liveProducts.map(p => [p.id, p]));

    for (const watched of items) {
      const live = byId.get(watched.product.id);
      if (!live) continue;

      const current = live.viralScore.total;
      const threshold = watched.viralThreshold;
      const last = watched.lastAlertedViral;

      if (current >= threshold && (last === null || last < threshold)) {
        toast(
          `🚀 ${live.name} crossed ${threshold}`,
          `Viral Score is now ${Math.round(current)}.`,
          'success',
        );
        notify(`${live.name} is spiking`, `Viral Score crossed ${threshold} (now ${Math.round(current)}).`);
        markAlertFired(live.id, current);
      } else if (current < threshold && last !== null && last >= threshold) {
        // Cooled below threshold — reset so we can re-fire next time it crosses up.
        markAlertFired(live.id, current);
      }
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
