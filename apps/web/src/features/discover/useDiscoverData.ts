import { useEffect, useMemo } from 'react';
import { useSnapshotStore } from '@/lib/snapshots';
import { useRedditTrends } from '@/data/sources/reddit';
import { useAmazonMovers } from '@/data/sources/amazon';
import { usePinterestTrends } from '@/data/sources/pinterest';
import { useGoogleTrends } from '@/data/sources/google';
import { useTikTokTrends } from '@/data/sources/tiktok';
import { SAMPLE_PRODUCTS } from '@/data/sample';
import { storage } from '@/lib/storage';
import type { TrendProduct, DiscoverFilters } from '@/types';
import { clusterSignals, clusterToProduct, type SourceSignal } from '@/lib/cluster';
import { redditScoreToSignal } from '@/lib/scoring';

function inferCategory(subreddit: string): string {
  const lower = subreddit.toLowerCase();
  if (lower.includes('skincare') || lower.includes('makeup')) return 'Beauty';
  if (lower.includes('fashion'))                              return 'Fashion';
  if (lower.includes('gadget') || lower.includes('tech'))     return 'Electronics';
  if (lower.includes('kitchen') || lower.includes('cook'))    return 'Kitchen';
  if (lower.includes('fit') || lower.includes('health'))      return 'Health';
  if (lower.includes('pet'))                                  return 'Pets';
  return 'General';
}

export function useDiscoverData(filters: DiscoverFilters) {
  const reddit    = useRedditTrends();
  const amazon    = useAmazonMovers();
  const pinterest = usePinterestTrends();
  const google    = useGoogleTrends();
  const tiktok    = useTikTokTrends();

  const hasBackend = !!storage.get('backendUrl', '');
  const hasApify   = !!storage.get('apifyApiKey', '');

  const liveProducts = useMemo(() => {
    const signals: SourceSignal[] = [];

    if (reddit.data) {
      reddit.data.forEach(result => {
        result.posts.slice(0, 8).forEach(post => {
          signals.push({
            source:    'reddit',
            name:      post.title.slice(0, 80),
            signal:    redditScoreToSignal(post.score, post.numComments),
            url:       post.permalink,
            thumbnail: post.thumbnail,
            tags:      [post.subreddit.toLowerCase()],
            category:  inferCategory(post.subreddit),
            firstSeen: new Date(post.createdUtc * 1000).toISOString().slice(0, 10),
          });
        });
      });
    }

    if (amazon.data?.products) {
      amazon.data.products.forEach(p => {
        signals.push({
          source:   'amazon',
          name:     p.name,
          signal:   p.signal,
          url:      p.url,
          category: capitalize(amazon.data!.category),
        });
      });
    }

    if (pinterest.data?.trends) {
      pinterest.data.trends.slice(0, 25).forEach(t => {
        signals.push({
          source: 'pinterest',
          name:   t.keyword,
          signal: Math.min(100, Math.max(0, t.pctGrowth ?? 0)),
          tags:   [t.keyword.toLowerCase().split(' ')[0]],
        });
      });
    }

    if (google.data?.trends) {
      google.data.trends.slice(0, 25).forEach(t => {
        signals.push({
          source: 'google',
          name:   t.keyword,
          signal: 60, // Google daily trends don't ship volume, treat as floor signal
          tags:   t.relatedQueries?.slice(0, 2),
        });
      });
    }

    if (tiktok.data?.videos) {
      tiktok.data.videos.forEach(v => {
        const sig = Math.min(100, Math.log10(Math.max(1, v.plays + v.likes * 5)) * 14);
        signals.push({
          source:    'tiktok',
          name:      v.caption.slice(0, 80),
          signal:    sig,
          url:       v.url,
          thumbnail: v.thumbnail,
          tags:      v.hashtags?.slice(0, 3),
          firstSeen: v.createdAt ? new Date(v.createdAt * 1000).toISOString().slice(0, 10) : undefined,
        });
      });
    }

    const clusters = clusterSignals(signals);
    clusters.sort((a, b) => {
      const totalA = a.signals.reduce((s, x) => s + x.signal, 0) + a.signals.length * 8;
      const totalB = b.signals.reduce((s, x) => s + x.signal, 0) + b.signals.length * 8;
      return totalB - totalA;
    });

    const live = clusters.slice(0, 50).map((c, i) => clusterToProduct(c, i + 1));

    // Always show something. If the live pipeline produced too little signal
    // to be useful (no sources configured, all queries failed, every signal
    // tokenized down to nothing), fall back to / supplement with samples so
    // the UI is never empty.
    if (live.length === 0) return SAMPLE_PRODUCTS;
    if (live.length < 6) {
      const seenNames = new Set(live.map(p => p.name.toLowerCase()));
      const filler = SAMPLE_PRODUCTS.filter(p => !seenNames.has(p.name.toLowerCase()));
      return [...live, ...filler].slice(0, Math.max(8, live.length));
    }
    return live;
  }, [reddit.data, amazon.data, pinterest.data, google.data, tiktok.data]);

  const recordMany = useSnapshotStore(s => s.recordMany);
  useEffect(() => {
    if (liveProducts.length > 0) recordMany(liveProducts);
  }, [liveProducts, recordMany]);

  const filtered = useMemo(() => {
    let list = liveProducts;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q)
      );
    }

    if (filters.categories.length > 0) {
      list = list.filter(p => filters.categories.includes(p.category));
    }

    if (filters.sources.length > 0) {
      list = list.filter(p => p.sources.some(s => filters.sources.includes(s.id)));
    }

    list = list.filter(p =>
      p.viralScore.total >= filters.minViralScore &&
      p.saturation.total <= filters.maxSaturation
    );

    switch (filters.sortBy) {
      case 'viralScore': list = [...list].sort((a, b) => b.viralScore.total - a.viralScore.total); break;
      case 'saturation': list = [...list].sort((a, b) => a.saturation.total - b.saturation.total); break;
      case 'newest':     list = [...list].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));  break;
      case 'rank':       list = [...list].sort((a, b) => a.rank - b.rank);                         break;
    }

    return list;
  }, [liveProducts, filters]);

  return {
    products: filtered,
    isLoading: reddit.isLoading,
    isError:   reddit.isError,
    sources: {
      reddit:    { ok: !reddit.isError    && reddit.isSuccess,    loading: reddit.isLoading,    configured: true },
      amazon:    { ok: !amazon.isError    && amazon.isSuccess,    loading: amazon.isLoading,    configured: hasBackend },
      pinterest: { ok: !pinterest.isError && pinterest.isSuccess, loading: pinterest.isLoading, configured: hasBackend },
      google:    { ok: !google.isError    && google.isSuccess,    loading: google.isLoading,    configured: hasBackend },
      tiktok:    { ok: !tiktok.isError    && tiktok.isSuccess,    loading: tiktok.isLoading,    configured: hasBackend && hasApify },
    },
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
