import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const GENERIC_HASHTAGS = new Set([
  'tiktokmademebuyit','fyp','foryou','foryoupage','viral','trending',
  'amazon','amazonfinds','tiktokshop','musthave','love','fypシ','fy',
  'tiktok','new','amazing','cool','tiktokviral','repost','follow',
  'like','share','video','watch','fypage','explore','goviral',
  'foryourpage','xyzbca','blowup','blowthisup','recommended','omg',
]);

function extractTikTokProductName(caption: string, hashtags: string[]): string {
  const specific = hashtags
    .map(h => h.replace(/^#/, ''))
    .filter(h => h.length > 3 && !GENERIC_HASHTAGS.has(h.toLowerCase()));

  if (specific.length > 0) {
    const best = specific.sort((a, b) => b.length - a.length)[0];
    return best
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // split camelCase before lowercasing
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase())
      .slice(0, 80);
  }

  const cleaned = caption
    .replace(/#\w+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.slice(0, 80) || 'TikTok trend';
}

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
          if (typeof post?.title !== 'string' || typeof post?.subreddit !== 'string') return;
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
      const amazonCategory = typeof amazon.data.category === 'string'
        ? capitalize(amazon.data.category)
        : 'General';
      amazon.data.products.forEach(p => {
        if (typeof p?.name !== 'string') return;
        signals.push({
          source:    'amazon',
          name:      p.name,
          signal:    p.signal,
          url:       p.url,
          thumbnail: p.imageUrl ?? null,
          category:  amazonCategory,
        });
      });
    }

    if (pinterest.data?.trends) {
      pinterest.data.trends.slice(0, 25).forEach(t => {
        if (!t || typeof t.keyword !== 'string' || !t.keyword) return;
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
        if (!t || typeof t.keyword !== 'string' || !t.keyword) return;
        const relatedTags = Array.isArray(t.relatedQueries)
          ? t.relatedQueries
              .map(q => typeof q === 'string' ? q : (q as { query?: string } | null)?.query)
              .filter((q): q is string => typeof q === 'string' && q.length > 0)
              .slice(0, 2)
          : [];
        signals.push({
          source: 'google',
          name:   t.keyword,
          signal: 60, // Google daily trends don't ship volume, treat as floor signal
          tags:   relatedTags,
        });
      });
    }

    if (tiktok.data?.videos) {
      const cutoffSecs = (Date.now() - NINETY_DAYS_MS) / 1000;
      tiktok.data.videos.forEach(v => {
        if (!v || typeof v.caption !== 'string') return;
        if (v.createdAt && v.createdAt < cutoffSecs) return;

        const sig = Math.min(100, Math.log10(Math.max(1, (v.plays || 0) + (v.likes || 0) * 5)) * 14);
        const hashtags = Array.isArray(v.hashtags)
          ? v.hashtags
              .map(h => {
                if (typeof h === 'string') return h;
                const obj = h as { name?: string; title?: string } | null;
                return obj?.name ?? obj?.title;
              })
              .filter((h): h is string => typeof h === 'string' && h.length > 0)
          : [];

        const name = extractTikTokProductName(v.caption, hashtags);
        const hashtagTags = hashtags
          .map(h => h.replace(/^#/, '').toLowerCase())
          .filter(h => h.length > 3 && !GENERIC_HASHTAGS.has(h))
          .slice(0, 3);

        signals.push({
          source:    'tiktok',
          name,
          signal:    sig,
          url:       v.url,
          thumbnail: v.thumbnail,
          tags:      hashtagTags.length > 0 ? hashtagTags : undefined,
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

  // Resolve images for products that have no thumbnail from any source.
  // Calls /api/image-search on the backend (requires Pexels or Unsplash key).
  const productsWithoutImages = useMemo(
    () => liveProducts.filter(p => !p.imageUrl),
    [liveProducts],
  );
  const backendUrl = storage.get('backendUrl', '');
  const imageResolutionKey = productsWithoutImages.map(p => p.id).join(',');

  const { data: resolvedImages } = useQuery<Record<string, string | null>>({
    queryKey: ['image-resolutions', backendUrl, imageResolutionKey],
    queryFn: async () => {
      if (!backendUrl || productsWithoutImages.length === 0) return {};
      const entries = await Promise.all(
        productsWithoutImages.map(p =>
          fetch(`${backendUrl}/api/image-search?q=${encodeURIComponent(p.name)}`)
            .then(r => r.json() as Promise<{ url: string | null }>)
            .then(d => [p.id, d.url] as const)
            .catch(() => [p.id, null] as const),
        ),
      );
      return Object.fromEntries(entries);
    },
    enabled: productsWithoutImages.length > 0 && !!backendUrl,
    staleTime: 60 * 60 * 1000,
  });

  const products = useMemo(() => {
    if (!resolvedImages || Object.keys(resolvedImages).length === 0) return liveProducts;
    return liveProducts.map(p =>
      p.imageUrl || !resolvedImages[p.id] ? p : { ...p, imageUrl: resolvedImages[p.id] },
    );
  }, [liveProducts, resolvedImages]);

  const recordMany = useSnapshotStore(s => s.recordMany);
  useEffect(() => {
    if (products.length > 0) recordMany(products);
  }, [products, recordMany]);

  const filtered = useMemo(() => {
    let list = products;

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
  }, [products, filters]);

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
