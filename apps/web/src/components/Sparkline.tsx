import { useSnapshotStore } from '@/lib/snapshots';
import styles from './Sparkline.module.css';

interface SparklineProps {
  productId: string;
  metric?: 'viral' | 'saturation';
  width?:  number;
  height?: number;
}

export function Sparkline({ productId, metric = 'viral', width = 64, height = 20 }: SparklineProps) {
  const history = useSnapshotStore(s => s.byProduct[productId] ?? []);

  if (history.length < 2) {
    return <div className={styles.empty} style={{ width, height }} aria-label="Not enough history yet" />;
  }

  const values = history.map(h => h[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const first = values[0];
  const last  = values[values.length - 1];
  const direction = last > first ? 'up' : last < first ? 'down' : 'flat';
  const delta = last - first;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={styles.root}
      data-direction={direction}
      role="img"
      aria-label={`${metric} trend ${delta >= 0 ? '+' : ''}${delta}`}
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={styles.line}
      />
    </svg>
  );
}
