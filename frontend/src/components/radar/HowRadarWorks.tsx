/**
 * How Radar Works Component
 *
 * Compact collapsible guide explaining the three main Radar features.
 * Collapsed by default, state persisted in localStorage.
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'radar-guide-collapsed';

interface HowRadarWorksProps {
  className?: string;
}

export function HowRadarWorks({ className = '' }: HowRadarWorksProps) {
  const [collapsed, setCollapsed] = useState(true);

  // Load collapsed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === 'true');
    }
  }, []);

  const toggle = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem(STORAGE_KEY, String(newState));
  };

  return (
    <div className={`bg-dark-800/40 border border-dark-700/30 rounded-lg ${className}`}>
      {/* Header - always visible */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-dark-700/20 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📖</span>
          <span className="text-xs font-medium text-dark-300">How Radar works</span>
        </div>
        <span className="text-dark-500 text-[10px]">
          {collapsed ? '▶' : '▼'}
        </span>
      </button>

      {/* Content - collapsible */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          {/* Watchlist */}
          <div className="flex items-start gap-2">
            <span className="text-sm">⭐</span>
            <div className="text-[11px] text-dark-400">
              <span className="text-dark-300 font-medium">Watchlist</span>
              {' '}— tokens you're monitoring. We check them every 60s for risk/liquidity changes.
            </div>
          </div>

          {/* Wallet Scan */}
          <div className="flex items-start gap-2">
            <span className="text-sm">🔎</span>
            <div className="text-[11px] text-dark-400">
              <span className="text-dark-300 font-medium">Wallet Scan</span>
              {' '}— discovers tokens in any wallet. Add interesting ones to your Watchlist.
            </div>
          </div>

          {/* Token Check */}
          <div className="flex items-start gap-2">
            <span className="text-sm">🔍</span>
            <div className="text-[11px] text-dark-400">
              <span className="text-dark-300 font-medium">Token Check</span>
              {' '}— one-time scan of any token address. Great for quick due diligence.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HowRadarWorks;
