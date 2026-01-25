/**
 * Signal Filters Component
 *
 * User controls for filtering signals by impact, confidence, and type.
 * Collapsible panel with active filter indicator.
 *
 * Priority 10.2 - User Signal Filters
 */

import { useState } from 'react';
import {
  useSignalFilterStore,
  getFilterSummary,
} from '@/stores/signalFilterStore';

interface SignalFiltersProps {
  /** Compact mode - inline filter summary only */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function SignalFilters({ compact = false, className = '' }: SignalFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    impactFilter,
    minConfidence,
    showLiquidity,
    showRisk,
    setImpactFilter,
    setMinConfidence,
    setShowLiquidity,
    setShowRisk,
    resetFilters,
    isDefaultFilters,
  } = useSignalFilterStore();

  const isDefault = isDefaultFilters();

  // Compact mode - just show filter button with badge
  if (compact) {
    return (
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
          isDefault
            ? 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
            : 'text-primary-400 bg-primary-900/20 hover:bg-primary-900/30'
        } ${className}`}
        title="Signal Filters"
      >
        <FilterIcon />
        {!isDefault && (
          <span className="text-[10px]">
            {getFilterSummary(useSignalFilterStore.getState())}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Always-visible pill toggles */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {/* Signal Type Pills */}
        <PillToggle
          active={showLiquidity}
          onClick={() => setShowLiquidity(!showLiquidity)}
          icon="💧"
          label="Liquidity"
          activeColor="bg-blue-600"
        />
        <PillToggle
          active={showRisk}
          onClick={() => setShowRisk(!showRisk)}
          icon="⚠️"
          label="Risk"
          activeColor="bg-orange-600"
        />

        {/* Divider */}
        <span className="w-px h-5 bg-dark-700 mx-1" />

        {/* Impact Level Pills */}
        <PillToggle
          active={impactFilter === 'high'}
          onClick={() => setImpactFilter(impactFilter === 'high' ? 'all' : 'high')}
          icon="🔥"
          label="High Only"
          activeColor="bg-red-600"
        />
        <PillToggle
          active={impactFilter === 'high+medium'}
          onClick={() => setImpactFilter(impactFilter === 'high+medium' ? 'all' : 'high+medium')}
          icon="📊"
          label="High+Med"
          activeColor="bg-primary-600"
        />

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            showAdvanced ? 'text-dark-300' : 'text-dark-500 hover:text-dark-300'
          }`}
        >
          <FilterIcon />
          <span>{showAdvanced ? 'Less' : 'More'}</span>
        </button>
      </div>

      {/* Advanced Filter Panel */}
      {showAdvanced && (
        <div className="p-3 bg-dark-800 rounded-lg border border-dark-700 space-y-3">
          {/* Confidence Threshold */}
          <div>
            <label className="block text-xs font-medium text-dark-400 uppercase tracking-wider mb-2">
              Min Confidence
            </label>
            <div className="flex gap-2">
              <ConfidenceButton
                active={minConfidence === 40}
                onClick={() => setMinConfidence(40)}
                label="≥40%"
              />
              <ConfidenceButton
                active={minConfidence === 60}
                onClick={() => setMinConfidence(60)}
                label="≥60%"
              />
              <ConfidenceButton
                active={minConfidence === 80}
                onClick={() => setMinConfidence(80)}
                label="≥80%"
              />
            </div>
          </div>

          {/* Reset + Summary Row */}
          <div className="flex items-center justify-between pt-2 border-t border-dark-700">
            <div className="text-xs text-dark-500 font-mono">
              {getFilterSummary(useSignalFilterStore.getState())}
            </div>
            {!isDefault && (
              <button
                onClick={resetFilters}
                className="text-xs text-dark-400 hover:text-white transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components

function FilterIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
  );
}

function ConfidenceButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium font-mono transition-colors ${
        active
          ? 'bg-primary-600 text-white'
          : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
      }`}
    >
      {label}
    </button>
  );
}

function PillToggle({
  active,
  onClick,
  icon,
  label,
  activeColor,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        active
          ? `${activeColor} text-white shadow-sm`
          : 'bg-dark-800 text-dark-400 hover:bg-dark-700 hover:text-dark-300'
      }`}
    >
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default SignalFilters;
