/**
 * P16.4 — Canonical primary CTA states for the swap card.
 *
 * Every disabled state must explain why, what is missing, and how to continue.
 */

import type { SwapStatus } from '@/hooks/useSwap';

export type SwapCtaStateId =
  | 'connect_wallet'
  | 'switch_network'
  | 'enter_amount'
  | 'insufficient_balance'
  | 'request_quote'
  | 'refresh_quote'
  | 'approve_token'
  | 'review_swap'
  | 'swap'
  | 'swap_completed'
  | 'blocked_by_protection'
  | 'quote_only'
  | 'choose_token';

export interface SwapCtaStateSpec {
  id: SwapCtaStateId;
  label: string;
  enabled: boolean;
  reason: string;
  nextStep: string;
}

export const SWAP_CTA_STATES: Record<SwapCtaStateId, SwapCtaStateSpec> = {
  connect_wallet: {
    id: 'connect_wallet',
    label: 'Connect Wallet',
    enabled: false,
    reason: 'No wallet connected',
    nextStep: 'Connect MetaMask, WalletConnect, or another supported wallet',
  },
  switch_network: {
    id: 'switch_network',
    label: 'Switch Network',
    enabled: true,
    reason: 'Wallet is on an unsupported or wrong network for this action',
    nextStep: 'Switch to a supported network in your wallet or use the switch button',
  },
  enter_amount: {
    id: 'enter_amount',
    label: 'Enter Amount',
    enabled: false,
    reason: 'Swap amount is empty or zero',
    nextStep: 'Enter how much you want to swap',
  },
  insufficient_balance: {
    id: 'insufficient_balance',
    label: 'Insufficient Balance',
    enabled: false,
    reason: 'Wallet balance is lower than the entered amount',
    nextStep: 'Reduce the amount or fund your wallet',
  },
  request_quote: {
    id: 'request_quote',
    label: 'Getting quote...',
    enabled: false,
    reason: 'Fetching live route and price for your pair',
    nextStep: 'Wait for the quote to finish loading',
  },
  refresh_quote: {
    id: 'refresh_quote',
    label: 'Refresh quote',
    enabled: true,
    reason: 'The previous quote expired or allowance could not be verified',
    nextStep: 'Tap refresh to fetch a new quote',
  },
  approve_token: {
    id: 'approve_token',
    label: 'Approving token…',
    enabled: false,
    reason: 'Token allowance approval is in progress',
    nextStep: 'Confirm the approval in your wallet',
  },
  review_swap: {
    id: 'review_swap',
    label: 'Preview Swap',
    enabled: true,
    reason: 'Quote is ready for review',
    nextStep: 'Open the preview and confirm details before signing',
  },
  swap: {
    id: 'swap',
    label: 'Sign swap in wallet…',
    enabled: false,
    reason: 'Swap transaction is awaiting wallet signature or confirmation',
    nextStep: 'Confirm in your wallet and wait for on-chain confirmation',
  },
  swap_completed: {
    id: 'swap_completed',
    label: 'Swap completed',
    enabled: false,
    reason: 'The swap transaction confirmed on-chain',
    nextStep: 'Start a new swap or view your portfolio',
  },
  blocked_by_protection: {
    id: 'blocked_by_protection',
    label: 'Blocked by Protection',
    enabled: false,
    reason: 'A protection preset blocked this swap',
    nextStep: 'Adjust the preset, dismiss guards if safe, or change the pair',
  },
  quote_only: {
    id: 'quote_only',
    label: 'Quote only — execution disabled',
    enabled: false,
    reason: 'This route is quote-only on the current network configuration',
    nextStep: 'Try a supported execution pair or switch network',
  },
  choose_token: {
    id: 'choose_token',
    label: 'Choose another token',
    enabled: true,
    reason: 'This pair is not supported by commission routing',
    nextStep: 'Select a supported major pair',
  },
};

export interface SwapCtaResolutionInput {
  isConnected: boolean;
  isWrongChain: boolean;
  commissionSwapUnavailable: boolean;
  hasAmount: boolean;
  insufficientBalance: boolean;
  isQuoteLoading: boolean;
  isQuoteExpired: boolean;
  hasQuote: boolean;
  needsApproval: boolean;
  status: SwapStatus;
  isReadOnly: boolean;
  guardsBlocked: boolean;
  unsupportedRoute: boolean;
}

/** Resolve the active CTA spec from swap UI inputs. */
export function resolveSwapCtaState(input: SwapCtaResolutionInput): SwapCtaStateSpec {
  if (!input.isConnected) return SWAP_CTA_STATES.connect_wallet;
  if (input.isWrongChain) return SWAP_CTA_STATES.switch_network;
  if (input.commissionSwapUnavailable) {
    return {
      ...SWAP_CTA_STATES.switch_network,
      label: 'Switch to swap-enabled network',
    };
  }
  if (!input.hasAmount) return SWAP_CTA_STATES.enter_amount;
  if (input.status === 'approving') return SWAP_CTA_STATES.approve_token;
  if (input.status === 'swapping' || input.status === 'confirming') {
    return SWAP_CTA_STATES.swap;
  }
  if (input.status === 'success') return SWAP_CTA_STATES.swap_completed;
  if (input.insufficientBalance) return SWAP_CTA_STATES.insufficient_balance;
  if (input.isQuoteLoading) return SWAP_CTA_STATES.request_quote;
  if (input.guardsBlocked) return SWAP_CTA_STATES.blocked_by_protection;
  if (input.hasQuote && input.isQuoteExpired) return SWAP_CTA_STATES.refresh_quote;
  if (!input.hasQuote && input.hasAmount && !input.insufficientBalance) {
    return SWAP_CTA_STATES.request_quote;
  }
  if (input.unsupportedRoute) return SWAP_CTA_STATES.choose_token;
  if (input.isReadOnly && input.hasQuote && !input.isQuoteExpired) {
    return {
      ...SWAP_CTA_STATES.connect_wallet,
      label: 'Connect wallet to swap',
      reason: 'View-only session — connect a signing wallet to execute',
      nextStep: 'Connect WalletConnect or an injected wallet',
    };
  }
  if (input.hasQuote && input.needsApproval) {
    return {
      ...SWAP_CTA_STATES.approve_token,
      enabled: true,
      label: 'Approve Token',
      reason: 'Token allowance required before swap',
      nextStep: 'Approve once, then preview the swap',
    };
  }
  return SWAP_CTA_STATES.review_swap;
}
