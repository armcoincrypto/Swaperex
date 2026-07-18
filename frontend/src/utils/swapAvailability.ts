/**
 * UI swap-availability helpers derived from commissionCoverage / commissionRoutePolicy.
 * Do not maintain a second route catalog here.
 */

import {
  COMMISSION_AUDIT_BLOCKED_PAIR_KEYS,
  COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS,
  commissionPairKey,
} from '@/constants/commissionCoverage';
import { isCommissionSwapChain } from '@/constants/commissionChains';
import { NATIVE_SYMBOLS } from '@/tokens';
import {
  explainCommissionRouteDenial,
  getCertifiedCommissionRoute,
  isCommissionRouteCertified,
  resolveCommissionTokenIdentity,
  type CertifiedCommissionRoute,
  type CommissionRouteDenialReason,
  type CommissionTokenRef,
} from '@/utils/commissionRoutePolicy';

export type SwapAvailabilityStatus =
  | 'executable'
  | 'view_only'
  | 'policy_blocked'
  | 'unsupported';

export type SwapAvailability = {
  status: SwapAvailabilityStatus;
  reason?: CommissionRouteDenialReason | string;
  preferredCounterpart?: string;
  route?: CertifiedCommissionRoute | null;
};

const HUB_PRIORITY = ['USDT', 'USDC', 'DAI', 'WBTC', 'BTCB', 'CAKE', 'ETH', 'BNB', 'WETH'] as const;

function asTokenRef(token: CommissionTokenRef | string): CommissionTokenRef {
  return typeof token === 'string' ? { symbol: token } : token;
}

/** All certified directional routes involving a token on a chain. */
export function getCertifiedRoutesForToken(input: {
  chainId: number;
  token: CommissionTokenRef | string;
}): CertifiedCommissionRoute[] {
  if (!isCommissionSwapChain(input.chainId)) return [];
  const identity = resolveCommissionTokenIdentity(input.chainId, asTokenRef(input.token));
  if (!identity) return [];

  const out: CertifiedCommissionRoute[] = [];
  for (const key of COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS) {
    if (!key.startsWith(`${input.chainId}|`)) continue;
    const parts = key.split('|');
    if (parts.length !== 3) continue;
    const [, from, to] = parts;
    if (from !== identity.symbol && to !== identity.symbol) continue;
    if (COMMISSION_AUDIT_BLOCKED_PAIR_KEYS.has(key)) continue;
    const route = getCertifiedCommissionRoute({
      chainId: input.chainId,
      tokenIn: from,
      tokenOut: to,
    });
    if (route) out.push(route);
  }
  return out;
}

export function hasAnyCertifiedSwapRoute(input: {
  chainId: number;
  token: CommissionTokenRef | string;
}): boolean {
  return getCertifiedRoutesForToken(input).length > 0;
}

/**
 * Prefer USDT/USDC hubs, then other certified counterparts.
 * Never returns a wrap/unwrap counterpart for native↔wrapped.
 */
export function selectPreferredCertifiedCounterpart(input: {
  chainId: number;
  token: CommissionTokenRef | string;
}): string | null {
  const identity = resolveCommissionTokenIdentity(input.chainId, asTokenRef(input.token));
  if (!identity) return null;
  const routes = getCertifiedRoutesForToken(input);
  if (routes.length === 0) return null;

  const counterparts = new Set<string>();
  for (const route of routes) {
    if (route.tokenIn.symbol === identity.symbol) counterparts.add(route.tokenOut.symbol);
    if (route.tokenOut.symbol === identity.symbol) counterparts.add(route.tokenIn.symbol);
  }

  const native = (NATIVE_SYMBOLS[input.chainId] || '').toUpperCase();
  // Prefer selling the selected token into hubs first (token → hub).
  for (const hub of HUB_PRIORITY) {
    if (hub === identity.symbol) continue;
    if (identity.isNative && hub === (input.chainId === 1 ? 'WETH' : input.chainId === 56 ? 'WBNB' : '')) {
      continue;
    }
    if (
      counterparts.has(hub) &&
      isCommissionRouteCertified({
        chainId: input.chainId,
        tokenIn: identity.symbol,
        tokenOut: hub,
      })
    ) {
      return hub;
    }
  }
  // Native hub next if certified as output
  if (
    native &&
    native !== identity.symbol &&
    counterparts.has(native) &&
    isCommissionRouteCertified({
      chainId: input.chainId,
      tokenIn: identity.symbol,
      tokenOut: native,
    })
  ) {
    return native;
  }
  // Any certified forward direction
  for (const c of counterparts) {
    if (
      isCommissionRouteCertified({
        chainId: input.chainId,
        tokenIn: identity.symbol,
        tokenOut: c,
      })
    ) {
      return c;
    }
  }
  // Fall back to reverse-only (buy token with hub)
  for (const hub of HUB_PRIORITY) {
    if (hub === identity.symbol) continue;
    if (
      counterparts.has(hub) &&
      isCommissionRouteCertified({
        chainId: input.chainId,
        tokenIn: hub,
        tokenOut: identity.symbol,
      })
    ) {
      return hub;
    }
  }
  return [...counterparts][0] ?? null;
}

export function buildCertifiedSwapNavigation(input: {
  chainId: number;
  token: CommissionTokenRef | string;
}): { chainId: number; fromSymbol: string; toSymbol: string } | null {
  const identity = resolveCommissionTokenIdentity(input.chainId, asTokenRef(input.token));
  if (!identity) return null;
  const counterpart = selectPreferredCertifiedCounterpart(input);
  if (!counterpart) return null;

  if (
    isCommissionRouteCertified({
      chainId: input.chainId,
      tokenIn: identity.symbol,
      tokenOut: counterpart,
    })
  ) {
    return { chainId: input.chainId, fromSymbol: identity.symbol, toSymbol: counterpart };
  }
  if (
    isCommissionRouteCertified({
      chainId: input.chainId,
      tokenIn: counterpart,
      tokenOut: identity.symbol,
    })
  ) {
    return { chainId: input.chainId, fromSymbol: counterpart, toSymbol: identity.symbol };
  }
  return null;
}

export function getSwapAvailability(input: {
  chainId: number;
  tokenIn?: CommissionTokenRef | string | null;
  tokenOut?: CommissionTokenRef | string | null;
}): SwapAvailability {
  if (!Number.isFinite(input.chainId) || input.chainId <= 0) {
    return { status: 'unsupported', reason: 'unknown_chain' };
  }
  if (!isCommissionSwapChain(input.chainId)) {
    return { status: 'view_only', reason: 'unknown_chain' };
  }

  const hasIn = input.tokenIn != null && String(input.tokenIn).length > 0;
  const hasOut = input.tokenOut != null && String(input.tokenOut).length > 0;

  if (hasIn && hasOut) {
    const route = getCertifiedCommissionRoute({
      chainId: input.chainId,
      tokenIn: asTokenRef(input.tokenIn as CommissionTokenRef | string),
      tokenOut: asTokenRef(input.tokenOut as CommissionTokenRef | string),
    });
    if (route) return { status: 'executable', route };
    const reason = explainCommissionRouteDenial({
      chainId: input.chainId,
      tokenIn: asTokenRef(input.tokenIn as CommissionTokenRef | string),
      tokenOut: asTokenRef(input.tokenOut as CommissionTokenRef | string),
    });
    if (reason === 'policy_blocked' || reason === 'wrapped_native_endpoint_blocked') {
      return { status: 'policy_blocked', reason };
    }
    if (reason === 'wrap_unwrap_not_supported') {
      return { status: 'unsupported', reason };
    }
    return { status: 'unsupported', reason };
  }

  if (hasIn || hasOut) {
    const token = (hasIn ? input.tokenIn : input.tokenOut) as CommissionTokenRef | string;
    const identity = resolveCommissionTokenIdentity(input.chainId, asTokenRef(token));
    if (!identity) return { status: 'unsupported', reason: 'unresolved_token_identity' };

    // Explicit block involving this symbol on this chain
    for (const key of COMMISSION_AUDIT_BLOCKED_PAIR_KEYS) {
      if (!key.startsWith(`${input.chainId}|`)) continue;
      const [, a, b] = key.split('|');
      if (a === identity.symbol || b === identity.symbol) {
        // Only treat as policy_blocked when every possible route is blocked / none certified
        if (!hasAnyCertifiedSwapRoute({ chainId: input.chainId, token })) {
          return {
            status: 'policy_blocked',
            reason:
              a === 'WBNB' || b === 'WBNB'
                ? 'wrapped_native_endpoint_blocked'
                : 'policy_blocked',
          };
        }
      }
    }

    const preferred = selectPreferredCertifiedCounterpart({ chainId: input.chainId, token });
    if (preferred) {
      return {
        status: 'executable',
        preferredCounterpart: preferred,
        route: getCertifiedCommissionRoute({
          chainId: input.chainId,
          tokenIn: identity.symbol,
          tokenOut: preferred,
        }),
      };
    }
    return { status: 'unsupported', reason: 'not_certified' };
  }

  return { status: 'unsupported', reason: 'unresolved_token_identity' };
}

/** True when a Markets/Portfolio Swap CTA may navigate. */
export function isExecutableSwapCta(input: {
  chainId: number;
  token: CommissionTokenRef | string;
}): boolean {
  return getSwapAvailability({ chainId: input.chainId, tokenIn: input.token }).status === 'executable';
}

export function swapAvailabilityLabel(status: SwapAvailabilityStatus): string {
  switch (status) {
    case 'executable':
      return 'Swap';
    case 'view_only':
      return 'View only';
    case 'policy_blocked':
      return 'Swap unavailable';
    default:
      return 'Swap unavailable';
  }
}

/** Stable pair key helper for audits. */
export function certifiedPairKey(chainId: number, from: string, to: string): string {
  return commissionPairKey(chainId, from, to);
}
