/**
 * Radar Intro Card
 *
 * First-visit education card explaining what Radar does.
 * Shows once per browser, dismissible forever.
 */

import { useState, useEffect } from 'react';
import { isRadarIntroDismissed, dismissRadarIntro } from '@/utils/onboarding';

interface RadarIntroCardProps {
  className?: string;
}

export function RadarIntroCard({ className = '' }: RadarIntroCardProps) {
  const [dismissed, setDismissed] = useState(true); // Default to dismissed to prevent flash

  // Check localStorage on mount
  useEffect(() => {
    setDismissed(isRadarIntroDismissed());
  }, []);

  const handleDismiss = () => {
    dismissRadarIntro();
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  return (
    <div className={`bg-dark-800 border border-dark-600 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🛡</span>
        <h3 className="text-base font-semibold text-dark-100">
          Radar — Token Safety Monitor
        </h3>
      </div>

      {/* Description */}
      <p className="text-sm text-dark-300 mb-3">
        Radar checks tokens you interact with for contract risks and liquidity problems.
        It does <span className="text-dark-200 font-medium">not</span> track price or profits.
      </p>

      {/* Bullets */}
      <ul className="text-sm text-dark-400 space-y-1.5 mb-4">
        <li className="flex items-start gap-2">
          <span className="text-dark-500 mt-0.5">•</span>
          <span>Check any token manually using the input above</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-dark-500 mt-0.5">•</span>
          <span>Add tokens to Watchlist for auto-monitoring</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-dark-500 mt-0.5">•</span>
          <span>Review safety signals in Signal History (last 24h)</span>
        </li>
      </ul>

      {/* Dismiss Button */}
      <button
        onClick={handleDismiss}
        className="w-full py-2 px-4 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Got it
      </button>
    </div>
  );
}

export default RadarIntroCard;
