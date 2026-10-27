import type { HTMLAttributes } from 'react';

type SkeletonProps = HTMLAttributes<HTMLSpanElement>;

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return <span aria-hidden="true" className={`vc-skeleton ${className}`.trim()} {...props}/>;
}
