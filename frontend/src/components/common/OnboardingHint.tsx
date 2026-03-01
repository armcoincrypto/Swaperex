/**
 * Onboarding Hint Component
 *
 * Shows subtle, dismissible hints to help new users discover features.
 * Uses localStorage to track which hints have been dismissed.
 */

import { useState, useEffect } from 'react';

interface OnboardingHintProps {
  id: string; // Unique ID to track dismissal
  title: string;
  description: string;
  icon?: 'tip' | 'info' | 'star' | 'bolt';
  position?: 'inline' | 'floating';
  dismissible?: boolean;
  onDismiss?: () => void;
}

const DISMISSED_HINTS_KEY = 'swaperex-dismissed-hints';

// Get dismissed hints from localStorage
function getDismissedHints(): Set<string> {
  try {
    const stored = localStorage.getItem(DISMISSED_HINTS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

// Save dismissed hint to localStorage
function dismissHint(id: string): void {
  try {
    const hints = getDismissedHints();
    hints.add(id);
    localStorage.setItem(DISMISSED_HINTS_KEY, JSON.stringify([...hints]));
  } catch {
    // Ignore localStorage errors
  }
}

export function OnboardingHint({
  id,
  title,
  description,
  icon = 'tip',
  position = 'inline',
  dismissible = true,
  onDismiss,
}: OnboardingHintProps) {
  const [isDismissed, setIsDismissed] = useState(true); // Start hidden to prevent flash

  // Check if hint was previously dismissed
  useEffect(() => {
    const dismissed = getDismissedHints();
    setIsDismissed(dismissed.has(id));
  }, [id]);

  const handleDismiss = () => {
    dismissHint(id);
    setIsDismissed(true);
    onDismiss?.();
  };

  if (isDismissed) {
    return null;
  }

  const getIcon = () => {
    switch (icon) {
      case 'tip':
        return <LightbulbIcon />;
      case 'info':
        return <InfoIcon />;
      case 'star':
        return <StarIcon />;
      case 'bolt':
        return <BoltIcon />;
    }
  };

  if (position === 'floating') {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-fade-in-up">
        <div className="bg-primary-900/90 backdrop-blur-sm border border-primary-700 rounded-xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-primary-400">
              {getIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-primary-300 text-sm mb-1">{title}</h4>
              <p className="text-xs text-primary-400/80">{description}</p>
            </div>
            {dismissible && (
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 text-primary-500 hover:text-primary-300 transition-colors"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Inline position
  return (
    <div className="bg-primary-900/20 border border-primary-800/50 rounded-lg p-3">
      <div className="flex items-start gap-2.5">
        <div className="flex-shrink-0 text-primary-400 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-primary-300 text-sm">{title}</h4>
          <p className="text-xs text-primary-400/80 mt-0.5">{description}</p>
        </div>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-primary-500 hover:text-primary-300 transition-colors"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}

// Pre-defined onboarding hints
export function PresetHint() {
  return (
    <OnboardingHint
      id="preset-intro"
      title="Save Time with Presets"
      description="Click the save icon above to create a preset from your current swap settings. Load presets instantly with one click."
      icon="tip"
    />
  );
}

export function FavoriteTokenHint() {
  return (
    <OnboardingHint
      id="favorite-tokens"
      title="Star Your Favorites"
      description="Click the star next to any token in the selector to add it to your favorites for quick access."
      icon="star"
    />
  );
}

export function IntelligenceHint() {
  return (
    <OnboardingHint
      id="intelligence-intro"
      title="Smart Swap Analysis"
      description="We automatically analyze each swap for safety, price impact, and liquidity. Look for the intelligence panel before confirming."
      icon="info"
    />
  );
}

export function GuardHint() {
  return (
    <OnboardingHint
      id="guard-intro"
      title="Protect Your Presets"
      description="Enable Smart Protection in the Advanced section when saving a preset to automatically check safety conditions."
      icon="bolt"
    />
  );
}

// Icons
function LightbulbIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default OnboardingHint;
