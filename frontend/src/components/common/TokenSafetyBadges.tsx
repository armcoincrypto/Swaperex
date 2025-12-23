/**
 * Token Safety Badges Component
 *
 * Displays security signals for a token using simple color-coded badges.
 * Uses GoPlus API data (frontend-only).
 *
 * Colors:
 * 🟢 Safe (green)
 * 🟡 Warning (yellow)
 * 🔴 Risk (red)
 * ⚪ Unknown (gray)
 */

import { useState, useEffect } from 'react';
import {
  fetchTokenSecurity,
  getRiskColorClasses,
  type TokenSecurityData,
  type SecuritySignal,
  type RiskLevel,
} from '@/services/tokenSecurity';

interface TokenSafetyBadgesProps {
  contractAddress: string;
  chainId: number;
  compact?: boolean;  // Show only icons, not full labels
  showDisclaimer?: boolean;
}

export function TokenSafetyBadges({
  contractAddress,
  chainId,
  compact = false,
  showDisclaimer = false,
}: TokenSafetyBadgesProps) {
  const [securityData, setSecurityData] = useState<TokenSecurityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSecurityData() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchTokenSecurity(contractAddress, chainId);
        if (!cancelled) {
          setSecurityData(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load security data');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadSecurityData();

    return () => {
      cancelled = true;
    };
  }, [contractAddress, chainId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-dark-400 text-xs">
        <LoadingSpinner />
        <span>Checking security...</span>
      </div>
    );
  }

  if (error || !securityData) {
    return (
      <div className="text-xs text-dark-400">
        Security data unavailable
      </div>
    );
  }

  const signals: SecuritySignal[] = [
    securityData.contractVerified,
    securityData.liquidityLocked,
    securityData.tokenAge,
    securityData.buyTax,
    securityData.sellTax,
    securityData.liquidity,
  ];

  // Filter out unknown signals for compact view
  const visibleSignals = compact
    ? signals.filter(s => s.level !== 'unknown')
    : signals;

  return (
    <div className="space-y-2">
      {/* Honeypot Warning (always show if detected) */}
      {securityData.isHoneypot && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-xs">
          <span className="text-sm">⛔</span>
          <span className="font-medium">HONEYPOT DETECTED</span>
          <span className="text-red-400/70">- May not be sellable</span>
        </div>
      )}

      {/* Security Signals Grid */}
      <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'gap-2'}`}>
        {visibleSignals.map((signal, idx) => (
          <SecurityBadge
            key={idx}
            signal={signal}
            compact={compact}
          />
        ))}
      </div>

      {/* Disclaimer */}
      {showDisclaimer && (
        <div className="text-xs text-dark-500 mt-2">
          Security data by GoPlus. For informational purposes only.
        </div>
      )}
    </div>
  );
}

/**
 * Individual security badge with tooltip
 */
function SecurityBadge({
  signal,
  compact,
}: {
  signal: SecuritySignal;
  compact: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const colors = getRiskColorClasses(signal.level);

  const icon = getSignalIcon(signal.level);

  if (compact) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${colors.bg} ${colors.text}`}
        >
          <span className="text-[10px]">{icon}</span>
          <span className="font-medium">{signal.label}</span>
        </div>
        {showTooltip && (
          <Tooltip
            label={signal.label}
            value={signal.value}
            tooltip={signal.tooltip}
            level={signal.level}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${colors.bg} ${colors.text} border ${colors.border}`}
      >
        <span className="text-sm">{icon}</span>
        <div className="flex flex-col">
          <span className="text-[10px] opacity-70">{signal.label}</span>
          <span className="font-medium">{signal.value}</span>
        </div>
      </div>
      {showTooltip && (
        <Tooltip
          label={signal.label}
          value={signal.value}
          tooltip={signal.tooltip}
          level={signal.level}
        />
      )}
    </div>
  );
}

/**
 * Tooltip component
 */
function Tooltip({
  label,
  value,
  tooltip,
  level,
}: {
  label: string;
  value: string;
  tooltip: string;
  level: RiskLevel;
}) {
  const colors = getRiskColorClasses(level);

  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-dark-700 border border-dark-600 rounded-lg shadow-lg text-xs">
      <div className={`font-medium mb-1 ${colors.text}`}>
        {label}: {value}
      </div>
      <div className="text-dark-300">
        {tooltip}
      </div>
      {/* Arrow */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
        <div className="border-4 border-transparent border-t-dark-600" />
      </div>
    </div>
  );
}

/**
 * Get icon for signal level
 */
function getSignalIcon(level: RiskLevel): string {
  switch (level) {
    case 'safe':
      return '✓';
    case 'warning':
      return '⚠';
    case 'risk':
      return '⛔';
    default:
      return '?';
  }
}

/**
 * Loading spinner
 */
function LoadingSpinner() {
  return (
    <div className="w-3 h-3 border-2 border-dark-400 border-t-transparent rounded-full animate-spin" />
  );
}

/**
 * Overall risk summary badge
 */
export function OverallRiskBadge({
  contractAddress,
  chainId,
}: {
  contractAddress: string;
  chainId: number;
}) {
  const [securityData, setSecurityData] = useState<TokenSecurityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSecurityData() {
      setIsLoading(true);
      try {
        const data = await fetchTokenSecurity(contractAddress, chainId);
        if (!cancelled) {
          setSecurityData(data);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadSecurityData();

    return () => {
      cancelled = true;
    };
  }, [contractAddress, chainId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 px-2 py-0.5 bg-dark-700 rounded text-xs text-dark-400">
        <LoadingSpinner />
        <span>Checking...</span>
      </div>
    );
  }

  if (!securityData) {
    return null;
  }

  const colors = getRiskColorClasses(securityData.overallRisk);
  const icon = getSignalIcon(securityData.overallRisk);

  const riskLabels: Record<RiskLevel, string> = {
    safe: 'Low Risk',
    warning: 'Caution',
    risk: 'High Risk',
    unknown: 'Unknown',
  };

  return (
    <div
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${colors.bg} ${colors.text}`}
    >
      <span>{icon}</span>
      <span className="font-medium">{riskLabels[securityData.overallRisk]}</span>
    </div>
  );
}

export default TokenSafetyBadges;
