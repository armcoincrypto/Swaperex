/**
 * P5A — Display helpers for operator intelligence (no secrets).
 */

export function formatWeiShort(wei: string | number | null | undefined): string {
  if (wei == null) return '—';
  const s = String(wei).trim();
  if (!s || !/^\d+$/.test(s)) return s || '—';
  const n = BigInt(s);
  if (n === 0n) return '0';
  const digits = s.length;
  if (digits <= 6) return s;
  if (digits <= 12) return `${s.slice(0, 4)}…${s.slice(-3)}`;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function formatPct(val: number | null | undefined): string {
  if (val == null || Number.isNaN(val)) return '—';
  return `${val.toFixed(1)}%`;
}

export function chainLabel(chainId: number | null | undefined): string {
  if (chainId === 1) return 'Ethereum';
  if (chainId === 56) return 'BNB Chain';
  if (chainId === 137) return 'Polygon';
  if (chainId === 42161) return 'Arbitrum';
  if (chainId === 10) return 'Optimism';
  if (chainId === 43114) return 'Avalanche';
  return chainId != null ? `Chain ${chainId}` : '—';
}

export function severityClass(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-red-400 border-red-800/50 bg-red-950/30';
    case 'warning':
      return 'text-amber-300 border-amber-800/50 bg-amber-950/25';
    default:
      return 'text-cyan-200 border-cyan-900/40 bg-cyan-950/20';
  }
}

export function recommendationClass(rec: string): string {
  switch (rec) {
    case 'promote':
      return 'text-emerald-300';
    case 'demote':
      return 'text-red-300';
    case 'keep':
      return 'text-cyan-200';
    default:
      return 'text-dark-300';
  }
}

export function statusLevelClass(level: string): string {
  switch (level) {
    case 'green':
      return 'text-emerald-300 border-emerald-800/50 bg-emerald-950/25';
    case 'yellow':
      return 'text-amber-300 border-amber-800/50 bg-amber-950/25';
    case 'red':
      return 'text-red-300 border-red-800/50 bg-red-950/30';
    case 'insufficient_data':
      return 'text-slate-300 border-slate-700/60 bg-slate-900/50';
    default:
      return 'text-dark-300 border-dark-700 bg-dark-900/40';
  }
}

export function confidenceClass(confidence: string): string {
  switch (confidence) {
    case 'high':
      return 'text-emerald-300';
    case 'medium':
      return 'text-cyan-200';
    case 'low':
      return 'text-amber-200';
    case 'insufficient':
      return 'text-dark-500';
    default:
      return 'text-dark-400';
  }
}

export function priorityClass(priority: string): string {
  switch (priority) {
    case 'high':
      return 'text-red-300';
    case 'medium':
      return 'text-amber-200';
    default:
      return 'text-dark-400';
  }
}

export function healthScoreClass(score: number): string {
  if (score >= 80) return 'text-emerald-300';
  if (score >= 60) return 'text-amber-200';
  return 'text-red-300';
}

export function formatDeltaPct(val: number | null | undefined): string {
  if (val == null || Number.isNaN(val)) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}
