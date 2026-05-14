/**
 * P4.2 — Heuristic categories for commission-wrapper quote failures (telemetry / admin only).
 * Not an execution guarantee; used to prioritize coverage work.
 */

export type WrapperQuoteDiagnosticCategory =
  | 'no_pool'
  | 'low_liquidity'
  | 'unsupported_path'
  | 'amount_too_small'
  | 'provider_error'
  | 'wrapper_config_missing'
  | 'unknown';

const norm = (s: string) => s.toLowerCase();

/**
 * Classify a raw wrapper / RPC error string into a coarse diagnostic bucket.
 */
export function classifyWrapperQuoteFailure(raw: string | undefined | null): WrapperQuoteDiagnosticCategory {
  const m = norm(raw || '');
  if (!m) return 'unknown';

  if (
    m.includes('not enabled') ||
    m.includes('not configured') ||
    m.includes('missing') ||
    m.includes('v2_disabled') ||
    m.includes('wrapper address')
  ) {
    return 'wrapper_config_missing';
  }

  if (
    m.includes('timeout') ||
    m.includes('network') ||
    m.includes('fetch failed') ||
    m.includes('failed to fetch') ||
    m.includes('429') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('504') ||
    m.includes('rate limit') ||
    m.includes('too many requests') ||
    m.includes('rpc') ||
    m.includes('internal json-rpc')
  ) {
    return 'provider_error';
  }

  if (
    m.includes('amount too small') ||
    m.includes('too small') ||
    m.includes('insufficient input') ||
    (m.includes('zero') && m.includes('amount'))
  ) {
    return 'amount_too_small';
  }

  if (
    (m.includes('no valid') && m.includes('pool')) ||
    m.includes('no pool') ||
    m.includes('wrapper quote unavailable') ||
    m.includes('no uniswap wrapper v2 quote') ||
    m.includes('no pancake wrapper v2 quote') ||
    m.includes('execution reverted') && (m.includes('pool') || m.includes('swap'))
  ) {
    return 'no_pool';
  }

  if (
    m.includes('liquidity') ||
    m.includes('slippage') ||
    m.includes('sqrtprice') ||
    m.includes('price impact') ||
    m.includes('spl')
  ) {
    return 'low_liquidity';
  }

  if (
    m.includes('not support') ||
    m.includes('unsupported') ||
    m.includes('ineligible') ||
    m.includes('native') && m.includes('not')
  ) {
    return 'unsupported_path';
  }

  return 'unknown';
}
