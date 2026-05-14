import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({ width, height, borderRadius, className }: SkeletonProps) {
  return (
    <span
      className={[styles.skeleton, className].filter(Boolean).join(' ')}
      style={{
        width:  width  !== undefined ? width  : undefined,
        height: height !== undefined ? height : undefined,
        borderRadius,
      }}
    />
  );
}
