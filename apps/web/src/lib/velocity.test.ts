import { describe, it, expect } from 'vitest';
import { computeVelocity } from './velocity';
import type { Snapshot } from './snapshots';

const HOUR = 60 * 60 * 1000;
const DAY  = 24 * HOUR;
const WEEK = 7 * DAY;

function snap(ts: number, viral: number): Snapshot {
  return { ts, viral, saturation: 50, rank: 5, sources: 2 };
}

describe('computeVelocity', () => {
  it('returns not-enough-data for empty array', () => {
    expect(computeVelocity([])).toMatchObject({ state: 'not-enough-data', confidence: 'low' });
  });

  it('returns not-enough-data for single snapshot', () => {
    expect(computeVelocity([snap(0, 50)])).toMatchObject({ state: 'not-enough-data' });
  });

  it('returns not-enough-data when snapshots are too close in time', () => {
    const snaps = [snap(0, 40), snap(2 * HOUR, 70)];
    expect(computeVelocity(snaps)).toMatchObject({ state: 'not-enough-data' });
  });

  it('detects accelerating trend', () => {
    const snaps = [
      snap(0, 30),
      snap(DAY, 42),
      snap(3 * DAY, 54),
      snap(WEEK, 65),
    ];
    const result = computeVelocity(snaps);
    expect(result.state).toBe('accelerating');
    expect(result.deltaPerWeek).toBeGreaterThan(0);
    expect(result.confidence).toBe('high');
  });

  it('detects decelerating trend', () => {
    const snaps = [
      snap(0, 70),
      snap(DAY, 58),
      snap(3 * DAY, 46),
      snap(WEEK, 35),
    ];
    const result = computeVelocity(snaps);
    expect(result.state).toBe('decelerating');
    expect(result.deltaPerWeek).toBeLessThan(0);
  });

  it('detects stable trend', () => {
    const snaps = [
      snap(0, 50),
      snap(2 * DAY, 51),
      snap(5 * DAY, 50),
      snap(WEEK, 52),
    ];
    const result = computeVelocity(snaps);
    expect(result.state).toBe('stable');
    expect(Math.abs(result.deltaPerWeek)).toBeLessThan(3);
  });

  it('detects spike pattern', () => {
    const snaps = [
      snap(0, 40),
      snap(2 * DAY, 42),
      snap(4 * DAY, 62),  // big jump +20
      snap(WEEK, 48),     // falls back -14
    ];
    expect(computeVelocity(snaps).state).toBe('spike');
  });

  it('detects drop pattern', () => {
    const snaps = [
      snap(0, 70),
      snap(2 * DAY, 68),
      snap(4 * DAY, 42),  // big fall -26
      snap(WEEK, 56),     // partial recovery +14
    ];
    expect(computeVelocity(snaps).state).toBe('drop');
  });

  it('returns low confidence for 2 snapshots', () => {
    const snaps = [snap(0, 40), snap(WEEK, 70)];
    expect(computeVelocity(snaps).confidence).toBe('low');
  });

  it('returns high confidence for 4+ snapshots', () => {
    const snaps = [
      snap(0, 40), snap(2 * DAY, 50), snap(4 * DAY, 60), snap(WEEK, 70),
    ];
    expect(computeVelocity(snaps).confidence).toBe('high');
  });

  it('calculates deltaPerWeek accurately for a 2-week span', () => {
    // +14 points over 2 weeks → +7 per week
    const snaps = [snap(0, 50), snap(2 * WEEK, 64)];
    const result = computeVelocity(snaps);
    expect(result.deltaPerWeek).toBeCloseTo(7, 0);
  });

  it('uses only the last 10 snapshots for calculation', () => {
    // First 5 snapshots: very fast growth (+20 pts/day ≈ 140 pts/week)
    const old = Array.from({ length: 5 }, (_, i) =>
      snap(i * DAY, 10 + i * 20),
    );
    // Last 10 snapshots: completely flat (same viral score)
    const recent = Array.from({ length: 10 }, (_, i) =>
      snap(6 * DAY + i * HOUR * 8, 70),
    );
    const result = computeVelocity([...old, ...recent]);
    // If we correctly use only last 10 (flat), deltaPerWeek ≈ 0
    expect(Math.abs(result.deltaPerWeek)).toBeLessThan(5);
  });

  it('does not classify rising-only as spike', () => {
    // Continuously rising — should not be a spike even if one step is large
    const snaps = [snap(0, 40), snap(2 * DAY, 55), snap(4 * DAY, 70), snap(WEEK, 80)];
    expect(computeVelocity(snaps).state).not.toBe('spike');
  });
});
