/**
 * Asset Picker for Send v2
 *
 * Dropdown with token search, balance display, chain badges.
 * Reads from balanceStore for available tokens with balances.
 */

import { useState, useMemo } from 'react';
import { useBalanceStore, CHAIN_NAME_TO_ID } from '@/stores/balanceStore';
import { formatBalance, formatUsd, getChainName } from '@/utils/format';

export interface SelectedAsset {
  symbol: string;
  name: string;
  chain: string;
  chainId: number;
  decimals: number;
  balance: string;
  balanceRaw?: string;
  usdValue?: string;
  isNative: boolean;
  contractAddress?: string;
}

interface Props {
  selected: SelectedAsset | null;
  onSelect: (asset: SelectedAsset) => void;
}

export function AssetPicker({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { balances } = useBalanceStore();

  // Build flat list of all assets with balances
  const allAssets: SelectedAsset[] = useMemo(() => {
    const assets: SelectedAsset[] = [];

    Object.entries(balances).forEach(([chain, chainBal]) => {
      const chainId = CHAIN_NAME_TO_ID[chain] || 1;

      // Native token
      if (chainBal.native_balance) {
        const nb = chainBal.native_balance;
        assets.push({
          symbol: nb.symbol,
          name: nb.name || nb.symbol,
          chain,
          chainId,
          decimals: nb.decimals,
          balance: nb.balance,
          balanceRaw: nb.balance_raw,
          usdValue: nb.usd_value,
          isNative: true,
        });
      }

      // ERC-20 tokens
      chainBal.token_balances.forEach((tb) => {
        assets.push({
          symbol: tb.symbol,
          name: tb.name || tb.symbol,
          chain,
          chainId,
          decimals: tb.decimals,
          balance: tb.balance,
          usdValue: tb.usd_value,
          isNative: false,
          contractAddress: tb.chain, // Will be resolved from token lists
        });
      });
    });

    // Sort: non-zero balance first, then by symbol
    return assets
      .filter((a) => parseFloat(a.balance) > 0)
      .sort((a, b) => {
        const aVal = parseFloat(a.usdValue || '0');
        const bVal = parseFloat(b.usdValue || '0');
        if (bVal !== aVal) return bVal - aVal;
        return a.symbol.localeCompare(b.symbol);
      });
  }, [balances]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return allAssets;
    const q = search.toLowerCase();
    return allAssets.filter(
      (a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.chain.toLowerCase().includes(q),
    );
  }, [allAssets, search]);

  const handleSelect = (asset: SelectedAsset) => {
    onSelect(asset);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="bg-dark-800 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-dark-400">Asset</span>
        {selected && (
          <span className="text-sm text-dark-400">
            Balance: {formatBalance(selected.balance)}
            {selected.usdValue && ` (${formatUsd(selected.usdValue)})`}
          </span>
        )}
      </div>

      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-3 bg-dark-700 rounded-xl hover:bg-dark-600 transition-colors"
      >
        <div className="flex items-center gap-3">
          {selected ? (
            <>
              <div className="w-8 h-8 rounded-full bg-dark-500 flex items-center justify-center">
                <span className="font-bold text-sm">{selected.symbol[0]}</span>
              </div>
              <div className="text-left">
                <div className="font-medium">{selected.symbol}</div>
                <div className="text-xs text-dark-400">
                  {selected.name}
                  <ChainBadge chainId={selected.chainId} />
                </div>
              </div>
            </>
          ) : (
            <span className="text-dark-400">Select asset to send</span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-dark-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 bg-dark-700 rounded-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-dark-600">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or symbol..."
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              autoFocus
            />
          </div>

          {/* Token list */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map((asset, i) => (
                <button
                  key={`${asset.chain}-${asset.symbol}-${i}`}
                  onClick={() => handleSelect(asset)}
                  className={`w-full flex items-center justify-between px-3 py-3 hover:bg-dark-600 transition-colors ${
                    selected?.symbol === asset.symbol && selected?.chainId === asset.chainId
                      ? 'bg-dark-600'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-dark-500 flex items-center justify-center">
                      <span className="text-sm font-bold">{asset.symbol[0]}</span>
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{asset.symbol}</span>
                        <ChainBadge chainId={asset.chainId} />
                      </div>
                      <div className="text-xs text-dark-400">{asset.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{formatBalance(asset.balance)}</div>
                    {asset.usdValue && (
                      <div className="text-xs text-dark-400">{formatUsd(asset.usdValue)}</div>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-dark-400 text-sm">
                {search ? 'No matching tokens' : 'No tokens with balance'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const CHAIN_COLORS: Record<number, string> = {
  1: 'bg-blue-500',
  56: 'bg-yellow-500',
  137: 'bg-purple-500',
  42161: 'bg-blue-400',
};

function ChainBadge({ chainId }: { chainId: number }) {
  return (
    <span
      className={`ml-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
        CHAIN_COLORS[chainId] || 'bg-dark-500'
      } text-white`}
    >
      {getChainName(chainId)}
    </span>
  );
}

export default AssetPicker;
