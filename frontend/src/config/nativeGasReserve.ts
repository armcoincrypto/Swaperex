/**
 * P18 — Canonical native-gas fallback reserves (one source; used by safe MAX / affordability).
 * Prefer live fee estimates when available; these backups apply when gas price is unavailable.
 */

/** Conservative native-token reserve when live gas price cannot be read. */
export const NATIVE_GAS_FALLBACK_RESERVE: Readonly<Record<number, number>> = {
  1: 0.005, // ETH
  56: 0.002, // BNB
  137: 0.5, // MATIC
  42161: 0.0005, // Arbitrum ETH
  10: 0.0005, // Optimism ETH
  43114: 0.05, // AVAX
  100: 0.1, // xDAI
  250: 0.5, // FTM
  8453: 0.0005, // Base ETH
};

export const DEFAULT_NATIVE_GAS_FALLBACK_RESERVE = 0.005;

/** Extra margin applied on top of a live fee estimate (fraction of fee). */
export const LIVE_FEE_SAFETY_MARGIN = 0.25;

/** Assumed approval gas units when ERC-20 allowance is required and quote lacks a separate estimate. */
export const APPROVAL_GAS_UNITS_FALLBACK = 65_000n;

export function getNativeGasFallbackReserve(chainId: number): number {
  return NATIVE_GAS_FALLBACK_RESERVE[chainId] ?? DEFAULT_NATIVE_GAS_FALLBACK_RESERVE;
}
