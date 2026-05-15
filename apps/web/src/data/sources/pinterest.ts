import { useQuery } from '@tanstack/react-query';
import { storage } from '@/lib/storage';

interface PinterestTrend {
  keyword:    string;
  pctGrowth:  number;
  timeSeries: number[];
}

interface PinterestResult {
  region:  string;
  trends:  PinterestTrend[];
  signalScore: number;
}

async function fetchPinterestTrends(region = 'US'): Promise<PinterestResult> {
  const backendUrl = storage.get('backendUrl', '');
  if (!backendUrl) return { region, trends: [], signalScore: 0 };

  const res = await fetch(`${backendUrl}/api/pinterest-trends?region=${region}&limit=50`);
  if (!res.ok) throw new Error(`Pinterest trends: ${res.status}`);
  const json = await res.json() as { trends?: PinterestTrend[] };

  const trends = json.trends ?? [];
  const avg = trends.reduce((a, t) => a + Math.min(100, Math.max(0, t.pctGrowth ?? 0)), 0) / (trends.length || 1);
  return { region, trends, signalScore: Math.min(100, avg) };
}

export function usePinterestTrends(region = 'US') {
  return useQuery({
    queryKey: ['pinterest-trends', region],
    queryFn:  () => fetchPinterestTrends(region),
    staleTime: 60 * 60 * 1000,
    enabled:  !!storage.get('backendUrl', ''),
  });
}
