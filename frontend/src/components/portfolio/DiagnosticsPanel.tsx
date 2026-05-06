/**
 * Diagnostics Panel (debug mode only)
 *
 * Visible when ?debug=1 in URL. Shows:
 *  - Global: snapshot status, refresh timing, loading state
 *  - Per-chain: health status, latency, failures, next retry
 *  - Pricing: cache age, tokens priced/missing, errors
 *
 * All addresses redacted. No secrets exposed.
 */

import { useState, useEffect } from 'react';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useWalletStore } from '@/stores/walletStore';
import { useCommissionMonitorStore } from '@/stores/commissionMonitorStore';
import {
  isSnapshotValid,
} from '@/stores/portfolioStore';
import {
  formatMsAgo,
  redactAddress,
  redactError,
  PORTFOLIO_CHAINS,
  CHAIN_LABELS,
  type ChainHealthState,
} from '@/utils/chainHealth';
import type { CommissionEvent } from '@/stores/commissionMonitorStore';

function isEthWrapperProvider(provider: string): boolean {
  return provider === 'uniswap-v3-wrapper' || provider === 'uniswap-v3-wrapper-v2';
}

function isBscWrapperProvider(provider: string): boolean {
  return provider === 'pancakeswap-v3-wrapper' || provider === 'pancakeswap-v3-wrapper-v2';
}

function summarizeCommissionEvents(events: CommissionEvent[]) {
  let totalWrapperSwaps = 0;
  let bscWrapperSwaps = 0;
  let ethWrapperSwaps = 0;
  let nativeIn = 0;
  let nativeOut = 0;
  let erc20Erc20 = 0;
  let oneInchBestEffort = 0;
  let noCommission = 0;

  for (const e of events) {
    if (e.nativeLane === 'native_in') nativeIn += 1;
    else if (e.nativeLane === 'native_out') nativeOut += 1;
    else erc20Erc20 += 1;

    if (e.commissionKind === 'wrapper') {
      totalWrapperSwaps += 1;
      if (isBscWrapperProvider(e.provider)) bscWrapperSwaps += 1;
      if (isEthWrapperProvider(e.provider)) ethWrapperSwaps += 1;
    } else if (e.commissionKind === '1inch_integrator_fee') {
      oneInchBestEffort += 1;
    } else {
      noCommission += 1;
    }
  }

  return {
    totalWrapperSwaps,
    bscWrapperSwaps,
    ethWrapperSwaps,
    nativeIn,
    nativeOut,
    erc20Erc20,
    oneInchBestEffort,
    noCommission,
  };
}

export function DiagnosticsPanel() {
  const [expanded, setExpanded] = useState(false);
  const [, tick] = useState(0);

  const address = useWalletStore((s) => s.address);
  const snapshotAt = usePortfolioStore((s) => s.snapshotAt);
  const loading = usePortfolioStore((s) => s.loading);
  const refreshStartedAt = usePortfolioStore((s) => s.refreshStartedAt);
  const refreshFinishedAt = usePortfolioStore((s) => s.refreshFinishedAt);
  const chainHealth = usePortfolioStore((s) => s.chainHealth);
  const pricingStatus = usePortfolioStore((s) => s.pricingStatus);
  const privacyMode = usePortfolioStore((s) => s.privacyMode);
  const commissionEvents = useCommissionMonitorStore((s) => s.events);
  const clearCommissionMonitor = useCommissionMonitorStore((s) => s.clear);

  // Refresh diagnostics display every 5s
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(interval);
  }, []);

  const commissionStats = summarizeCommissionEvents(commissionEvents);

  const commissionByProvider = commissionEvents.reduce(
    (acc, e) => {
      acc[e.provider] = (acc[e.provider] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const lastTraces = commissionEvents.slice(0, 10);

  const snapshotValid = isSnapshotValid(snapshotAt);
  const snapshotTtlRemaining = snapshotAt > 0
    ? Math.max(0, 10 * 60 * 1000 - (Date.now() - snapshotAt))
    : 0;

  return (
    <div className="bg-dark-900/90 border border-white/[0.08] rounded-xl text-[13px] font-sans text-dark-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      {/* Toggle Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-dark-300 hover:text-white transition-colors rounded-xl"
      >
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400/90" aria-hidden />
          <span className="font-medium text-sm text-dark-200">Diagnostics</span>
          <span className="text-[11px] text-dark-500 font-normal">debug session</span>
        </span>
        <span className="text-dark-500 text-xs">{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-white/[0.06] text-[12px] leading-snug">
          {/* ─── Global ─────────────────────────── */}
          <Section title="Global">
            <Row label="Wallet" value={redactAddress(address)} />
            <Row label="Privacy mode" value={privacyMode ? 'ON' : 'OFF'} />
            <Row label="Loading" value={loading ? 'YES' : 'no'} warn={loading} />
            <Row label="Snapshot at" value={snapshotAt > 0 ? formatMsAgo(snapshotAt) : 'none'} />
            <Row
              label="Snapshot valid"
              value={snapshotAt > 0 ? (snapshotValid ? `YES (${Math.floor(snapshotTtlRemaining / 1000)}s remaining)` : 'EXPIRED') : 'N/A'}
              warn={snapshotAt > 0 && !snapshotValid}
            />
            <Row label="Refresh started" value={refreshStartedAt > 0 ? formatMsAgo(refreshStartedAt) : 'never'} />
            <Row label="Refresh finished" value={refreshFinishedAt > 0 ? formatMsAgo(refreshFinishedAt) : 'never'} />
            {refreshStartedAt > 0 && refreshFinishedAt >= refreshStartedAt && (
              <Row label="Last refresh duration" value={`${refreshFinishedAt - refreshStartedAt}ms`} />
            )}
          </Section>

          {/* ─── Per-Chain ──────────────────────── */}
          <Section title="Per-Chain Health">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              {PORTFOLIO_CHAINS.map((chain) => {
                const health: ChainHealthState | undefined = chainHealth[chain];
                const label = CHAIN_LABELS[chain] || chain;

                return (
                  <ChainRow key={chain} label={label} health={health} />
                );
              })}
            </div>
          </Section>

          {/* ─── Pricing ───────────────────────── */}
          <Section title="Pricing (CoinGecko)">
            <Row label="Last fetch" value={pricingStatus.lastFetchAt > 0 ? formatMsAgo(pricingStatus.lastFetchAt) : 'never'} />
            <Row
              label="Cache age"
              value={pricingStatus.lastFetchAt > 0 ? `${Math.floor((Date.now() - pricingStatus.lastFetchAt) / 1000)}s` : '—'}
            />
            <Row label="Tokens priced" value={String(pricingStatus.tokensPriced)} />
            <Row label="Tokens missing" value={String(pricingStatus.tokensMissing)} warn={pricingStatus.tokensMissing > 0} />
            <Row
              label="Last error"
              value={pricingStatus.lastError ? redactError(pricingStatus.lastError) : '(none)'}
              warn={!!pricingStatus.lastError}
            />
          </Section>

          {/* ─── Commission Monitor (localStorage; no backend) ────────────── */}
          <Section title="Commission Monitor">
            <p className="text-dark-500 mb-1 leading-relaxed">
              Confirmed swaps only. Persists in this browser. No routing or RPC calls from this panel.
            </p>
            <Row label="Tracked confirmed swaps" value={String(commissionEvents.length)} />
            <Row label="Total wrapper swaps" value={String(commissionStats.totalWrapperSwaps)} />
            <Row label="BSC wrapper swaps" value={String(commissionStats.bscWrapperSwaps)} />
            <Row label="ETH wrapper swaps" value={String(commissionStats.ethWrapperSwaps)} />
            <Row label="native_in (all routes)" value={String(commissionStats.nativeIn)} />
            <Row label="native_out (all routes)" value={String(commissionStats.nativeOut)} />
            <Row label="ERC20↔ERC20 lane (all routes)" value={String(commissionStats.erc20Erc20)} />
            <Row label="1inch best-effort" value={String(commissionStats.oneInchBestEffort)} />
            <Row label="No-commission" value={String(commissionStats.noCommission)} />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.confirm('Clear commission monitor history in this browser?')) {
                    clearCommissionMonitor();
                  }
                }}
                className="text-[10px] px-2 py-1 rounded border border-dark-600 text-dark-400 hover:text-dark-200"
              >
                Clear local monitor
              </button>
            </div>
            <div className="mt-1 text-dark-500">Totals by provider:</div>
            <div className="space-y-0.5">
              {Object.entries(commissionByProvider)
                .sort((a, b) => b[1] - a[1])
                .map(([provider, count]) => (
                  <Row key={provider} label={provider} value={String(count)} />
                ))}
              {Object.keys(commissionByProvider).length === 0 && (
                <div className="text-dark-600">No confirmed swaps recorded yet.</div>
              )}
            </div>
            <details className="mt-2 rounded-lg border border-white/[0.06] bg-dark-950/40">
              <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-dark-400 hover:text-dark-200">
                Raw commission traces (last 10)
              </summary>
              <div className="max-h-48 overflow-y-auto px-3 pb-3 space-y-2 border-t border-dark-800/80">
                {lastTraces.length === 0 ? (
                  <div className="text-dark-500 text-[11px] pt-2">No traces yet.</div>
                ) : (
                  lastTraces.map((t) => (
                    <div
                      key={t.id}
                      className="border-b border-dark-800/80 pb-2 last:border-0 last:pb-0 text-[11px] leading-tight space-y-0.5 font-mono"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-500 font-sans">provider</span>
                        <span className="text-dark-200 truncate text-right">{t.provider}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-500 font-sans">chainId</span>
                        <span className="text-dark-200">{t.chainId}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-500 font-sans">txHash</span>
                        <span className="text-dark-200 truncate text-right" title={t.txHash}>
                          {t.txHash}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-500 font-sans">txTo</span>
                        <span className="text-dark-200 truncate text-right" title={t.txTo}>
                          {t.txTo ? redactAddress(t.txTo) : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-500 font-sans">commissionKind</span>
                        <span className="text-dark-200">{t.commissionKind}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-500 font-sans">nativeLane</span>
                        <span className="text-dark-200">{t.nativeLane}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-dark-500 font-sans">timestamp</span>
                        <span className="text-dark-200">{t.timestamp ? new Date(t.timestamp).toISOString() : '—'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </details>
          </Section>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-dark-200 font-semibold mb-2 mt-1 text-xs tracking-tight">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-dark-500">{label}</span>
      <span className={warn ? 'text-yellow-400' : 'text-dark-300'}>{value}</span>
    </div>
  );
}

function ChainRow({ label, health }: { label: string; health: ChainHealthState | undefined }) {
  if (!health) {
    return (
      <>
        <span className="text-dark-500">{label}</span>
        <span className="text-dark-600">No data yet</span>
      </>
    );
  }

  const statusColor =
    health.status === 'ok' ? 'text-green-400'
    : health.status === 'degraded' ? 'text-yellow-400'
    : 'text-red-400';

  const parts: string[] = [
    health.status.toUpperCase(),
  ];
  if (health.lastLatencyMs !== null) parts.push(`${health.lastLatencyMs}ms`);
  if (health.failureCount > 0) parts.push(`fails:${health.failureCount}`);
  if (health.nextRetryAt > Date.now()) {
    parts.push(`retry in ${Math.ceil((health.nextRetryAt - Date.now()) / 1000)}s`);
  }
  if (health.lastSuccessAt > 0) parts.push(`ok ${formatMsAgo(health.lastSuccessAt)}`);
  if (health.lastError) parts.push(redactError(health.lastError));

  return (
    <>
      <span className="text-dark-500">{label}</span>
      <span className={`${statusColor} truncate`}>{parts.join(' | ')}</span>
    </>
  );
}

export default DiagnosticsPanel;
