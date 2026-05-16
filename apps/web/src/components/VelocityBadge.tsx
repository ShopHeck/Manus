import { TrendingUp, TrendingDown, Zap, ChevronDown, Minus, HelpCircle } from 'lucide-react';
import type { VelocityResult, TrendState } from '@/types';
import styles from './VelocityBadge.module.css';

interface VelocityBadgeProps {
  result: VelocityResult;
  size?: 'sm' | 'md';
  showDelta?: boolean;
}

const STATE_META: Record<TrendState, {
  label: string;
  Icon: typeof TrendingUp;
  variant: string;
}> = {
  accelerating:     { label: 'Accelerating', Icon: TrendingUp,    variant: 'accelerating' },
  decelerating:     { label: 'Decelerating', Icon: TrendingDown,  variant: 'decelerating' },
  spike:            { label: 'Spike',        Icon: Zap,           variant: 'spike' },
  drop:             { label: 'Drop',         Icon: ChevronDown,   variant: 'drop' },
  stable:           { label: 'Stable',       Icon: Minus,         variant: 'stable' },
  'not-enough-data':{ label: 'New',          Icon: HelpCircle,    variant: 'none' },
};

export function VelocityBadge({ result, size = 'sm', showDelta = false }: VelocityBadgeProps) {
  const meta = STATE_META[result.state];
  const { Icon } = meta;

  const deltaText = showDelta && result.state !== 'not-enough-data'
    ? ` ${result.deltaPerWeek > 0 ? '+' : ''}${result.deltaPerWeek}/wk`
    : '';

  return (
    <span
      className={`${styles.badge} ${styles[meta.variant]} ${styles[size]}`}
      title={`Trend velocity: ${meta.label}${deltaText}`}
    >
      <Icon size={size === 'sm' ? 10 : 12} strokeWidth={2.5} />
      <span className={styles.label}>{meta.label}{deltaText}</span>
    </span>
  );
}
