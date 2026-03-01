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

  // Refresh diagnostics display every 5s
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(interval);
  }, []);

  const snapshotValid = isSnapshotValid(snapshotAt);
  const snapshotTtlRemaining = snapshotAt > 0
    ? Math.max(0, 10 * 60 * 1000 - (Date.now() - snapshotAt))
    : 0;

  return (
    <div className="bg-dark-900 border border-dark-700 rounded-xl text-[11px] font-mono">
      {/* Toggle Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-dark-400 hover:text-dark-200 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          Diagnostics (debug)
        </span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-dark-700/50">
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
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-dark-400 font-semibold uppercase tracking-wider mb-1 mt-2 text-[10px]">
        {title}
      </div>
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
