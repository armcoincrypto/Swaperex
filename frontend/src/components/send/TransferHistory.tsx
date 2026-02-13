/**
 * Transfer History for Send page
 *
 * Compact list of recent transfers from swapHistoryStore.
 * Shows token, amount, destination, status, time, and explorer link.
 */

import { useMemo, useState } from 'react';
import { useSwapHistoryStore, type SwapRecord } from '@/stores/swapHistoryStore';
import { getTokens, NATIVE_TOKEN_ADDRESS } from '@/tokens';
import { shortenAddress, getChainName } from '@/utils/format';
import { formatActivityTime } from '@/services/activityService';

interface Props {
  chainId?: number;
}

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  success: { icon: '\u2713', color: 'text-green-400' },
  pending: { icon: '\u25CF', color: 'text-yellow-400 animate-pulse' },
  failed: { icon: '\u2717', color: 'text-red-400' },
};

function getTokenLogo(chainId: number, symbol: string): string | undefined {
  const tokens = getTokens(chainId);
  const native = tokens.find((t) => t.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase());
  if (native && native.symbol.toUpperCase() === symbol.toUpperCase()) return native.logoURI;
  const token = tokens.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
  return token?.logoURI;
}

function TokenImg({ chainId, symbol }: { chainId: number; symbol: string }) {
  const [err, setErr] = useState(false);
  const logo = getTokenLogo(chainId, symbol);

  if (logo && !err) {
    return (
      <img
        src={logo}
        alt={symbol}
        width={28}
        height={28}
        className="rounded-full"
        onError={() => setErr(true)}
        loading="lazy"
      />
    );
  }

  return (
    <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center">
      <span className="text-[10px] font-bold">{symbol.slice(0, 3)}</span>
    </div>
  );
}

export function TransferHistory({ chainId }: Props) {
  const { records } = useSwapHistoryStore();

  // Filter transfers only, optionally by chain
  const transfers = useMemo(() => {
    return records
      .filter((r) => r.provider === 'transfer')
      .filter((r) => !chainId || r.chainId === chainId)
      .slice(0, 20);
  }, [records, chainId]);

  if (transfers.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-dark-300">Transfer History</h3>
        <span className="text-[10px] text-dark-500">
          {transfers.length} transfer{transfers.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-1">
        {transfers.map((record) => (
          <TransferRow key={record.id} record={record} />
        ))}
      </div>
    </div>
  );
}

function TransferRow({ record }: { record: SwapRecord }) {
  const statusInfo = STATUS_ICONS[record.status] || STATUS_ICONS.pending;
  const amount = parseFloat(record.fromAmount);
  const displayAmount = amount < 0.0001 ? '<0.0001' : amount.toFixed(4);

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors group">
      {/* Left: status + token + amount */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`text-sm ${statusInfo.color}`} title={record.status}>
          {statusInfo.icon}
        </span>
        <TokenImg chainId={record.chainId} symbol={record.fromAsset.symbol} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">
              {displayAmount} {record.fromAsset.symbol}
            </span>
            <span className="text-[10px] text-dark-500">
              {getChainName(record.chainId)}
            </span>
          </div>
          {record.toAddress && (
            <div className="text-[11px] text-dark-400">
              To {shortenAddress(record.toAddress, 4)}
            </div>
          )}
        </div>
      </div>

      {/* Right: time + explorer link */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-dark-500">
          {formatActivityTime(record.timestamp)}
        </span>
        {record.explorerUrl && (
          <a
            href={record.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dark-500 hover:text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity"
            title="View on Explorer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

export default TransferHistory;
