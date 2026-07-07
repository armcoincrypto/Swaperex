/**
 * P4A — Commission swap network truth (Ethereum + BNB Chain only).
 * Balance/portfolio may use additional EVM networks from wallet/chains.ts.
 */

import { isCommissionRequiredMode } from '@/config';

/** Chain IDs where Swaperex commission wrapper swaps are supported. */
export const COMMISSION_SWAP_CHAIN_IDS = [1, 56] as const;

export type CommissionSwapChainId = (typeof COMMISSION_SWAP_CHAIN_IDS)[number];

export function isCommissionSwapChain(chainId: number): chainId is CommissionSwapChainId {
  return (COMMISSION_SWAP_CHAIN_IDS as readonly number[]).includes(chainId);
}

/** True when commission mode is on and the chain cannot execute wrapper swaps. */
export function isCommissionSwapUnavailableOnChain(chainId: number): boolean {
  return isCommissionRequiredMode() && !isCommissionSwapChain(chainId);
}

export const COMMISSION_SWAP_CHAIN_LABELS: Record<CommissionSwapChainId, string> = {
  1: 'Ethereum',
  56: 'BNB Chain',
};
