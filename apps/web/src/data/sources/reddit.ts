import { useQuery } from '@tanstack/react-query';
import type { RedditPost } from '@/types';
import { redditScoreToSignal } from '@/lib/scoring';

const ECOM_SUBS = [
  'TikTokMadeMeBuyIt',
  'BuyItForLife',
  'SkinCareAddiction',
  'femalefashionadvice',
  'gadgets',
  'shutupandtakemymoney',
];

interface RedditResult {
  posts: RedditPost[];
  signalScore: number; // 0-100 average
  subreddit: string;
}

async function fetchSubreddit(sub: string, limit = 25): Promise<RedditResult> {
  const url = `https://www.reddit.com/r/${sub}/top.json?t=week&limit=${limit}&raw_json=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Reddit ${sub}: ${res.status}`);
  const json = await res.json() as { data?: { children?: { data: unknown }[] } };
  const children = json?.data?.children ?? [];

  const posts: RedditPost[] = children.map((c) => {
    const d = c.data as Record<string, unknown>;
    return {
      title:       String(d.title       ?? ''),
      score:       Number(d.score       ?? 0),
      numComments: Number(d.num_comments ?? 0),
      url:         String(d.url         ?? ''),
      permalink:   `https://reddit.com${d.permalink ?? ''}`,
      createdUtc:  Number(d.created_utc ?? 0),
      thumbnail:   typeof d.thumbnail === 'string' && d.thumbnail.startsWith('http') ? d.thumbnail : null,
      subreddit:   String(d.subreddit   ?? sub),
    };
  });

  const avg = posts.reduce((acc, p) => acc + redditScoreToSignal(p.score, p.numComments), 0) / (posts.length || 1);
  return { posts, signalScore: avg, subreddit: sub };
}

export function useRedditTrends(subs = ECOM_SUBS.slice(0, 3)) {
  return useQuery({
    queryKey: ['reddit-trends', subs],
    queryFn:  () => Promise.all(subs.map(s => fetchSubreddit(s))),
    staleTime: 10 * 60 * 1000,
  });
}

export function useRedditSubreddit(sub: string) {
  return useQuery({
    queryKey: ['reddit', sub],
    queryFn:  () => fetchSubreddit(sub),
    staleTime: 10 * 60 * 1000,
  });
}

export { ECOM_SUBS };
