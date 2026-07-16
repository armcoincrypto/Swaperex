/**
 * Screener Table
 *
 * Sortable table header + token rows.
 * 6 columns: token, price, 24h%, volume, mcap, actions.
 * Advanced mode shows extra action buttons + expandable details.
 * P20.2 — bounded initial render with accessible Show more.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ScreenerToken, SortField, SortDir } from '@/services/screener/types';
import { TokenRow } from './TokenRow';

interface Props {
  tokens: ScreenerToken[];
  isAdvanced: boolean;
  sortField: SortField;
  sortDir: SortDir;
  expandedTokenId: string | null;
  onSort: (field: SortField) => void;
  onToggleExpand: (id: string) => void;
  onSwap: (token: ScreenerToken) => void;
  onRunTokenCheck?: (token: ScreenerToken) => void;
  isLoading: boolean;
}

interface ColumnDef {
  label: string;
  field?: SortField;
  align?: 'right';
}

const COLUMNS: ColumnDef[] = [
  { label: 'Token' },
  { label: 'Price', field: 'currentPrice' },
  { label: '24h %', field: 'priceChange24h' },
  { label: 'Volume', field: 'volume24h' },
  { label: 'Market Cap', field: 'marketCap' },
  { label: 'Trade', align: 'right' },
];

const PAGE_SIZE = 40;

export function ScreenerTable({
  tokens,
  isAdvanced,
  sortField,
  sortDir,
  expandedTokenId,
  onSort,
  onToggleExpand,
  onSwap,
  onRunTokenCheck,
  isLoading,
}: Props) {
  const cols = COLUMNS;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [tokens.length, sortField, sortDir, tokens[0]?.id]);

  const displayTokens = useMemo(
    () => tokens.slice(0, visibleCount),
    [tokens, visibleCount],
  );

  const hasMore = tokens.length > displayTokens.length;
  const rangeEnd = displayTokens.length;
  const rangeStart = tokens.length === 0 ? 0 : 1;

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <div
        className="sticky top-0 z-10 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 bg-electro-panel/95 backdrop-blur-md border-b border-white/[0.08] text-[10px] uppercase tracking-wider font-medium text-dark-500"
      >
        {cols.map((col) => (
          <div
            key={col.label}
            className={`flex items-center gap-1 ${col.field ? 'cursor-pointer hover:text-white' : ''} ${col.align === 'right' ? 'justify-end' : ''}`}
            onClick={col.field ? () => onSort(col.field!) : undefined}
          >
            {col.label}
            {col.field && sortField === col.field && <SortIcon dir={sortDir} />}
          </div>
        ))}
      </div>

      {/* Loading */}
      {isLoading && tokens.length === 0 && (
        <div className="px-4 py-8 text-center text-dark-400">
          <LoadingSpinner />
          <p className="mt-2">Loading tokens...</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && tokens.length === 0 && (
        <div className="px-4 py-8 text-center text-dark-400">
          No tokens match your filters. Try relaxing your criteria.
        </div>
      )}

      {/* Rows */}
      {displayTokens.map((token) => (
        <TokenRow
          key={token.id}
          token={token}
          isAdvanced={isAdvanced}
          isExpanded={expandedTokenId === token.id}
          onToggleExpand={() => onToggleExpand(token.id)}
          onSwap={onSwap}
          onRunTokenCheck={onRunTokenCheck}
        />
      ))}

      {tokens.length > 0 && (
        <div className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-white/[0.06]">
          <p className="text-xs text-dark-500" aria-live="polite">
            Showing {rangeStart}–{rangeEnd} of {tokens.length}
          </p>
          {hasMore ? (
            <button
              type="button"
              className="min-h-[44px] px-4 text-xs font-medium text-primary-300 hover:text-primary-200 border border-white/[0.08] rounded-lg bg-black/20"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              aria-label={`Show ${Math.min(PAGE_SIZE, tokens.length - rangeEnd)} more tokens`}
            >
              Show more
            </button>
          ) : null}
        </div>
      )}

      {/* Loading overlay for refreshes (don't hide existing rows) */}
      {isLoading && tokens.length > 0 && (
        <div className="px-4 py-2 text-center text-dark-500 text-xs">Updating…</div>
      )}
    </div>
  );
}

function SortIcon({ dir }: { dir: SortDir }) {
  return (
    <span className="text-primary-400" aria-hidden>
      {dir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

function LoadingSpinner() {
  return (
    <div className="inline-block w-5 h-5 border-2 border-dark-500 border-t-primary-400 rounded-full animate-spin" />
  );
}

export default ScreenerTable;
