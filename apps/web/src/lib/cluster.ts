import type { SourceBadge, TrendProduct } from '@/types';
import { computeViralScore } from './scoring';
import { computeSaturation } from './saturation';
import { defaultMarginInputs } from './margin';

const STOPWORDS = new Set([
  'the','a','an','and','or','of','for','to','in','on','with','my','our','your',
  'is','was','this','that','these','those','viral','tiktok','new','best','from',
]);

export interface SourceSignal {
  source: SourceBadge['id'];
  name: string;
  signal: number;
  url?: string;
  thumbnail?: string | null;
  tags?: string[];
  category?: string;
  firstSeen?: string;
}

export interface Cluster {
  key: string;
  canonicalName: string;
  signals: SourceSignal[];
}

export function normalize(name: string | undefined | null): string[] {
  if (typeof name !== 'string' || !name) return [];
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function clusterSignals(signals: SourceSignal[], threshold = 0.4): Cluster[] {
  const tokens = signals.map(s => new Set(normalize(s.name)));
  const clusters: Cluster[] = [];
  const assigned = new Array(signals.length).fill(-1);

  for (let i = 0; i < signals.length; i++) {
    if (assigned[i] !== -1) continue;
    if (tokens[i].size === 0) continue;
    const cIdx = clusters.length;
    assigned[i] = cIdx;
    clusters.push({
      key: `cluster-${cIdx}`,
      canonicalName: signals[i].name,
      signals: [signals[i]],
    });

    for (let j = i + 1; j < signals.length; j++) {
      if (assigned[j] !== -1) continue;
      if (jaccard(tokens[i], tokens[j]) >= threshold) {
        assigned[j] = cIdx;
        clusters[cIdx].signals.push(signals[j]);
        if (signals[j].name.length < clusters[cIdx].canonicalName.length) {
          clusters[cIdx].canonicalName = signals[j].name;
        }
      }
    }
  }

  return clusters;
}

const SOURCE_LABEL: Record<SourceBadge['id'], string> = {
  reddit: 'R', tiktok: 'TT', pinterest: 'P', google: 'G', amazon: 'A',
};

export function clusterToProduct(cluster: Cluster, rank: number): TrendProduct {
  const bySource: Record<string, number> = {};
  for (const sig of cluster.signals) {
    bySource[sig.source] = Math.max(bySource[sig.source] ?? 0, sig.signal);
  }

  const sources: SourceBadge[] = Object.keys(bySource)
    .sort()
    .map(id => ({ id: id as SourceBadge['id'], label: SOURCE_LABEL[id as SourceBadge['id']] }));

  const viralScore = computeViralScore(bySource);

  // Saturation proxy: more sources = more market presence = higher saturation
  const storeCount = Math.min(100, sources.length * 22 + 10);
  const adDensity  = Math.min(100, (bySource.amazon ?? 0) * 0.8 + (bySource.google ?? 0) * 0.6);
  const saturation = computeSaturation({
    storeCount,
    adDensity,
    sentimentScore: 70,
  });

  const firstSeen = cluster.signals
    .map(s => s.firstSeen)
    .filter((d): d is string => Boolean(d))
    .sort()[0] ?? new Date().toISOString().slice(0, 10);

  const category = cluster.signals.find(s => s.category)?.category ?? 'General';

  const tags = Array.from(new Set(
    cluster.signals.flatMap(s => s.tags ?? []).map(t => t.toLowerCase())
  )).slice(0, 5);

  const urls: TrendProduct['urls'] = {};
  for (const s of cluster.signals) {
    if (s.url && !urls[s.source]) urls[s.source] = s.url;
  }

  const thumbnail = cluster.signals.find(s => s.thumbnail)?.thumbnail ?? null;

  return {
    id:         `cluster-${cluster.canonicalName.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`,
    name:       cluster.canonicalName.slice(0, 80),
    category,
    imageUrl:   thumbnail,
    tags,
    sources,
    viralScore,
    saturation,
    margin:     defaultMarginInputs(category.toLowerCase(), 29.99),
    rank,
    rankDelta:  0,
    firstSeen,
    urls,
  };
}
