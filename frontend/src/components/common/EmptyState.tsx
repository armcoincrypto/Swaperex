/**
 * Empty State Component
 *
 * Displays helpful messages when lists are empty.
 * Provides actionable hints for users.
 */

import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`text-center ${compact ? 'py-4' : 'py-8'}`}>
      {icon && (
        <div className={`mx-auto ${compact ? 'mb-2' : 'mb-4'} text-dark-500`}>
          {icon}
        </div>
      )}

      <h3 className={`font-medium text-dark-300 ${compact ? 'text-sm mb-1' : 'text-base mb-2'}`}>
        {title}
      </h3>

      <p className={`text-dark-500 ${compact ? 'text-xs' : 'text-sm'} max-w-xs mx-auto`}>
        {description}
      </p>

      {action && (
        <div className={compact ? 'mt-2' : 'mt-4'}>
          {action.onClick ? (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600/20 text-primary-400 rounded-lg text-sm hover:bg-primary-600/30 transition-colors"
            >
              {action.label}
            </button>
          ) : action.href ? (
            <a
              href={action.href}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600/20 text-primary-400 rounded-lg text-sm hover:bg-primary-600/30 transition-colors"
            >
              {action.label}
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Pre-defined empty states for common scenarios
export function NoPresetsEmptyState({ onCreateFirst }: { onCreateFirst?: () => void }) {
  return (
    <EmptyState
      icon={<BookmarkIcon />}
      title="No Presets Yet"
      description="Save your first preset to quickly repeat common swaps with one click."
      action={onCreateFirst ? { label: 'Save a Preset', onClick: onCreateFirst } : undefined}
      compact
    />
  );
}

export function NoHistoryEmptyState() {
  return (
    <EmptyState
      icon={<HistoryIcon />}
      title="No Swap History"
      description="Your completed swaps will appear here for easy reference and quick repeat."
      compact
    />
  );
}

export function NoFavoritesEmptyState() {
  return (
    <EmptyState
      icon={<StarIcon />}
      title="No Favorites"
      description="Star tokens you trade often to find them quickly in the selector."
      compact
    />
  );
}

export function NoRadarSignalsEmptyState() {
  return (
    <EmptyState
      icon={<RadarIcon />}
      title="No Signals Yet"
      description="Market signals and opportunities will appear here when detected."
      compact
    />
  );
}

// Icons
function BookmarkIcon() {
  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function RadarIcon() {
  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

export default EmptyState;
