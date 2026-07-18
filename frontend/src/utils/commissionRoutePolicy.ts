/**
 * Canonical commission-route execution policy.
 *
 * `commissionCoverage.ts` remains the single catalog. This module resolves
 * token identity (chain + native sentinel / ERC-20 address) and decides whether
 * a directional pair may quote or execute under `VITE_COMMISSION_REQUIRED`.
 *
 * Fail closed: unknown chain, unresolved identity, wrap/unwrap pairs, blocked
 * pairs, and pairs absent from the certified set are not executable.
 */

import {
  COMMISSION_AUDIT_BLOCKED_PAIR_KEYS,
  COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS,
  COMMISSION_COVERAGE_AUDIT_AT,
  commissionPairKey,
} from '@/constants/commissionCoverage';
import { COMMISSION_SWAP_CHAIN_IDS } from '@/constants/commissionChains';
import {
  NATIVE_SYMBOLS,
  NATIVE_TOKEN_ADDRESS,
  WRAPPED_NATIVE_ADDRESSES,
  getTokenByAddress,
  getTokenBySymbol,
  isNativeToken,
} from '@/tokens';

export type CommissionRouteDenialReason =
  | 'not_certified'
  | 'policy_blocked'
  | 'wrapped_native_endpoint_blocked'
  | 'wrap_unwrap_not_supported'
  | 'unknown_chain'
  | 'unresolved_token_identity'
  | 'missing_coverage_registry'
  | 'native_wrapped_mismatch';

export type CommissionTokenRef = {
  symbol?: string | null;
  address?: string | null;
  contract_address?: string | null;
  is_native?: boolean | null;
  isNative?: boolean | null;
};

export type NormalizedCommissionToken = {
  /** Canonical catalog symbol (ETH/BNB for native; never WETH/WBNB for native legs). */
  symbol: string;
  /** Native sentinel or checksum-insensitive lowercase ERC-20 address. */
  address: string;
  isNative: boolean;
};

export type CertifiedCommissionRoute = {
  chainId: number;
  tokenIn: NormalizedCommissionToken;
  tokenOut: NormalizedCommissionToken;
  pairKey: string;
  auditAt: string;
  direction: 'native-to-token' | 'token-to-native' | 'token-to-token';
  fingerprint: string;
};

export type CommissionRouteLookupInput = {
  chainId: number;
  tokenIn: CommissionTokenRef | string;
  tokenOut: CommissionTokenRef | string;
};

function normSym(s: string): string {
  return s.trim().toUpperCase();
}

function asRef(input: CommissionTokenRef | string): CommissionTokenRef {
  if (typeof input === 'string') return { symbol: input };
  return input;
}

function rawAddress(ref: CommissionTokenRef): string | null {
  const a = (ref.address || ref.contract_address || '').trim();
  return a ? a : null;
}

function wrappedNativeSymbol(chainId: number): string | null {
  if (chainId === 1) return 'WETH';
  if (chainId === 56) return 'WBNB';
  return null;
}

function isCommissionSwapChain(chainId: number): boolean {
  return (COMMISSION_SWAP_CHAIN_IDS as readonly number[]).includes(chainId);
}

/**
 * Resolve a UI/token ref to a catalog identity. Prefer address over symbol.
 * Native and wrapped-native remain distinct — never rewrite ETH↔WETH / BNB↔WBNB.
 */
export function resolveCommissionTokenIdentity(
  chainId: number,
  input: CommissionTokenRef | string,
): NormalizedCommissionToken | null {
  if (!Number.isFinite(chainId) || chainId <= 0) return null;
  const ref = asRef(input);
  const addrRaw = rawAddress(ref);
  const symHint = ref.symbol ? normSym(ref.symbol) : '';
  const nativeSym = normSym(NATIVE_SYMBOLS[chainId] || '');
  const wrappedSym = wrappedNativeSymbol(chainId);
  const wrappedAddr = (WRAPPED_NATIVE_ADDRESSES[chainId] || '').toLowerCase();
  const flaggedNative = ref.is_native === true || ref.isNative === true;

  if (addrRaw && isNativeToken(addrRaw)) {
    if (!nativeSym) return null;
    if (symHint && wrappedSym && symHint === wrappedSym) return null;
    return {
      symbol: nativeSym,
      address: NATIVE_TOKEN_ADDRESS.toLowerCase(),
      isNative: true,
    };
  }

  if (addrRaw) {
    const lower = addrRaw.toLowerCase();
    if (wrappedAddr && lower === wrappedAddr) {
      if (!wrappedSym) return null;
      if (symHint && nativeSym && symHint === nativeSym) return null;
      const byAddr = getTokenByAddress(addrRaw, chainId);
      return {
        symbol: byAddr?.symbol ? normSym(byAddr.symbol) : wrappedSym,
        address: lower,
        isNative: false,
      };
    }
    const byAddr = getTokenByAddress(addrRaw, chainId);
    if (!byAddr) return null;
    const sym = normSym(byAddr.symbol);
    if (isNativeToken(byAddr.address)) {
      return {
        symbol: nativeSym || sym,
        address: NATIVE_TOKEN_ADDRESS.toLowerCase(),
        isNative: true,
      };
    }
    return { symbol: sym, address: byAddr.address.toLowerCase(), isNative: false };
  }

  if (flaggedNative || (symHint && nativeSym && symHint === nativeSym)) {
    if (!nativeSym) return null;
    return {
      symbol: nativeSym,
      address: NATIVE_TOKEN_ADDRESS.toLowerCase(),
      isNative: true,
    };
  }

  if (!symHint) return null;
  const bySym = getTokenBySymbol(symHint, chainId);
  if (!bySym) return null;
  if (isNativeToken(bySym.address)) {
    return {
      symbol: nativeSym || symHint,
      address: NATIVE_TOKEN_ADDRESS.toLowerCase(),
      isNative: true,
    };
  }
  return {
    symbol: normSym(bySym.symbol),
    address: bySym.address.toLowerCase(),
    isNative: false,
  };
}

function isWrapUnwrapPair(a: NormalizedCommissionToken, b: NormalizedCommissionToken, chainId: number): boolean {
  const wrappedSym = wrappedNativeSymbol(chainId);
  if (!wrappedSym) return false;
  return (
    (a.isNative && !b.isNative && b.symbol === wrappedSym) ||
    (b.isNative && !a.isNative && a.symbol === wrappedSym)
  );
}

function denialForBlockedKey(pairKey: string): CommissionRouteDenialReason {
  if (pairKey.includes('|WBNB|') || pairKey.includes('|WBNB')) {
    return 'wrapped_native_endpoint_blocked';
  }
  if (pairKey.startsWith('56|') && (pairKey.includes('|WBNB|') || pairKey.endsWith('|WBNB'))) {
    return 'wrapped_native_endpoint_blocked';
  }
  // Catch WBNB in either position
  const parts = pairKey.split('|');
  if (parts[1] === 'WBNB' || parts[2] === 'WBNB') return 'wrapped_native_endpoint_blocked';
  return 'policy_blocked';
}

function coverageRegistryPresent(): boolean {
  return (
    COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS instanceof Set &&
    COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.size > 0
  );
}

function routeDirection(
  tokenIn: NormalizedCommissionToken,
  tokenOut: NormalizedCommissionToken,
): CertifiedCommissionRoute['direction'] {
  if (tokenIn.isNative && !tokenOut.isNative) return 'native-to-token';
  if (!tokenIn.isNative && tokenOut.isNative) return 'token-to-native';
  return 'token-to-token';
}

export function commissionRouteFingerprint(
  chainId: number,
  tokenIn: NormalizedCommissionToken,
  tokenOut: NormalizedCommissionToken,
): string {
  return `${chainId}|${tokenIn.address}|${tokenOut.address}|${routeDirection(tokenIn, tokenOut)}`;
}

export function explainCommissionRouteDenial(
  input: CommissionRouteLookupInput,
): CommissionRouteDenialReason {
  if (!coverageRegistryPresent()) return 'missing_coverage_registry';
  if (!isCommissionSwapChain(input.chainId)) return 'unknown_chain';

  const tokenIn = resolveCommissionTokenIdentity(input.chainId, input.tokenIn);
  const tokenOut = resolveCommissionTokenIdentity(input.chainId, input.tokenOut);
  if (!tokenIn || !tokenOut) return 'unresolved_token_identity';
  if (tokenIn.address === tokenOut.address) return 'native_wrapped_mismatch';
  if (isWrapUnwrapPair(tokenIn, tokenOut, input.chainId)) return 'wrap_unwrap_not_supported';

  const pairKey = commissionPairKey(input.chainId, tokenIn.symbol, tokenOut.symbol);
  if (COMMISSION_AUDIT_BLOCKED_PAIR_KEYS.has(pairKey)) return denialForBlockedKey(pairKey);
  if (!COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.has(pairKey)) return 'not_certified';
  return 'not_certified';
}

export function getCertifiedCommissionRoute(
  input: CommissionRouteLookupInput,
): CertifiedCommissionRoute | null {
  if (!coverageRegistryPresent()) return null;
  if (!isCommissionSwapChain(input.chainId)) return null;

  const tokenIn = resolveCommissionTokenIdentity(input.chainId, input.tokenIn);
  const tokenOut = resolveCommissionTokenIdentity(input.chainId, input.tokenOut);
  if (!tokenIn || !tokenOut) return null;
  if (tokenIn.address === tokenOut.address) return null;
  if (isWrapUnwrapPair(tokenIn, tokenOut, input.chainId)) return null;

  const pairKey = commissionPairKey(input.chainId, tokenIn.symbol, tokenOut.symbol);
  if (COMMISSION_AUDIT_BLOCKED_PAIR_KEYS.has(pairKey)) return null;
  if (!COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.has(pairKey)) return null;

  const direction = routeDirection(tokenIn, tokenOut);
  return {
    chainId: input.chainId,
    tokenIn,
    tokenOut,
    pairKey,
    auditAt: COMMISSION_COVERAGE_AUDIT_AT,
    direction,
    fingerprint: commissionRouteFingerprint(input.chainId, tokenIn, tokenOut),
  };
}

export function isCommissionRouteCertified(input: CommissionRouteLookupInput): boolean {
  return getCertifiedCommissionRoute(input) !== null;
}

export function assertCommissionRouteCertified(
  input: CommissionRouteLookupInput,
): CertifiedCommissionRoute {
  const route = getCertifiedCommissionRoute(input);
  if (route) return route;
  const reason = explainCommissionRouteDenial(input);
  const tokenIn = resolveCommissionTokenIdentity(input.chainId, input.tokenIn);
  const tokenOut = resolveCommissionTokenIdentity(input.chainId, input.tokenOut);
  const err = new Error(`Commission route not certified (${reason}).`);
  const ext = err as Error & {
    swapErrorReasonCode?: string;
    technicalReason?: string;
    commissionRouteDenialReason?: CommissionRouteDenialReason;
    commissionQuoteAttempt?: Record<string, unknown>;
  };
  ext.swapErrorReasonCode = 'unsupported_commission_route';
  ext.technicalReason = reason;
  ext.commissionRouteDenialReason = reason;
  ext.commissionQuoteAttempt = {
    attemptedProvider: reason,
    chainId: input.chainId,
    fromSymbol: tokenIn?.symbol ?? (typeof input.tokenIn === 'string' ? input.tokenIn : input.tokenIn.symbol) ?? '',
    toSymbol: tokenOut?.symbol ?? (typeof input.tokenOut === 'string' ? input.tokenOut : input.tokenOut.symbol) ?? '',
    fromAmount: '',
    fromTokenAddress: tokenIn?.isNative ? 'native' : tokenIn?.address ?? null,
    toTokenAddress: tokenOut?.isNative ? 'native' : tokenOut?.address ?? null,
    direction: tokenIn && tokenOut ? routeDirection(tokenIn, tokenOut) : undefined,
    denialReason: reason,
  };
  throw err;
}

/** Symbol-key helpers kept for display catalogs; execution should prefer address-based API. */
export {
  commissionPairKey,
  isCommissionPairAuditSupported,
  isCommissionPairAuditBlocked,
} from '@/constants/commissionCoverage';
