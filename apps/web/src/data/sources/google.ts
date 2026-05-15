import { useQuery } from '@tanstack/react-query';
import { storage } from '@/lib/storage';

interface GoogleTrend {
  keyword:        string;
  traffic:        string;
  articles:       { title: string; url: string }[];
  relatedQueries: string[];
}

interface GoogleTrendsResult {
  geo:    string;
  trends: GoogleTrend[];
  signalScore: number;
}

async function fetchGoogleTrends(geo = 'US'): Promise<GoogleTrendsResult> {
  const backendUrl = storage.get('backendUrl', '');
  if (!backendUrl) return { geo, trends: [], signalScore: 50 };

  const res = await fetch(`${backendUrl}/api/google-trends?geo=${geo}`);
  if (!res.ok) throw new Error(`Google trends: ${res.status}`);
  const json = await res.json() as { trends?: GoogleTrend[] };

  const trends = json.trends ?? [];
  return { geo, trends, signalScore: trends.length > 0 ? 65 : 0 };
}

export function useGoogleTrends(geo = 'US') {
  return useQuery({
    queryKey: ['google-trends', geo],
    queryFn:  () => fetchGoogleTrends(geo),
    staleTime: 60 * 60 * 1000,
    enabled:  !!storage.get('backendUrl', ''),
  });
}
