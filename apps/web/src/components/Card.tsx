import type { ReactNode, HTMLAttributes } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'ghost';
  interactive?: boolean;
}

export function Card({ children, variant = 'default', interactive, className, ...props }: CardProps) {
  return (
    <div
      className={[
        styles.card,
        styles[variant],
        interactive ? styles.interactive : '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
