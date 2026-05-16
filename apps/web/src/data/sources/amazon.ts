import { useQuery } from '@tanstack/react-query';
import { amazonRankToSignal } from '@/lib/scoring';
import { storage } from '@/lib/storage';

interface AmazonProduct {
  name:     string;
  asin:     string;
  url:      string;
  rank:     number;
  signal:   number;
  imageUrl: string | null;
}

interface AmazonMoversResult {
  category: string;
  products: AmazonProduct[];
  signalScore: number;
}

async function fetchAmazonMovers(category = 'beauty'): Promise<AmazonMoversResult> {
  const backendUrl = storage.get('backendUrl', '');
  if (!backendUrl) return { category, products: [], signalScore: 0 };

  const res = await fetch(`${backendUrl}/api/amazon-movers?category=${category}`);
  if (!res.ok) throw new Error(`Amazon movers: ${res.status}`);
  const json = await res.json() as { products?: { name: string; asin: string; url: string; rank: number; imageUrl?: string | null }[] };

  const products: AmazonProduct[] = (json.products ?? []).map(p => ({
    ...p,
    signal:   amazonRankToSignal(p.rank),
    imageUrl: p.imageUrl ?? null,
  }));

  const avg = products.reduce((a, p) => a + p.signal, 0) / (products.length || 1);
  return { category, products, signalScore: avg };
}

export function useAmazonMovers(category = 'beauty') {
  return useQuery({
    queryKey: ['amazon-movers', category],
    queryFn:  () => fetchAmazonMovers(category),
    staleTime: 30 * 60 * 1000,
    enabled:  !!storage.get('backendUrl', ''),
  });
}
