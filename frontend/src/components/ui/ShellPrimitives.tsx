/**
 * Shell primitives — shared electro/glass chrome aligned with SwapInterface.
 * Presentation-only; safe for Send, Portfolio, and sidebar surfaces.
 */

import type { ReactNode } from 'react';
import clsx from 'clsx';

/** Outer page card — matches Swap / Send primary shell. */
export interface ShellCardProps {
  children: ReactNode;
  className?: string;
  /** `swap` matches SwapInterface max-width; `send` is narrower; `content` is portfolio-width. */
  width?: 'swap' | 'send' | 'content' | 'full';
  padding?: 'sm' | 'md' | 'lg';
}

const widthClasses: Record<NonNullable<ShellCardProps['width']>, string> = {
  swap: 'w-full max-w-md lg:max-w-xl 2xl:max-w-2xl mx-auto',
  send: 'w-full max-w-md mx-auto',
  content: 'w-full max-w-2xl mx-auto',
  full: 'w-full',
};

const paddingClasses: Record<NonNullable<ShellCardProps['padding']>, string> = {
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export function ShellCard({
  children,
  className = '',
  width = 'send',
  padding = 'md',
}: ShellCardProps) {
  return (
    <div
      className={clsx(
        widthClasses[width],
        paddingClasses[padding],
        'relative overflow-x-hidden overflow-y-visible min-w-0',
        'bg-electro-panel/90 backdrop-blur-glass rounded-2xl',
        'border border-white/[0.1] shadow-[0_20px_60px_rgba(0,0,0,0.45)]',
        className,
      )}
    >
      <div className="absolute inset-0 bg-glass-gradient pointer-events-none" aria-hidden />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Inset field panel — swap token rows, send amount/asset blocks. */
export interface ShellSectionProps {
  children: ReactNode;
  className?: string;
  error?: boolean;
}

export function ShellSection({ children, className = '', error = false }: ShellSectionProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border p-4',
        'bg-electro-panel/80 border-white/[0.06]',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        error && 'border-red-500/40 ring-1 ring-red-500/20',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Compact inset panel for lists, tables, sidebar blocks. */
export function ShellPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-white/[0.08] bg-electro-panel/50 backdrop-blur-sm',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export type ShellBannerTone = 'success' | 'warning' | 'error' | 'info';

const bannerToneClasses: Record<ShellBannerTone, string> = {
  success: 'bg-accent/10 border-accent/25 text-accent',
  warning: 'bg-yellow-900/20 border-yellow-800/40 text-yellow-400',
  error: 'bg-red-900/20 border-red-800/40 text-red-400',
  info: 'bg-electro-panel/60 border-white/[0.08] text-dark-200',
};

export function ShellBanner({
  children,
  tone = 'info',
  className = '',
  action,
}: {
  children: ReactNode;
  tone?: ShellBannerTone;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border p-3 text-sm flex items-center justify-between gap-3',
        bannerToneClasses[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ShellEmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <ShellPanel className={clsx('p-8 text-center', className)}>
      {icon ? <div className="mb-3 flex justify-center text-dark-500">{icon}</div> : null}
      <p className="text-dark-300 text-sm font-medium">{title}</p>
      {description ? <p className="text-dark-500 text-xs mt-1.5 max-w-sm mx-auto">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </ShellPanel>
  );
}

export function ShellLoadingRows({
  count = 3,
  rowClassName = 'h-16 rounded-xl',
  className = '',
}: {
  count?: number;
  rowClassName?: string;
  className?: string;
}) {
  return (
    <div className={clsx('animate-pulse space-y-2', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={clsx(rowClassName, 'bg-electro-panel/40 border border-white/[0.04]')}
        />
      ))}
    </div>
  );
}

export function ShellAutoUpdateFooter({
  intervalSeconds,
  className = '',
}: {
  intervalSeconds: number;
  className?: string;
}) {
  return (
    <p className={clsx('text-center text-[11px] leading-snug text-dark-500/90', className)}>
      Balances refresh every {intervalSeconds} seconds.
    </p>
  );
}

export function ShellChipButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'px-2 py-1 text-xs rounded-lg transition-colors',
        'bg-electro-panel/70 border border-white/[0.06]',
        'text-dark-300 hover:text-white hover:bg-electro-panelHover hover:border-white/[0.1]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}
