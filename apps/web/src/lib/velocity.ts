import type { Snapshot } from './snapshots';
import type { TrendState, VelocityResult } from '@/types';

export type { TrendState, VelocityResult };

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MIN_SPAN_MS = 6 * 60 * 60 * 1000;   // oldest-to-newest gap must exceed 6 h
const SPIKE_RISE  = 15;                    // Δ points to qualify as spike onset
const SPIKE_FALL  = 10;                    // Δ points fall-back to confirm spike/drop
const STABLE_BAND = 3;                     // |Δ/week| within ±3 → stable

export function computeVelocity(snapshots: Snapshot[]): VelocityResult {
  if (!snapshots || snapshots.length < 2) {
    return { deltaPerWeek: 0, state: 'not-enough-data', confidence: 'low' };
  }

  const recent = snapshots.slice(-10);
  const oldest = recent[0];
  const newest = recent[recent.length - 1];
  const spanMs = newest.ts - oldest.ts;

  if (spanMs < MIN_SPAN_MS) {
    return { deltaPerWeek: 0, state: 'not-enough-data', confidence: 'low' };
  }

  const deltaScore   = newest.viral - oldest.viral;
  const deltaPerWeek = Math.round((deltaScore / spanMs) * MS_PER_WEEK * 10) / 10;
  const confidence   = recent.length >= 4 ? 'high' : 'low';
  const state        = classifyState(recent, deltaPerWeek);

  return { deltaPerWeek, state, confidence };
}

function classifyState(snapshots: Snapshot[], deltaPerWeek: number): TrendState {
  if (snapshots.length >= 3) {
    const n    = snapshots.length;
    const prev = snapshots[n - 3].viral;
    const mid  = snapshots[n - 2].viral;
    const curr = snapshots[n - 1].viral;

    // Spike: jumped up significantly then fell back
    if (mid - prev >= SPIKE_RISE && mid - curr >= SPIKE_FALL) return 'spike';
    // Drop: fell significantly then partially recovered
    if (prev - mid >= SPIKE_RISE && curr - mid >= SPIKE_FALL) return 'drop';
  }

  if (Math.abs(deltaPerWeek) < STABLE_BAND) return 'stable';
  return deltaPerWeek > 0 ? 'accelerating' : 'decelerating';
}
