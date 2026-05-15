import { useQuery } from '@tanstack/react-query';
import { storage } from '@/lib/storage';

export interface TikTokVideo {
  id:        string;
  caption:   string;
  plays:     number;
  likes:     number;
  shares:    number;
  comments:  number;
  hashtags:  string[];
  url:       string;
  thumbnail: string | null;
  author:    string;
  createdAt: number;
}

export interface TikTokResult {
  keyword: string;
  videos:  TikTokVideo[];
  signalScore: number; // 0–100
}

function tiktokSignal(v: { plays: number; likes: number }): number {
  // Plays carry the most weight, likes for engagement quality.
  const score = Math.log10(Math.max(1, v.plays + v.likes * 5));
  return Math.min(100, score * 14);
}

async function fetchTikTokTrends(keyword: string): Promise<TikTokResult> {
  const backendUrl = storage.get('backendUrl', '');
  const apifyKey   = storage.get('apifyApiKey', '');
  if (!backendUrl || !apifyKey) {
    return { keyword, videos: [], signalScore: 0 };
  }

  const res = await fetch(`${backendUrl}/api/tiktok-trends?keyword=${encodeURIComponent(keyword)}`, {
    headers: { 'x-apify-token': apifyKey },
  });
  if (!res.ok) throw new Error(`TikTok trends: ${res.status}`);
  const json = await res.json() as { videos?: TikTokVideo[] };
  const videos = json.videos ?? [];
  const avg = videos.reduce((a, v) => a + tiktokSignal(v), 0) / (videos.length || 1);
  return { keyword, videos, signalScore: Math.min(100, avg) };
}

export function useTikTokTrends(keyword = 'tiktokmademebuyit') {
  const hasKey  = !!storage.get('apifyApiKey', '');
  const hasBack = !!storage.get('backendUrl', '');
  return useQuery({
    queryKey: ['tiktok-trends', keyword],
    queryFn:  () => fetchTikTokTrends(keyword),
    staleTime: 30 * 60 * 1000,
    enabled:   hasKey && hasBack,
    retry:     1,
  });
}
