/**
 * Screener Table
 *
 * Sortable table header + token rows.
 * Basic mode: 5 columns (token, price, 24h%, volume, action).
 * Advanced mode: 6 columns (token, price, 24h%, volume, mcap, actions).
 */

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
  advancedOnly?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { label: 'Token' },
  { label: 'Price', field: 'currentPrice' },
  { label: '24h %', field: 'priceChange24h' },
  { label: 'Volume', field: 'volume24h' },
  { label: 'Market Cap', field: 'marketCap' },
  { label: 'Actions', align: 'right', advancedOnly: true },
];

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
  const cols = isAdvanced ? COLUMNS : COLUMNS.filter((c) => !c.advancedOnly);

  return (
    <div className="bg-dark-900 rounded-xl border border-dark-800 overflow-hidden">
      {/* Header */}
      <div
        className={`grid ${isAdvanced ? 'grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]' : 'grid-cols-[2fr_1fr_1fr_1fr_1fr]'} gap-4 px-4 py-3 bg-dark-800/50 text-sm font-medium text-dark-400`}
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
      {tokens.map((token) => (
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

      {/* Loading overlay for refreshes (don't hide existing rows) */}
      {isLoading && tokens.length > 0 && (
        <div className="px-4 py-2 text-center text-xs text-dark-500 border-t border-dark-800">
          Refreshing...
        </div>
      )}
    </div>
  );
}

function SortIcon({ dir }: { dir: SortDir }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${dir === 'asc' ? 'rotate-180' : ''}`}
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin w-6 h-6 mx-auto text-dark-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export default ScreenerTable;
