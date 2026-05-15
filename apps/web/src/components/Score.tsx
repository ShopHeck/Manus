import styles from './Score.module.css';

interface ScoreProps {
  value: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showRing?: boolean;
}

function scoreColor(v: number) {
  if (v >= 70) return 'var(--success)';
  if (v >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

export function Score({ value, size = 'md', label, showRing = true }: ScoreProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = scoreColor(clamped);
  const sizes = { sm: 40, md: 56, lg: 72 };
  const r = { sm: 14, md: 20, lg: 26 };
  const stroke = { sm: 3, md: 4, lg: 5 };
  const dim = sizes[size];
  const radius = r[size];
  const sw = stroke[size];
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={`${styles.root} ${styles[size]}`}
      style={showRing ? { width: dim, height: dim } : undefined}
      title={label}
    >
      {showRing && (
        <svg
          width={dim}
          height={dim}
          viewBox={`0 0 ${dim} ${dim}`}
          className={styles.ring}
        >
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={sw}
          />
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
            style={{ transition: `stroke-dashoffset ${500}ms var(--ease-out-expo)` }}
          />
        </svg>
      )}
      <span className={styles.value} style={{ color }}>
        {Math.round(clamped)}
      </span>
    </div>
  );
}
