/**
 * Preset Dropdown Component
 *
 * Shows saved swap presets for quick loading.
 * Clicking a preset prefills the swap form.
 */

import { useState, useRef, useEffect } from 'react';
import { usePresetStore, type SwapPreset } from '@/stores/presetStore';
import { useWalletStore } from '@/stores/walletStore';

interface PresetDropdownProps {
  onSelectPreset: (preset: SwapPreset) => void;
  onDeletePreset?: (id: string) => void;
}

// Format timestamp to relative time (e.g., "2h ago", "3d ago")
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function PresetDropdown({ onSelectPreset, onDeletePreset }: PresetDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { address, chainId } = useWalletStore();
  const { getPresetsForWallet, removePreset, toggleSkipConfirmation } = usePresetStore();

  const presets = address && chainId ? getPresetsForWallet(chainId, address) : [];

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (presets.length === 0) {
    return null;
  }

  const handleSelect = (preset: SwapPreset) => {
    onSelectPreset(preset);
    setIsOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removePreset(id);
    onDeletePreset?.(id);
  };

  const handleToggleSkip = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    toggleSkipConfirmation(id);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-electro-panel/80 hover:bg-electro-panelHover rounded-lg text-sm transition-all duration-200 border border-white/[0.06] hover:border-white/[0.1]"
        title="Load saved preset"
      >
        <BookmarkIcon />
        <span className="text-gray-400">Presets</span>
        <span className="bg-accent/15 text-accent text-xs px-1.5 py-0.5 rounded font-medium">
          {presets.length}
        </span>
        <ChevronIcon isOpen={isOpen} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-electro-panel/95 backdrop-blur-glass rounded-glass shadow-glass border border-white/[0.08] py-2 z-50 max-h-80 overflow-y-auto">
          <div className="px-3 pb-2 mb-2 border-b border-white/[0.06]">
            <span className="text-xs text-gray-500">Saved Presets</span>
          </div>

          {presets.map((preset) => (
            <div
              key={preset.id}
              className="px-3 py-2.5 hover:bg-electro-panelHover cursor-pointer transition-all duration-200"
              onClick={() => handleSelect(preset)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{preset.name}</span>
                  {preset.guards?.enabled && (
                    <span
                      className={preset.guards.mode === 'hard' ? 'text-red-400' : 'text-primary-400'}
                      title={preset.guards.mode === 'hard' ? 'Hard protection enabled' : 'Soft protection enabled'}
                    >
                      <ShieldIcon />
                    </span>
                  )}
                  {preset.skipConfirmation && (
                    <span
                      className="text-yellow-400"
                      title="Skip confirmation enabled"
                    >
                      <BoltIcon />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Toggle Skip Confirmation */}
                  <button
                    onClick={(e) => handleToggleSkip(e, preset.id)}
                    className={`p-1 rounded transition-colors ${
                      preset.skipConfirmation
                        ? 'text-yellow-400 hover:text-yellow-300'
                        : 'text-dark-500 hover:text-yellow-400'
                    }`}
                    title={preset.skipConfirmation ? 'Disable instant swap' : 'Enable instant swap (skip confirmation)'}
                  >
                    <BoltIcon />
                  </button>
                  {/* Delete Button */}
                  <button
                    onClick={(e) => handleDelete(e, preset.id)}
                    className="p-1 text-dark-500 hover:text-red-400 transition-colors"
                    title="Delete preset"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              {/* Swap Details */}
              <div className="flex items-center gap-2 text-xs text-dark-400 mb-1">
                <span className="text-primary-400">{preset.fromAmount}</span>
                <span>{preset.fromAsset.symbol}</span>
                <ArrowIcon />
                <span>{preset.toAsset.symbol}</span>
                <span className="text-dark-600">•</span>
                <span>{preset.slippage}% slip</span>
              </div>

              {/* Usage Stats */}
              <div className="flex items-center gap-3 text-[10px] text-dark-500">
                <span className="flex items-center gap-1">
                  <UsageIcon />
                  Used {preset.useCount || 0}x
                </span>
                <span className="flex items-center gap-1">
                  <ClockIcon />
                  {formatRelativeTime(preset.lastUsed)}
                </span>
              </div>
            </div>
          ))}

          <div className="px-3 pt-2 mt-2 border-t border-white/[0.06] space-y-0.5">
            <p className="text-[10px] text-gray-500 flex items-center gap-1">
              <BoltIcon /> = Instant swap
            </p>
            <p className="text-[10px] text-gray-500 flex items-center gap-1">
              <ShieldIcon /> = Smart protection
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function BookmarkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function UsageIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default PresetDropdown;
