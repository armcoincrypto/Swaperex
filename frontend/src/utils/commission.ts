import { getAddress, isAddress } from 'ethers';
import type { QuoteRouteMode } from '@/services/quoteAggregator';
import {
  getMonetizationConfig,
  getPancakeWrapperConfig,
  getPancakeWrapperFeeBpsForUi,
  getPancakeWrapperV2Config,
  getPancakeWrapperV2FeeBpsForUi,
  getUniswapWrapperConfig,
  getUniswapWrapperFeeBpsForUi,
} from '@/config';

export type CommissionGuarantee = 'guaranteed' | 'best_effort' | 'none';
export type CommissionKind = 'wrapper' | '1inch_integrator_fee' | 'none';

export type CommissionTrace = {
  provider: string;
  routeMode: QuoteRouteMode | string;
  chainId?: number | null;
  txTo?: string | null;

  isSwaperexWrapper: boolean;
  wrapperKey?: 'uniswap-v3-wrapper' | 'pancakeswap-v3-wrapper' | 'pancakeswap-v3-wrapper-v2' | null;
  wrapperAddress?: string | null;

  expectedCommissionRecipient: string | null;
  expectedCommissionBps: number | null;
  commissionCapable: boolean;
  commissionGuarantee: CommissionGuarantee;
  commissionKind: CommissionKind;

  notes?: string;
};

function normalizeAddr(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const trimmed = String(addr).trim();
  if (!isAddress(trimmed)) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return trimmed;
  }
}

function addrEq(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAddr(a);
  const nb = normalizeAddr(b);
  if (!na || !nb) return false;
  return na.toLowerCase() === nb.toLowerCase();
}

/**
 * Read-only classification of whether a swap route is commission-capable and how strong that guarantee is.
 *
 * IMPORTANT:
 * - Wrapper commission is only realized if `tx.to` is the wrapper contract and the tx succeeds.
 * - 1inch commission is best-effort (depends on integrator fee params being accepted).
 * - Wrapper fee *recipient* lives on-chain (immutable in v1, mutable `treasury` in v2) and is not available from env.
 */
export function classifyCommissionRoute(input: {
  provider: string;
  routeMode: QuoteRouteMode | string;
  chainId?: number | null;
  txTo?: string | null;
}): CommissionTrace {
  const provider = input.provider;
  const routeMode = input.routeMode;
  const chainId = input.chainId ?? null;
  const txTo = input.txTo ?? null;

  const uniCfg = getUniswapWrapperConfig();
  const pc1Cfg = getPancakeWrapperConfig();
  const pc2Cfg = getPancakeWrapperV2Config();

  const uniWrapper = normalizeAddr(uniCfg.wrapperAddress);
  const pc1Wrapper = normalizeAddr(pc1Cfg.wrapperAddress);
  const pc2Wrapper = normalizeAddr(pc2Cfg.wrapperAddress);

  const providerKey = String(provider || '');

  const wrapperKey: CommissionTrace['wrapperKey'] =
    providerKey === 'uniswap-v3-wrapper'
      ? 'uniswap-v3-wrapper'
      : providerKey === 'pancakeswap-v3-wrapper'
        ? 'pancakeswap-v3-wrapper'
        : providerKey === 'pancakeswap-v3-wrapper-v2'
          ? 'pancakeswap-v3-wrapper-v2'
          : null;

  const wrapperAddress =
    wrapperKey === 'uniswap-v3-wrapper'
      ? uniWrapper
      : wrapperKey === 'pancakeswap-v3-wrapper'
        ? pc1Wrapper
        : wrapperKey === 'pancakeswap-v3-wrapper-v2'
          ? pc2Wrapper
          : null;

  const txToNorm = normalizeAddr(txTo);
  const isWrapperByTxTo =
    (uniWrapper && addrEq(txToNorm, uniWrapper)) ||
    (pc1Wrapper && addrEq(txToNorm, pc1Wrapper)) ||
    (pc2Wrapper && addrEq(txToNorm, pc2Wrapper));

  // Prefer tx.to-based determination when present (ground truth).
  const isSwaperexWrapper = txToNorm ? isWrapperByTxTo : wrapperKey != null;

  if (isSwaperexWrapper) {
    const bps =
      wrapperKey === 'uniswap-v3-wrapper'
        ? getUniswapWrapperFeeBpsForUi()
        : wrapperKey === 'pancakeswap-v3-wrapper'
          ? getPancakeWrapperFeeBpsForUi()
          : wrapperKey === 'pancakeswap-v3-wrapper-v2'
            ? getPancakeWrapperV2FeeBpsForUi()
            : null;

    // Recipient lives on-chain; we can’t know it from env alone.
    return {
      provider,
      routeMode,
      chainId,
      txTo: txToNorm,
      isSwaperexWrapper: true,
      wrapperKey,
      wrapperAddress,
      expectedCommissionRecipient: null,
      expectedCommissionBps: typeof bps === 'number' ? bps : null,
      commissionCapable: true,
      commissionGuarantee: 'guaranteed',
      commissionKind: 'wrapper',
      notes:
        'Wrapper route: fee recipient is on-chain (v1 immutable FEE_RECIPIENT, v2 mutable treasury). Not derived from env.',
    };
  }

  if (providerKey === '1inch') {
    const cfg = getMonetizationConfig();
    const enabled = cfg.enabled && cfg.feeBps > 0 && cfg.recipient != null;
    return {
      provider,
      routeMode,
      chainId,
      txTo: txToNorm,
      isSwaperexWrapper: false,
      wrapperKey: null,
      wrapperAddress: null,
      expectedCommissionRecipient: enabled ? normalizeAddr(cfg.recipient) : null,
      expectedCommissionBps: enabled ? cfg.feeBps : null,
      commissionCapable: enabled,
      commissionGuarantee: enabled ? 'best_effort' : 'none',
      commissionKind: enabled ? '1inch_integrator_fee' : 'none',
      notes: enabled
        ? '1inch integrator fee is best-effort; tx building may retry without fee/referrer if rejected by 1inch.'
        : '1inch monetization not enabled or invalid recipient/fee.',
    };
  }

  return {
    provider,
    routeMode,
    chainId,
    txTo: txToNorm,
    isSwaperexWrapper: false,
    wrapperKey: null,
    wrapperAddress: null,
    expectedCommissionRecipient: null,
    expectedCommissionBps: null,
    commissionCapable: false,
    commissionGuarantee: 'none',
    commissionKind: 'none',
  };
}

