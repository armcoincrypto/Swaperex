/**
 * Pure portfolio intelligence model — derived from balance rows only.
 * No PnL, APY, or external telemetry. Presentation-safe.
 */

import type { Portfolio, PortfolioChain, TokenBalance } from '@/services/portfolioTypes';
import {
  flattenPortfolioTokens,
  filterSmallBalances,
  filterZeroBalances,
  getChainTotals,
  getPortfolioChainLabel,
} from '@/stores/portfolioStore';

export const STABLECOIN_SYMBOLS = new Set([
  'USDT',
  'USDC',
  'BUSD',
  'DAI',
  'FDUSD',
  'TUSD',
  'USDP',
]);

export type RiskLabel = 'Low risk estimate' | 'Moderate risk estimate' | 'High risk estimate';
export type DiversificationLabel = 'Strong' | 'Moderate' | 'Limited' | 'Concentrated';
export type WalletHealthLabel = 'Strong' | 'Balanced' | 'Concentrated' | 'Needs review';

export interface AssetAllocation {
  symbol: string;
  usdValue: number;
  percent: number;
  isStablecoin: boolean;
}

export interface ChainAllocation {
  chain: PortfolioChain;
  label: string;
  usdValue: number;
  percent: number;
}

export interface LargestPosition {
  symbol: string;
  usdValue: number;
  percent: number;
}

export type ReviewPrioritySeverity = 'info' | 'attention' | 'review';

export interface ReviewPriority {
  id: string;
  label: string;
  detail: string;
  severity: ReviewPrioritySeverity;
}

export interface CompositionBucket {
  id: 'stablecoins' | 'major' | 'longtail' | 'zero';
  label: string;
  count: number;
  usdValue: number;
  percent: number;
  /** Up to 4 symbols for compact display */
  previewSymbols: string[];
}

export interface PortfolioIntelligenceInput {
  portfolio: Portfolio | null;
  hideSmallBalances?: boolean;
  smallBalanceThreshold?: number;
  hideZeroBalances?: boolean;
  radarUnreadCount?: number;
  watchlistCount?: number;
}

export interface PortfolioIntelligenceModel {
  totalValueUsd: number;
  assetCount: number;
  chainCount: number;
  largestPosition: LargestPosition | null;
  largestPositionPercent: number;
  largestChain: ChainAllocation | null;
  largestChainPercent: number;
  stablecoinExposurePercent: number;
  topAssets: AssetAllocation[];
  chainAllocations: ChainAllocation[];
  diversificationLabel: DiversificationLabel;
  riskLabel: RiskLabel;
  walletHealthScore: number;
  walletHealthLabel: WalletHealthLabel;
  isSmallPortfolio: boolean;
  hasPositions: boolean;
  reviewPriorities: ReviewPriority[];
  composition: CompositionBucket[];
  zeroValueAssetCount: number;
}

const SMALL_PORTFOLIO_USD = 25;

function parseUsd(value: string | null | undefined): number {
  const n = parseFloat(value || '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isStablecoin(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.has(symbol.trim().toUpperCase());
}

function visibleTokens(input: PortfolioIntelligenceInput): TokenBalance[] {
  if (!input.portfolio) return [];
  let tokens = flattenPortfolioTokens(input.portfolio);
  tokens = filterZeroBalances(tokens, input.hideZeroBalances ?? true);
  tokens = filterSmallBalances(
    tokens,
    input.smallBalanceThreshold ?? 1,
    input.hideSmallBalances ?? false,
  );
  return tokens.filter((t) => parseUsd(t.usdValue) > 0 || parseFloat(t.balanceFormatted || '0') > 0);
}

function aggregateBySymbol(tokens: TokenBalance[]): Map<string, { usd: number; stable: boolean }> {
  const map = new Map<string, { usd: number; stable: boolean }>();
  for (const t of tokens) {
    const usd = parseUsd(t.usdValue);
    if (usd <= 0) continue;
    const sym = t.symbol.trim().toUpperCase();
    const prev = map.get(sym);
    map.set(sym, {
      usd: (prev?.usd ?? 0) + usd,
      stable: isStablecoin(sym),
    });
  }
  return map;
}

function buildTopAssets(
  symbolMap: Map<string, { usd: number; stable: boolean }>,
  totalUsd: number,
  limit = 5,
): AssetAllocation[] {
  const rows = [...symbolMap.entries()]
    .map(([symbol, { usd, stable }]) => ({
      symbol,
      usdValue: usd,
      percent: totalUsd > 0 ? (usd / totalUsd) * 100 : 0,
      isStablecoin: stable,
    }))
    .sort((a, b) => b.usdValue - a.usdValue);

  if (rows.length <= limit) {
    return rows.map((r) => ({ ...r, isStablecoin: r.isStablecoin }));
  }

  const top = rows.slice(0, limit - 1);
  const otherUsd = rows.slice(limit - 1).reduce((s, r) => s + r.usdValue, 0);
  return [
    ...top.map((r) => ({ symbol: r.symbol, usdValue: r.usdValue, percent: r.percent, isStablecoin: r.isStablecoin })),
    {
      symbol: 'Other',
      usdValue: otherUsd,
      percent: totalUsd > 0 ? (otherUsd / totalUsd) * 100 : 0,
      isStablecoin: false,
    },
  ];
}

function buildChainAllocations(portfolio: Portfolio | null, totalUsd: number): ChainAllocation[] {
  if (!portfolio) return [];
  const totals = getChainTotals(portfolio);
  return (Object.entries(totals) as [PortfolioChain, { total: number; label: string }][])
    .map(([chain, { total, label }]) => ({
      chain,
      label,
      usdValue: total,
      percent: totalUsd > 0 ? (total / totalUsd) * 100 : 0,
    }))
    .sort((a, b) => b.usdValue - a.usdValue);
}

function diversificationLabel(
  assetCount: number,
  chainCount: number,
  largestPercent: number,
): DiversificationLabel {
  if (assetCount <= 1 || largestPercent >= 85) return 'Concentrated';
  if (assetCount >= 8 && chainCount >= 2 && largestPercent < 40) return 'Strong';
  if (assetCount >= 4 || chainCount >= 2) return 'Moderate';
  return 'Limited';
}

function riskLabel(
  largestPercent: number,
  assetCount: number,
  chainCount: number,
  stablePercent: number,
): RiskLabel {
  if (largestPercent > 75 || (assetCount <= 2 && stablePercent < 20)) {
    return 'High risk estimate';
  }
  if (largestPercent > 50 || chainCount <= 1 || assetCount < 4) {
    return 'Moderate risk estimate';
  }
  return 'Low risk estimate';
}

function walletHealthScore(
  largestPercent: number,
  assetCount: number,
  chainCount: number,
  stablePercent: number,
): number {
  let score = 100;

  if (largestPercent > 75) score -= 30;
  else if (largestPercent > 50) score -= 15;
  else if (largestPercent > 35) score -= 5;

  if (assetCount < 3) score -= 15;
  else if (assetCount < 6) score -= 5;

  if (chainCount <= 1 && assetCount > 0) score -= 10;

  if (stablePercent > 50) score += 10;
  else if (stablePercent > 30) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function walletHealthLabel(score: number): WalletHealthLabel {
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Balanced';
  if (score >= 40) return 'Concentrated';
  return 'Needs review';
}

const MAJOR_ASSET_PERCENT = 5;
const MAJOR_ASSET_TOP_N = 3;
const LOW_STABLE_THRESHOLD = 15;
const HIGH_CONCENTRATION_THRESHOLD = 50;
const SINGLE_CHAIN_THRESHOLD = 80;

function countZeroValueAssets(portfolio: Portfolio | null): number {
  if (!portfolio) return 0;
  const tokens = flattenPortfolioTokens(portfolio);
  return tokens.filter((t) => {
    const usd = parseUsd(t.usdValue);
    const bal = parseFloat(t.balanceFormatted || t.balance || '0');
    return usd <= 0 && bal > 0;
  }).length;
}

function buildCompositionBuckets(
  symbolMap: Map<string, { usd: number; stable: boolean }>,
  zeroValueCount: number,
  totalUsd: number,
): CompositionBucket[] {
  const stableRows: Array<{ symbol: string; usd: number }> = [];
  const volatileRows: Array<{ symbol: string; usd: number; percent: number }> = [];

  for (const [symbol, { usd, stable }] of symbolMap) {
    if (usd <= 0) continue;
    if (stable) {
      stableRows.push({ symbol, usd });
    } else {
      volatileRows.push({
        symbol,
        usd,
        percent: totalUsd > 0 ? (usd / totalUsd) * 100 : 0,
      });
    }
  }

  volatileRows.sort((a, b) => b.usd - a.usd);
  const majorSymbols = new Set<string>();
  volatileRows.slice(0, MAJOR_ASSET_TOP_N).forEach((r) => majorSymbols.add(r.symbol));
  for (const r of volatileRows) {
    if (r.percent >= MAJOR_ASSET_PERCENT) majorSymbols.add(r.symbol);
  }

  const majorRows = volatileRows.filter((r) => majorSymbols.has(r.symbol));
  const longtailRows = volatileRows.filter((r) => !majorSymbols.has(r.symbol));

  const sumUsd = (rows: Array<{ usd: number }>) => rows.reduce((s, r) => s + r.usd, 0);

  const stableUsd = sumUsd(stableRows);
  const majorUsd = sumUsd(majorRows);
  const longtailUsd = sumUsd(longtailRows);

  const buckets: CompositionBucket[] = [
    {
      id: 'stablecoins',
      label: 'Stablecoins',
      count: stableRows.length,
      usdValue: stableUsd,
      percent: totalUsd > 0 ? (stableUsd / totalUsd) * 100 : 0,
      previewSymbols: stableRows.sort((a, b) => b.usd - a.usd).slice(0, 4).map((r) => r.symbol),
    },
    {
      id: 'major',
      label: 'Major assets',
      count: majorRows.length,
      usdValue: majorUsd,
      percent: totalUsd > 0 ? (majorUsd / totalUsd) * 100 : 0,
      previewSymbols: majorRows.slice(0, 4).map((r) => r.symbol),
    },
    {
      id: 'longtail',
      label: 'Long-tail assets',
      count: longtailRows.length,
      usdValue: longtailUsd,
      percent: totalUsd > 0 ? (longtailUsd / totalUsd) * 100 : 0,
      previewSymbols: longtailRows.slice(0, 4).map((r) => r.symbol),
    },
  ];

  if (zeroValueCount > 0) {
    buckets.push({
      id: 'zero',
      label: 'Zero-value balances',
      count: zeroValueCount,
      usdValue: 0,
      percent: 0,
      previewSymbols: [],
    });
  }

  return buckets;
}

function buildReviewPriorities(
  model: Pick<
    PortfolioIntelligenceModel,
    | 'largestPositionPercent'
    | 'largestPosition'
    | 'chainCount'
    | 'largestChain'
    | 'largestChainPercent'
    | 'stablecoinExposurePercent'
    | 'totalValueUsd'
    | 'hasPositions'
    | 'diversificationLabel'
  >,
  radarUnreadCount: number,
  watchlistCount: number,
): ReviewPriority[] {
  const items: ReviewPriority[] = [];

  if (!model.hasPositions) {
    return [
      {
        id: 'empty',
        label: 'No visible positions',
        detail: 'Portfolio intelligence appears after balances load.',
        severity: 'info',
      },
    ];
  }

  if (model.largestPositionPercent >= HIGH_CONCENTRATION_THRESHOLD && model.largestPosition) {
    items.push({
      id: 'concentration',
      label: 'High concentration',
      detail: `${model.largestPosition.symbol} is ${Math.round(model.largestPositionPercent)}% of visible value — consider rebalancing.`,
      severity: model.largestPositionPercent >= 75 ? 'review' : 'attention',
    });
  }

  if (
    model.chainCount <= 1 &&
    model.largestChain &&
    model.largestChainPercent >= SINGLE_CHAIN_THRESHOLD
  ) {
    items.push({
      id: 'single-chain',
      label: 'Single-chain exposure',
      detail: `${model.largestChain.label} holds ${Math.round(model.largestChainPercent)}% of wallet value.`,
      severity: 'attention',
    });
  }

  if (
    model.totalValueUsd > 0 &&
    model.stablecoinExposurePercent < LOW_STABLE_THRESHOLD
  ) {
    items.push({
      id: 'low-stable',
      label: 'Low stablecoin cushion',
      detail: `Only ${Math.round(model.stablecoinExposurePercent)}% in stables — mostly volatile exposure.`,
      severity: 'attention',
    });
  }

  if (radarUnreadCount > 0) {
    items.push({
      id: 'radar-alerts',
      label: 'Radar alerts pending',
      detail: `${radarUnreadCount} unread local alert${radarUnreadCount !== 1 ? 's' : ''} on this device — review on Radar.`,
      severity: 'review',
    });
  } else if (watchlistCount === 0) {
    items.push({
      id: 'watchlist',
      label: 'Radar watchlist empty',
      detail: 'Add tokens to Radar watchlist for local safety monitoring.',
      severity: 'info',
    });
  } else {
    items.push({
      id: 'watchlist-ok',
      label: 'Radar monitoring active',
      detail: `${watchlistCount} token${watchlistCount !== 1 ? 's' : ''} on local watchlist — no unread alerts.`,
      severity: 'info',
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'balanced',
      label: 'Portfolio looks balanced',
      detail: `${model.diversificationLabel} diversification based on current visible balances.`,
      severity: 'info',
    });
  }

  return items;
}

export function buildPortfolioIntelligence(
  input: PortfolioIntelligenceInput,
): PortfolioIntelligenceModel {
  const tokens = visibleTokens(input);
  const totalValueUsd = parseFloat(input.portfolio?.totalUsdValue || '0') || 0;
  const symbolMap = aggregateBySymbol(tokens);
  const assetCount = symbolMap.size;

  const chainAllocations = buildChainAllocations(input.portfolio, totalValueUsd);
  const chainCount = chainAllocations.filter((c) => c.usdValue > 0).length;

  const topAssets = buildTopAssets(symbolMap, totalValueUsd);
  const largestPosition = topAssets[0] && topAssets[0].symbol !== 'Other'
    ? {
        symbol: topAssets[0].symbol,
        usdValue: topAssets[0].usdValue,
        percent: topAssets[0].percent,
      }
    : null;
  const largestPositionPercent = largestPosition?.percent ?? 0;

  const largestChain = chainAllocations[0] ?? null;
  const largestChainPercent = largestChain?.percent ?? 0;

  let stableUsd = 0;
  for (const [, { usd, stable }] of symbolMap) {
    if (stable) stableUsd += usd;
  }
  const stablecoinExposurePercent = totalValueUsd > 0 ? (stableUsd / totalValueUsd) * 100 : 0;

  const divLabel = diversificationLabel(assetCount, chainCount, largestPositionPercent);
  const risk = riskLabel(largestPositionPercent, assetCount, chainCount, stablecoinExposurePercent);
  const healthScore = walletHealthScore(
    largestPositionPercent,
    assetCount,
    chainCount,
    stablecoinExposurePercent,
  );

  const zeroValueAssetCount = countZeroValueAssets(input.portfolio);
  const composition = buildCompositionBuckets(symbolMap, zeroValueAssetCount, totalValueUsd);

  const partial = {
    totalValueUsd,
    assetCount,
    chainCount,
    largestPosition,
    largestPositionPercent,
    largestChain,
    largestChainPercent,
    stablecoinExposurePercent,
    topAssets,
    chainAllocations,
    diversificationLabel: divLabel,
    riskLabel: risk,
    walletHealthScore: healthScore,
    walletHealthLabel: walletHealthLabel(healthScore),
    isSmallPortfolio: totalValueUsd > 0 && totalValueUsd < SMALL_PORTFOLIO_USD,
    hasPositions: assetCount > 0 && totalValueUsd > 0,
    zeroValueAssetCount,
    composition,
  };

  const reviewPriorities = buildReviewPriorities(
    partial,
    input.radarUnreadCount ?? 0,
    input.watchlistCount ?? 0,
  );

  return {
    ...partial,
    reviewPriorities,
  };
}

/** Format percent for display (1 decimal under 10%, else integer). */
export function formatPercent(value: number, privacyMode: boolean): string {
  if (privacyMode) return '**%';
  if (!Number.isFinite(value) || value <= 0) return '0%';
  if (value < 10) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

export function formatIntelligenceChainLabel(chain: PortfolioChain): string {
  return getPortfolioChainLabel(chain);
}
