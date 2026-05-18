/**
 * Lightweight pulse placeholder — fixed dimensions to limit layout shift.
 * Tailwind only; no external dependencies.
 */

import clsx from 'clsx';

export interface InlineSkeletonProps {
  className?: string;
  /** Shorthand for h-* w-* when not using className */
  width?: string;
  height?: string;
}

export function InlineSkeleton({ className, width, height }: InlineSkeletonProps) {
  return (
    <span
      className={clsx(
        'inline-block rounded-md bg-white/[0.08] animate-pulse',
        width,
        height,
        className,
      )}
      aria-hidden
    />
  );
}

export default InlineSkeleton;
