import { useMemo } from 'react';
import { useRedditTrends } from '@/data/sources/reddit';
import { useAmazonMovers } from '@/data/sources/amazon';
import { usePinterestTrends } from '@/data/sources/pinterest';
import { SAMPLE_PRODUCTS } from '@/data/sample';
import type { TrendProduct, DiscoverFilters, RedditPost } from '@/types';
import { computeViralScore } from '@/lib/scoring';
import { computeSaturation } from '@/lib/saturation';
import { defaultMarginInputs } from '@/lib/margin';

function postToProduct(post: RedditPost, index: number): TrendProduct {
  const signal = Math.min(100, Math.log10(Math.max(1, post.score + post.numComments * 2)) * 20);
  return {
    id:         `reddit-${post.subreddit}-${index}`,
    name:       post.title.slice(0, 80),
    category:   inferCategory(post.subreddit),
    imageUrl:   post.thumbnail,
    tags:       [post.subreddit.toLowerCase()],
    sources:    [{ id: 'reddit', label: 'R' }],
    viralScore: computeViralScore({ reddit: signal }),
    saturation: computeSaturation({ storeCount: 50, adDensity: 40, sentimentScore: 75 }),
    margin:     defaultMarginInputs('default', 29.99),
    rank:       index + 1,
    rankDelta:  0,
    firstSeen:  new Date(post.createdUtc * 1000).toISOString().slice(0, 10),
    urls:       { reddit: post.permalink },
  };
}

function inferCategory(subreddit: string): string {
  const map: Record<string, string> = {
    skinCareAddiction:    'Beauty',
    tikhtokmademebuyon:   'General',
    tiktokmademebuyon:    'General',
    tiktokmademebyit:     'General',
    tiktokmadem:          'General',
    femalefashionadvice:  'Fashion',
    malefashionadvice:    'Fashion',
    gadgets:              'Electronics',
    shutupandtakemymoney: 'General',
    buyitforlife:         'General',
  };
  const lower = subreddit.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (lower.includes(k.toLowerCase())) return v;
  }
  return 'General';
}

export function useDiscoverData(filters: DiscoverFilters) {
  const reddit  = useRedditTrends();
  const amazon  = useAmazonMovers();
  const pinterest = usePinterestTrends();

  const liveProducts = useMemo(() => {
    const products: TrendProduct[] = [];

    if (reddit.data) {
      reddit.data.forEach(result => {
        result.posts.slice(0, 5).forEach((post, i) => {
          products.push(postToProduct(post, i));
        });
      });
    }

    // Merge with sample data to always show something
    const allProducts = products.length >= 6
      ? products
      : [...SAMPLE_PRODUCTS, ...products];

    return allProducts;
  }, [reddit.data]);

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
      reddit:    { ok: !reddit.isError,    loading: reddit.isLoading    },
      amazon:    { ok: !amazon.isError,    loading: amazon.isLoading    },
      pinterest: { ok: !pinterest.isError, loading: pinterest.isLoading },
    },
  };
}
