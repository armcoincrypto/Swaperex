/**
 * P9.2 — Commission route display helpers (UX copy only; no routing/quote logic).
 */

import {
  isCommissionPairAuditSupported,
} from '@/constants/commissionCoverage';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { getTokenBySymbol, isNativeToken } from '@/tokens';

export function isAuditedCommissionDirection(
  chainId: number,
  fromSymbol: string,
  toSymbol: string,
): boolean {
  return isCommissionPairAuditSupported(chainId, fromSymbol, toSymbol);
}

export function getCommissionRouteIssueCopy(
  chainId: number,
  fromSymbol: string,
  toSymbol: string,
): { title: string; helper: string } {
  if (isAuditedCommissionDirection(chainId, fromSymbol, toSymbol)) {
    const fromToken = getTokenBySymbol(fromSymbol, chainId);
    const toToken = getTokenBySymbol(toSymbol, chainId);
    const hasNativeEthLeg =
      chainId === 1 &&
      ((fromToken && isNativeToken(fromToken.address)) ||
        (toToken && isNativeToken(toToken.address)));

    return {
      title: SWAP_SURFACE_COPY.auditedCommissionQuoteFailedTitle,
      helper: hasNativeEthLeg
        ? SWAP_SURFACE_COPY.auditedCommissionQuoteFailedNativeEthHelper
        : SWAP_SURFACE_COPY.auditedCommissionQuoteFailedHelper,
    };
  }

  return {
    title: SWAP_SURFACE_COPY.unsupportedCommissionRouteTitle,
    helper: SWAP_SURFACE_COPY.unsupportedCommissionRouteHelper,
  };
}
