/**
 * Asset Picker for Send v2
 *
 * Dropdown with token search, balance display, chain badges, and token logos.
 * Merges balanceStore data with static token lists to show all known tokens.
 */

import { useState, useMemo } from 'react';
import { useBalanceStore, CHAIN_NAME_TO_ID, ERC20_TOKENS } from '@/stores/balanceStore';
import { getTokens, getNativeSymbol, NATIVE_TOKEN_ADDRESS } from '@/tokens';
import { formatBalance, formatUsd, getChainName } from '@/utils/format';
import { SwapTokenAvatar } from '@/components/common/SwapTokenAvatar';
import { ShellSection } from '@/components/ui/ShellPrimitives';

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
  logoURI?: string;
}

interface Props {
  selected: SelectedAsset | null;
  onSelect: (asset: SelectedAsset) => void;
}

/** Chain name from chain ID */
const CHAIN_ID_TO_NAME: Record<number, string> = {};
Object.entries(CHAIN_NAME_TO_ID).forEach(([name, id]) => {
  CHAIN_ID_TO_NAME[id] = name;
});

/** Token avatar aligned with swap surfaces. */
function TokenIcon({
  logoURI,
  symbol,
  chainId,
  size = 'md' as const,
}: {
  logoURI?: string;
  symbol: string;
  chainId?: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <SwapTokenAvatar
      symbol={symbol}
      logoUrl={logoURI}
      chainId={chainId}
      size={size}
      showChainBadge={!!chainId}
    />
  );
}

export function AssetPicker({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { balances } = useBalanceStore();

  // Build flat list: balance tokens + all known tokens from static lists
  const allAssets: SelectedAsset[] = useMemo(() => {
    const assets: SelectedAsset[] = [];
    const seen = new Set<string>(); // chain:symbol to dedup

    // ── 1. Tokens with actual balances (from balanceStore) ──
    Object.entries(balances).forEach(([chain, chainBal]) => {
      const chainId = CHAIN_NAME_TO_ID[chain] || 1;
      const staticTokens = getTokens(chainId);

      // Helper: find logoURI from static list
      const findLogo = (symbol: string, address?: string): string | undefined => {
        if (address) {
          const byAddr = staticTokens.find(
            (t) => t.address.toLowerCase() === address.toLowerCase(),
          );
          if (byAddr?.logoURI) return byAddr.logoURI;
        }
        const bySym = staticTokens.find(
          (t) => t.symbol.toUpperCase() === symbol.toUpperCase(),
        );
        return bySym?.logoURI;
      };

      // Native token
      if (chainBal.native_balance) {
        const nb = chainBal.native_balance;
        const key = `${chain}:${nb.symbol}:native`;
        seen.add(key);
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
          logoURI: findLogo(nb.symbol, NATIVE_TOKEN_ADDRESS),
        });
      }

      // ERC-20 tokens with balance
      chainBal.token_balances.forEach((tb) => {
        // Resolve contract address from ERC20_TOKENS
        const erc20List = ERC20_TOKENS[chain] || [];
        const erc20Match = erc20List.find(
          (t) => t.symbol.toUpperCase() === tb.symbol.toUpperCase(),
        );
        const contractAddress = erc20Match?.address;

        const key = `${chain}:${tb.symbol}:${contractAddress?.toLowerCase() || ''}`;
        seen.add(key);

        assets.push({
          symbol: tb.symbol,
          name: tb.name || tb.symbol,
          chain,
          chainId,
          decimals: tb.decimals,
          balance: tb.balance,
          usdValue: tb.usd_value,
          isNative: false,
          contractAddress,
          logoURI: findLogo(tb.symbol, contractAddress),
        });
      });
    });

    // ── 2. Remaining tokens from static lists (zero balance) ──
    const chainEntries: [string, number][] = Object.entries(CHAIN_NAME_TO_ID).map(
      ([name, id]) => [name, id],
    );

    for (const [chain, chainId] of chainEntries) {
      const staticTokens = getTokens(chainId);
      const nativeSym = getNativeSymbol(chainId);

      for (const token of staticTokens) {
        const isNative = token.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
        const key = isNative
          ? `${chain}:${token.symbol}:native`
          : `${chain}:${token.symbol}:${token.address.toLowerCase()}`;

        if (seen.has(key)) continue;

        // Also check by symbol alone in case address mismatch
        const symKey = `${chain}:${token.symbol}:`;
        const alreadyBySymbol = [...seen].some((s) => s.startsWith(symKey));
        if (alreadyBySymbol && !isNative) continue;
        if (isNative) {
          const nativeKey = `${chain}:${nativeSym}:native`;
          if (seen.has(nativeKey)) continue;
        }

        seen.add(key);
        assets.push({
          symbol: token.symbol,
          name: token.name,
          chain,
          chainId,
          decimals: token.decimals,
          balance: '0',
          isNative,
          contractAddress: isNative ? undefined : token.address,
          logoURI: token.logoURI,
        });
      }
    }

    // Sort: non-zero balance first (by USD value desc), then zero-balance alphabetically
    return assets.sort((a, b) => {
      const aHasBalance = parseFloat(a.balance) > 0 ? 1 : 0;
      const bHasBalance = parseFloat(b.balance) > 0 ? 1 : 0;
      if (aHasBalance !== bHasBalance) return bHasBalance - aHasBalance;

      if (aHasBalance && bHasBalance) {
        const aVal = parseFloat(a.usdValue || '0');
        const bVal = parseFloat(b.usdValue || '0');
        if (bVal !== aVal) return bVal - aVal;
        // Natives first
        if (a.isNative && !b.isNative) return -1;
        if (!a.isNative && b.isNative) return 1;
      }

      return a.symbol.localeCompare(b.symbol);
    });
  }, [balances]);

  // Filter by search (name, symbol, chain, contract address)
  const filtered = useMemo(() => {
    if (!search) return allAssets;
    const q = search.toLowerCase();
    return allAssets.filter(
      (a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.chain.toLowerCase().includes(q) ||
        (a.contractAddress && a.contractAddress.toLowerCase().includes(q)),
    );
  }, [allAssets, search]);

  const handleSelect = (asset: SelectedAsset) => {
    onSelect(asset);
    setOpen(false);
    setSearch('');
  };

  return (
    <ShellSection className="mb-4">
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
        className="w-full flex items-center justify-between px-3 py-3 min-h-[3.25rem] bg-electro-panel/80 rounded-xl hover:bg-electro-panelHover transition-all duration-200 border border-white/[0.06] hover:border-white/[0.1] ring-1 ring-white/[0.03]"
      >
        <div className="flex items-center gap-3 min-w-0">
          {selected ? (
            <>
              <TokenIcon logoURI={selected.logoURI} symbol={selected.symbol} chainId={selected.chainId} />
              <div className="text-left min-w-0">
                <div className="font-medium text-white">{selected.symbol}</div>
                <div className="text-xs text-dark-400 truncate">
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
          className={`w-5 h-5 text-dark-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 rounded-xl overflow-hidden border border-white/[0.06] bg-electro-panel/95 backdrop-blur-glass">
          {/* Search */}
          <div className="p-2 border-b border-white/[0.06]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, symbol, or address..."
              className="w-full input text-sm py-2"
              autoFocus
            />
            <div className="text-[10px] text-dark-500 mt-1 px-1">
              {filtered.length} token{filtered.length !== 1 ? 's' : ''}
              {search && ` matching "${search}"`}
            </div>
          </div>

          {/* Token list */}
          <div className="max-h-72 overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map((asset, i) => {
                const hasBalance = parseFloat(asset.balance) > 0;
                const isSelected =
                  selected?.symbol === asset.symbol && selected?.chainId === asset.chainId;
                return (
                  <button
                    key={`${asset.chain}-${asset.symbol}-${asset.contractAddress || 'native'}-${i}`}
                    onClick={() => handleSelect(asset)}
                    className={`w-full flex items-center justify-between px-3 py-3 transition-colors ${
                      isSelected
                        ? 'bg-accent/10 border-l-2 border-accent'
                        : 'hover:bg-electro-panelHover'
                    } ${!hasBalance ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <TokenIcon
                        logoURI={asset.logoURI}
                        symbol={asset.symbol}
                        chainId={asset.chainId}
                        size="sm"
                      />
                      <div className="text-left min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-white">{asset.symbol}</span>
                          <ChainBadge chainId={asset.chainId} />
                        </div>
                        <div className="text-xs text-dark-400 truncate">{asset.name}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="text-sm text-white">{hasBalance ? formatBalance(asset.balance) : '0'}</div>
                      {asset.usdValue && hasBalance && (
                        <div className="text-xs text-dark-400">{formatUsd(asset.usdValue)}</div>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center text-dark-400 text-sm">
                {search ? 'No matching tokens' : 'No tokens available'}
              </div>
            )}
          </div>
        </div>
      )}
    </ShellSection>
  );
}

function ChainBadge({ chainId }: { chainId: number }) {
  return (
    <span className="ml-1 inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-electro-panel/70 border border-white/[0.08] text-dark-300">
      {getChainName(chainId)}
    </span>
  );
}

export default AssetPicker;
