/**
 * P20 — Progressive disclosure wrapper for secondary homepage sections.
 */

import type { ReactNode } from 'react';

interface MobileCollapsibleSectionProps {
  title: string;
  summary?: string;
  children: ReactNode;
  /** When true, open by default on desktop-sized content; mobile still starts collapsed unless defaultOpen. */
  defaultOpen?: boolean;
  className?: string;
  headingId?: string;
}

export function MobileCollapsibleSection({
  title,
  summary,
  children,
  defaultOpen = false,
  className = '',
  headingId,
}: MobileCollapsibleSectionProps) {
  return (
    <details
      className={`group mt-6 sm:mt-8 rounded-xl border border-white/[0.06] bg-white/[0.02] open:bg-white/[0.03] ${className}`}
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary
        className="cursor-pointer list-none px-4 py-3 flex items-start justify-between gap-3 min-h-[44px] select-none [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0">
          <span
            id={headingId}
            className="block text-sm font-semibold text-dark-200"
          >
            {title}
          </span>
          {summary ? (
            <span className="block text-xs text-dark-500 mt-0.5 leading-snug">{summary}</span>
          ) : null}
        </span>
        <span
          className="shrink-0 text-dark-500 text-xs mt-1 group-open:rotate-180 transition-transform"
          aria-hidden
        >
          ▼
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-white/[0.04]">{children}</div>
    </details>
  );
}

export default MobileCollapsibleSection;
