/**
 * Screener Filters Panel (Advanced mode)
 *
 * Collapsible panel with search, volume, change range, safety toggles.
 */

import { useState } from 'react';
import type { ScreenerFilters } from '@/services/screener/types';

const VOLUME_OPTIONS = [
  { label: 'Any', value: 0 },
  { label: '$100K+', value: 100_000 },
  { label: '$1M+', value: 1_000_000 },
  { label: '$10M+', value: 10_000_000 },
  { label: '$50M+', value: 50_000_000 },
  { label: '$100M+', value: 100_000_000 },
];

interface Props {
  filters: ScreenerFilters;
  onChange: (patch: Partial<ScreenerFilters>) => void;
  onReset: () => void;
  tokenCount: number;
  totalCount: number;
}

export function ScreenerFilters({ filters, onChange, onReset, tokenCount, totalCount }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const hasActiveFilters =
    filters.search !== '' ||
    filters.minVolume > 0 ||
    filters.changeMin > -100 ||
    filters.changeMax < 1000 ||
    filters.priceMin > 0 ||
    filters.priceMax > 0 ||
    filters.hideStablecoins ||
    filters.hideWrapped ||
    filters.onlySafe;

  return (
    <div className="bg-dark-900 rounded-xl border border-dark-800 mb-4">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-dark-300 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          Filters
          {hasActiveFilters && (
            <span className="bg-primary-600 text-white text-xs px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
          <span className="text-dark-500">
            {tokenCount} / {totalCount} tokens
          </span>
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3 border-t border-dark-800">
          {/* Row 1: Search + Volume */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            {/* Search */}
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Search</label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => onChange({ search: e.target.value })}
                placeholder="Symbol, name, or address..."
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Min Volume */}
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Min 24h Volume</label>
              <select
                value={filters.minVolume}
                onChange={(e) => onChange({ minVolume: Number(e.target.value) })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              >
                {VOLUME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Change range + Price range */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">24h Min %</label>
              <input
                type="number"
                value={filters.changeMin}
                onChange={(e) => onChange({ changeMin: Number(e.target.value) })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">24h Max %</label>
              <input
                type="number"
                value={filters.changeMax}
                onChange={(e) => onChange({ changeMax: Number(e.target.value) })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Price Min</label>
              <input
                type="number"
                value={filters.priceMin || ''}
                onChange={(e) => onChange({ priceMin: Number(e.target.value) || 0 })}
                placeholder="Any"
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Price Max</label>
              <input
                type="number"
                value={filters.priceMax || ''}
                onChange={(e) => onChange({ priceMax: Number(e.target.value) || 0 })}
                placeholder="Any"
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Row 3: Toggles */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <Toggle
              label="Hide Stablecoins"
              checked={filters.hideStablecoins}
              onChange={(v) => onChange({ hideStablecoins: v })}
            />
            <Toggle
              label="Hide Wrapped"
              checked={filters.hideWrapped}
              onChange={(v) => onChange({ hideWrapped: v })}
            />
            <Toggle
              label="Only Safe"
              checked={filters.onlySafe}
              onChange={(v) => onChange({ onlySafe: v })}
            />

            {hasActiveFilters && (
              <button
                onClick={onReset}
                className="text-xs text-dark-400 hover:text-white underline ml-auto"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer select-none">
      <div
        className={`w-8 h-4 rounded-full transition-colors relative ${
          checked ? 'bg-primary-600' : 'bg-dark-700'
        }`}
        onClick={() => onChange(!checked)}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
      {label}
    </label>
  );
}

export default ScreenerFilters;
