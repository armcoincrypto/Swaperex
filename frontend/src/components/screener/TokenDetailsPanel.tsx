/**
 * Token Details Panel (expandable row)
 *
 * Shows DexScreener enrichment + GoPlus risk summary on demand.
 * Fetches data when expanded; caches per TTL.
 */

import { useState, useEffect, useRef } from 'react';
import { fetchDexScreenerData } from '@/services/screener/dexScreenerService';
import { fetchTokenSecurity, getRiskColorClasses } from '@/services/tokenSecurity';
import type { DexScreenerData, ScreenerChainId } from '@/services/screener/types';
import type { TokenSecurityData } from '@/services/tokenSecurity';

interface Props {
  tokenId: string;
  symbol: string;
  contractAddress?: string;
  chainId: ScreenerChainId;
  onRunTokenCheck?: () => void;
}

export function TokenDetailsPanel({ tokenId, contractAddress, chainId, onRunTokenCheck }: Props) {
  const [dexData, setDexData] = useState<DexScreenerData | null>(null);
  const [riskData, setRiskData] = useState<TokenSecurityData | null>(null);
  const [dexLoading, setDexLoading] = useState(false);
  const [riskLoading, setRiskLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;

    // Fetch DexScreener data
    if (contractAddress) {
      setDexLoading(true);
      fetchDexScreenerData(contractAddress, chainId, ac.signal)
        .then((data) => { if (!ac.signal.aborted) setDexData(data); })
        .finally(() => { if (!ac.signal.aborted) setDexLoading(false); });

      // Fetch GoPlus risk
      setRiskLoading(true);
      fetchTokenSecurity(contractAddress, chainId)
        .then((data) => { if (!ac.signal.aborted) setRiskData(data); })
        .finally(() => { if (!ac.signal.aborted) setRiskLoading(false); });
    }

    return () => ac.abort();
  }, [tokenId, contractAddress, chainId]);

  const fmt = (n: number | undefined | null): string => {
    if (n == null) return '-';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(2)}`;
  };

  const pctClass = (v?: number) =>
    v == null ? 'text-dark-400' : v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-dark-400';
  const pctStr = (v?: number) => (v == null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);

  return (
    <div className="bg-dark-800/50 px-4 py-4 border-t border-dark-700 animate-in slide-in-from-top-1 duration-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Left: Market Data */}
        <div>
          <h4 className="text-xs text-dark-400 font-medium mb-2 uppercase tracking-wider">
            Market Data
            {dexData?.dexName && <span className="text-dark-500 ml-1">via {dexData.dexName}</span>}
          </h4>

          {contractAddress && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-dark-500">Contract:</span>
              <code className="text-xs text-dark-300">
                {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(contractAddress)}
                className="text-dark-500 hover:text-white text-xs"
                title="Copy address"
              >
                Copy
              </button>
            </div>
          )}

          {dexLoading ? (
            <p className="text-xs text-dark-500">Loading DexScreener data...</p>
          ) : dexData ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Liquidity" value={fmt(dexData.liquidity)} />
              <Stat label="FDV" value={fmt(dexData.fdv)} />
              <Stat label="Volume 24h" value={fmt(dexData.volume24h)} />
              <div>
                <span className="text-xs text-dark-400">Price Changes</span>
                <div className="flex gap-2 text-xs mt-0.5">
                  <span className={pctClass(dexData.priceChange1h)}>1h: {pctStr(dexData.priceChange1h)}</span>
                  <span className={pctClass(dexData.priceChange6h)}>6h: {pctStr(dexData.priceChange6h)}</span>
                  <span className={pctClass(dexData.priceChange24h)}>24h: {pctStr(dexData.priceChange24h)}</span>
                </div>
              </div>
            </div>
          ) : contractAddress ? (
            <p className="text-xs text-dark-500">No DexScreener data available</p>
          ) : (
            <p className="text-xs text-dark-500">Native token - no contract data</p>
          )}
        </div>

        {/* Right: Risk Summary */}
        <div>
          <h4 className="text-xs text-dark-400 font-medium mb-2 uppercase tracking-wider">
            Risk Summary (GoPlus)
          </h4>

          {riskLoading ? (
            <p className="text-xs text-dark-500">Checking token security...</p>
          ) : riskData ? (
            <div>
              {/* Risk badge */}
              <div className="flex items-center gap-2 mb-2">
                <RiskBadge level={riskData.overallRisk} />
                {riskData.isHoneypot && (
                  <span className="text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-0.5 rounded">
                    Honeypot
                  </span>
                )}
              </div>

              {/* Top signals */}
              <div className="space-y-1">
                <SignalRow signal={riskData.contractVerified} />
                <SignalRow signal={riskData.sellTax} />
                <SignalRow signal={riskData.liquidity} />
              </div>

              {riskData.holderCount && (
                <p className="text-xs text-dark-500 mt-1">
                  Holders: {riskData.holderCount.toLocaleString()}
                </p>
              )}
            </div>
          ) : contractAddress ? (
            <p className="text-xs text-dark-500">Risk data unavailable</p>
          ) : (
            <p className="text-xs text-dark-500">Native token</p>
          )}

          {onRunTokenCheck && contractAddress && (
            <button
              onClick={onRunTokenCheck}
              className="mt-3 text-xs text-primary-400 hover:text-primary-300 underline"
            >
              Run full Token Check in Radar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-dark-400">{label}</span>
      <div className="text-sm text-white">{value}</div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors = getRiskColorClasses(level as 'safe' | 'warning' | 'risk' | 'unknown');
  const labels: Record<string, string> = {
    safe: 'Safe',
    warning: 'Warning',
    risk: 'Danger',
    unknown: 'Unknown',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
      {labels[level] || 'Unknown'}
    </span>
  );
}

function SignalRow({ signal }: { signal: { label: string; level: string; value: string } }) {
  const colors = getRiskColorClasses(signal.level as 'safe' | 'warning' | 'risk' | 'unknown');
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-dark-400">{signal.label}</span>
      <span className={colors.text}>{signal.value}</span>
    </div>
  );
}

export default TokenDetailsPanel;
