import type { ViralScoreBreakdown } from '@/types';

const WEIGHTS = {
  tiktok:    0.35,
  reddit:    0.20,
  pinterest: 0.20,
  google:    0.15,
  amazon:    0.10,
};

export function computeViralScore(inputs: {
  tiktok?:    number;
  reddit?:    number;
  pinterest?: number;
  google?:    number;
  amazon?:    number;
}): ViralScoreBreakdown {
  const tiktok    = clamp(inputs.tiktok    ?? 0);
  const reddit    = clamp(inputs.reddit    ?? 0);
  const pinterest = clamp(inputs.pinterest ?? 0);
  const google    = clamp(inputs.google    ?? 0);
  const amazon    = clamp(inputs.amazon    ?? 0);

  const total =
    tiktok    * WEIGHTS.tiktok    +
    reddit    * WEIGHTS.reddit    +
    pinterest * WEIGHTS.pinterest +
    google    * WEIGHTS.google    +
    amazon    * WEIGHTS.amazon;

  return { tiktok, reddit, pinterest, google, amazon, total: clamp(total) };
}

function clamp(v: number) { return Math.max(0, Math.min(100, v)); }

export function redditScoreToSignal(score: number, numComments: number): number {
  const engagement = Math.log10(Math.max(1, score + numComments * 2));
  return Math.min(100, engagement * 20);
}

export function amazonRankToSignal(rank: number, maxRank = 20): number {
  if (rank <= 0) return 0;
  return Math.max(0, 100 - ((rank - 1) / maxRank) * 100);
}
