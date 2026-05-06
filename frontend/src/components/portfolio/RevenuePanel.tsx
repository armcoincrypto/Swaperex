/**
 * Portfolio — estimated protocol revenue from local commission history + spot prices.
 * Frontend-only; no backend.
 */

import { useEffect, useMemo, useState } from 'react';
import { formatUnits } from 'ethers';
import { useCommissionMonitorStore, type CommissionEvent } from '@/stores/commissionMonitorStore';
import { fetchCoinGeckoPrices } from '@/services/priceService';
import { getTokenBySymbol } from '@/tokens';

const CHAIN_LABEL: Record<number, string> = {
  1: 'Ethereum',
  56: 'BNB Chain',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  43114: 'Avalanche',
  100: 'Gnosis',
  250: 'Fantom',
  8453: 'Base',
};

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 0.01) return `<$0.01`;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: n < 1 ? 4 : 2 });
}

function formatUsdTotal(n: number, swapCount: number): string {
  if (Number.isFinite(n) && n > 0) return formatUsd(n);
  if (swapCount > 0 && n === 0) return '$0.00';
  return '—';
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function feeDecimalsForSymbol(sym: string | undefined, chainId: number): number {
  if (!sym) return 18;
  const u = sym.toUpperCase();
  const t =
    getTokenBySymbol(u, chainId) ??
    getTokenBySymbol(u, 1) ??
    getTokenBySymbol(u, 56) ??
    getTokenBySymbol(u, 137);
  return t?.decimals ?? 18;
}

function revenueEvents(events: CommissionEvent[]): CommissionEvent[] {
  return events.filter((e) => e.commissionKind !== 'none');
}

export function RevenuePanel() {
  const events = useCommissionMonitorStore((s) => s.events);
  const clear = useCommissionMonitorStore((s) => s.clear);
  const [prices, setPrices] = useState<Record<string, number>>({});

  const rows = useMemo(() => revenueEvents(events), [events]);

  const priceSymbolsKey = useMemo(() => {
    const s = new Set<string>();
    for (const e of rows) {
      const sym = e.feeTokenSymbol?.trim();
      if (sym) s.add(sym.toUpperCase());
    }
    return [...s].sort().join('|');
  }, [rows]);

  useEffect(() => {
    const list = priceSymbolsKey ? priceSymbolsKey.split('|').filter(Boolean) : [];
    if (list.length === 0) {
      setPrices({});
      return;
    }
    let cancelled = false;
    (async () => {
      const p = await fetchCoinGeckoPrices(list);
      if (!cancelled) setPrices(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [priceSymbolsKey]);

  const { totalUsd, byChain, byDay, avgBps, swapCount, pricedFeeCount } = useMemo(() => {
    let total = 0;
    const chainMap: Record<number, { usd: number; swaps: number }> = {};
    const dayMap: Record<string, { usd: number; swaps: number }> = {};
    let bpsSum = 0;
    let bpsN = 0;
    let priced = 0;

    for (const e of rows) {
      const sym = e.feeTokenSymbol?.toUpperCase();
      const wei = e.feeAmountTokenWei;
      const px = sym ? prices[sym] : undefined;
      let usd = 0;
      if (sym && wei && px != null) {
        try {
          const dec = feeDecimalsForSymbol(sym, e.chainId);
          const human = parseFloat(formatUnits(BigInt(wei), dec));
          if (Number.isFinite(human) && human >= 0) {
            usd = human * px;
            priced += 1;
          }
        } catch {
          // ignore parse errors
        }
      }

      total += usd;
      if (!chainMap[e.chainId]) chainMap[e.chainId] = { usd: 0, swaps: 0 };
      chainMap[e.chainId].usd += usd;
      chainMap[e.chainId].swaps += 1;

      const dk = dayKey(e.timestamp);
      if (!dayMap[dk]) dayMap[dk] = { usd: 0, swaps: 0 };
      dayMap[dk].usd += usd;
      dayMap[dk].swaps += 1;

      if (e.expectedFeeBps != null && e.expectedFeeBps > 0) {
        bpsSum += e.expectedFeeBps;
        bpsN += 1;
      }
    }

    const swapCount = rows.length;
    return {
      totalUsd: total,
      byChain: chainMap,
      byDay: dayMap,
      avgBps: bpsN > 0 ? bpsSum / bpsN : null,
      swapCount,
      pricedFeeCount: priced,
    };
  }, [rows, prices]);

  const sortedDays = useMemo(
    () => Object.keys(byDay).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)),
    [byDay],
  );

  const sortedChains = useMemo(
    () => Object.keys(byChain).map(Number).sort((a, b) => a - b),
    [byChain],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold">Revenue</h2>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.confirm('Clear local revenue history?')) clear();
            }}
            className="text-xs text-dark-400 hover:text-amber-300/90"
          >
            Clear local data
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="bg-dark-800 rounded-xl p-6 text-center">
          <p className="text-dark-400 text-sm">No commission-tracked swaps yet</p>
          <p className="text-dark-500 text-xs mt-1">
            After wrapper or integrator swaps complete, estimates appear here from this browser only.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-gradient-to-b from-dark-800 to-dark-800/80 rounded-xl p-4 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-1 font-semibold">Total earned</p>
              <p className="text-2xl font-semibold text-white tabular-nums tracking-tight">
                {formatUsdTotal(totalUsd, swapCount)}
              </p>
              <p className="text-[11px] text-dark-500 mt-2 leading-snug">
                Estimated · {pricedFeeCount}/{swapCount} swaps with price
              </p>
            </div>
            <div className="bg-gradient-to-b from-dark-800 to-dark-800/80 rounded-xl p-4 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-1 font-semibold">Swaps</p>
              <p className="text-2xl font-semibold text-white tabular-nums tracking-tight">{swapCount}</p>
              <p className="text-[11px] text-dark-500 mt-2 leading-snug">Commission-tracked fills (this browser)</p>
            </div>
            <div className="bg-gradient-to-b from-dark-800 to-dark-800/80 rounded-xl p-4 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-1 font-semibold">Avg fee</p>
              <p className="text-2xl font-semibold text-white tabular-nums tracking-tight">
                {avgBps != null ? `${avgBps.toFixed(1)} bps` : '—'}
              </p>
              <p className="text-[11px] text-dark-500 mt-2 leading-snug">Mean quoted fee on recorded swaps</p>
            </div>
            <div className="bg-gradient-to-b from-dark-800 to-dark-800/80 rounded-xl p-4 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-1 font-semibold">Chains</p>
              <p className="text-2xl font-semibold text-white tabular-nums tracking-tight">{sortedChains.length}</p>
              <p className="text-[11px] text-dark-500 mt-2 leading-snug">Networks with revenue events</p>
            </div>
          </div>

          <div className="bg-dark-800 rounded-xl p-4 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-xs font-semibold text-dark-200 mb-1">Earnings by chain</p>
            <p className="text-[11px] text-dark-500 mb-3">USD estimate per network</p>
            <div className="space-y-2">
              {sortedChains.map((cid) => {
                const row = byChain[cid];
                if (!row) return null;
                const label = CHAIN_LABEL[cid] ?? `Chain ${cid}`;
                return (
                  <div key={cid} className="flex justify-between text-sm gap-3">
                    <span className="text-dark-400 shrink-0">{label}</span>
                    <span className="text-dark-200 tabular-nums text-right">
                      {formatUsd(row.usd)}
                      <span className="text-dark-500 text-[11px] ml-2">({row.swaps} swaps)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-dark-800 rounded-xl p-4 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-xs font-semibold text-dark-200 mb-2">By day (UTC)</p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {sortedDays.length === 0 ? (
                <p className="text-dark-500 text-sm">No data</p>
              ) : (
                sortedDays.map((d) => {
                  const row = byDay[d];
                  if (!row) return null;
                  return (
                    <div key={d} className="flex justify-between text-sm gap-3">
                      <span className="text-dark-400 shrink-0 font-mono text-[12px]">{d}</span>
                      <span className="text-dark-200 tabular-nums text-right">
                        {formatUsd(row.usd)}
                        <span className="text-dark-500 text-[11px] ml-2">({row.swaps})</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      <p className="text-[10px] leading-relaxed text-dark-500 px-0.5">
        Figures are estimates from local swap history and live token prices. They are not audited on-chain revenue
        and may omit or mis-price tokens missing from price feeds.
      </p>
    </div>
  );
}

export default RevenuePanel;
