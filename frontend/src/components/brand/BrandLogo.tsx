/**
 * P20 — Canonical Swaperex brand mark + lockup.
 * One component for header, footer, and passive chrome.
 */

import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { BRAND } from '@/constants/brand';
import { pageToPath } from '@/config/appRoutes';

export type BrandLogoVariant = 'full' | 'compact';

export interface BrandLogoProps {
  variant?: BrandLogoVariant;
  showParentBrand?: boolean;
  /** When set, renders as a button that calls onNavigate (SPA shell). */
  onNavigateHome?: () => void;
  /** Override link target; defaults to Trade home. */
  href?: string;
  className?: string;
}

/** Minimal geometric S-mark — financial, not playful. */
export function SwaperexMark({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('shrink-0', className)}
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <path
        d="M22.5 11.2c-.9-1.7-2.7-2.7-5-2.7h-4.1c-2.4 0-4.2 1.5-4.2 3.5 0 2.1 1.5 3.1 4.5 3.6l3.2.6c1.8.3 2.6.8 2.6 1.8 0 1.2-1.1 2-3 2H12.2c-1.7 0-2.9-.6-3.5-1.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 20.8c.9 1.7 2.7 2.7 5 2.7h4.1c2.4 0 4.2-1.5 4.2-3.5 0-2.1-1.5-3.1-4.5-3.6l-3.2-.6c-1.8-.3-2.6-.8-2.6-1.8 0-1.2 1.1-2 3-2h4.3c1.7 0 2.9.6 3.5 1.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

export function BrandLogo({
  variant = 'full',
  showParentBrand = true,
  onNavigateHome,
  href,
  className,
}: BrandLogoProps) {
  const compact = variant === 'compact';
  const to = href ?? pageToPath('swap');

  const content = (
    <>
      <SwaperexMark className={clsx('text-accent', compact ? 'w-7 h-7' : 'w-8 h-8')} />
      <span className="flex flex-col leading-tight min-w-0 text-left">
        <span
          className={clsx(
            'font-bold text-accent tracking-tight',
            compact ? 'text-base sm:text-lg' : 'text-lg sm:text-xl',
          )}
        >
          {BRAND.displayName}
        </span>
        {showParentBrand && !compact && (
          <span className="text-[10px] font-medium text-dark-500 tracking-wide">{BRAND.byline}</span>
        )}
        {showParentBrand && compact && (
          <span className="hidden sm:inline text-[10px] font-medium text-dark-500 tracking-wide">
            {BRAND.byline}
          </span>
        )}
      </span>
    </>
  );

  const sharedClass = clsx(
    'inline-flex items-center gap-2 no-underline hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900 rounded-lg',
    className,
  );

  if (onNavigateHome) {
    return (
      <button
        type="button"
        onClick={onNavigateHome}
        className={sharedClass}
        aria-label="Swaperex home"
      >
        {content}
      </button>
    );
  }

  return (
    <Link to={to} className={sharedClass} aria-label="Swaperex home">
      {content}
    </Link>
  );
}

export default BrandLogo;
