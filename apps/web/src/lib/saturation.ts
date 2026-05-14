import type { SaturationBreakdown } from '@/types';

export function computeSaturation(inputs: {
  storeCount?:     number; // 0-100 proxy
  adDensity?:      number; // 0-100 proxy
  sentimentScore?: number; // 0-100 (100=positive, 0=negative)
}): SaturationBreakdown {
  const storeCount     = Math.max(0, Math.min(100, inputs.storeCount     ?? 50));
  const adDensity      = Math.max(0, Math.min(100, inputs.adDensity      ?? 50));
  const sentimentScore = Math.max(0, Math.min(100, inputs.sentimentScore ?? 70));
  // Higher sentiment = lower saturation penalty
  const sentimentPenalty = 100 - sentimentScore;

  const total = Math.round(
    storeCount * 0.4 +
    adDensity  * 0.4 +
    sentimentPenalty * 0.2,
  );

  return { storeCount, adDensity, sentimentScore, total: Math.max(0, Math.min(100, total)) };
}
