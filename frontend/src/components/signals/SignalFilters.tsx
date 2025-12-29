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
  const [isOpen, setIsOpen] = useState(false);

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
    getActiveFilterCount,
  } = useSignalFilterStore();

  const activeCount = getActiveFilterCount();
  const isDefault = isDefaultFilters();

  // Compact mode - just show filter button with badge
  if (compact) {
    return (
      <button
        onClick={() => setIsOpen(!isOpen)}
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
      {/* Filter Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isOpen
            ? 'bg-dark-700 text-white'
            : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
        }`}
      >
        <div className="flex items-center gap-2">
          <FilterIcon />
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 bg-primary-600 text-white text-[10px] rounded-full">
              {activeCount}
            </span>
          )}
        </div>
        <span className="text-dark-500 text-xs">
          {isOpen ? '▼' : '▶'}
        </span>
      </button>

      {/* Filter Panel */}
      {isOpen && (
        <div className="mt-2 p-4 bg-dark-800 rounded-lg border border-dark-700 space-y-4">
          {/* Impact Filter */}
          <div>
            <label className="block text-xs font-medium text-dark-400 uppercase tracking-wider mb-2">
              Impact Level
            </label>
            <div className="flex gap-2">
              <ImpactButton
                active={impactFilter === 'high'}
                onClick={() => setImpactFilter('high')}
                icon="🔥"
                label="High"
              />
              <ImpactButton
                active={impactFilter === 'high+medium'}
                onClick={() => setImpactFilter('high+medium')}
                icon="🔥⚠️"
                label="High+Med"
              />
              <ImpactButton
                active={impactFilter === 'all'}
                onClick={() => setImpactFilter('all')}
                icon="📊"
                label="All"
              />
            </div>
          </div>

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

          {/* Signal Type Toggles */}
          <div>
            <label className="block text-xs font-medium text-dark-400 uppercase tracking-wider mb-2">
              Signal Types
            </label>
            <div className="flex gap-3">
              <TypeToggle
                checked={showLiquidity}
                onChange={setShowLiquidity}
                label="Liquidity"
                color="blue"
              />
              <TypeToggle
                checked={showRisk}
                onChange={setShowRisk}
                label="Risk"
                color="orange"
              />
            </div>
          </div>

          {/* Reset Button */}
          {!isDefault && (
            <button
              onClick={resetFilters}
              className="w-full py-2 text-sm text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
            >
              Reset to defaults
            </button>
          )}

          {/* Active Summary */}
          <div className="pt-2 border-t border-dark-700">
            <div className="text-xs text-dark-500 font-mono">
              Active: {getFilterSummary(useSignalFilterStore.getState())}
            </div>
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

function ImpactButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
        active
          ? 'bg-primary-600 text-white'
          : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
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

function TypeToggle({
  checked,
  onChange,
  label,
  color,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  color: 'blue' | 'orange';
}) {
  const colorClasses = {
    blue: checked ? 'bg-blue-600 border-blue-500' : 'bg-dark-700 border-dark-600',
    orange: checked ? 'bg-orange-600 border-orange-500' : 'bg-dark-700 border-dark-600',
  };

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${colorClasses[color]}`}
        onClick={() => onChange(!checked)}
      >
        {checked && (
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
      <span className={`text-sm ${checked ? 'text-white' : 'text-dark-400'}`}>
        {label}
      </span>
    </label>
  );
}

export default SignalFilters;
