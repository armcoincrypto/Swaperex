import { describe, it, expect } from 'vitest';
import {
  normalizeSwaperexError,
  normalizeJournalUncertainty,
} from '@/utils/swaperexErrorClassification';
import {
  getErrorPresentation,
  getPermittedErrorActions,
  isActionPermitted,
} from '@/utils/swaperexErrorPresentation';
import { parseTransactionError, parseRpcError } from '@/utils/errors';

const HASH = '0x' + 'a'.repeat(64);

describe('normalizeSwaperexError — taxonomy matrix', () => {
  const cases: Array<{
    name: string;
    error: unknown;
    context?: Parameters<typeof normalizeSwaperexError>[1];
    category: string;
    finality: string;
    broadcastKnown: boolean;
    retryability: string;
    recommendedAction: string;
    titleIncludes?: string;
    messageIncludes?: string;
  }> = [
    {
      name: 'EIP-1193 4001',
      error: { code: 4001, message: 'User rejected' },
      category: 'user_rejected',
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_now',
      recommendedAction: 'return_to_swap',
      titleIncludes: 'cancelled',
      messageIncludes: 'no transaction was submitted',
    },
    {
      name: 'ethers ACTION_REJECTED',
      error: { code: 'ACTION_REJECTED', message: 'user rejected transaction' },
      category: 'user_rejected',
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_now',
      recommendedAction: 'return_to_swap',
    },
    {
      name: 'RPC -32002 wallet pending',
      error: { code: -32002, message: 'request already pending' },
      category: 'wallet_request_pending',
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_after_user_action',
      recommendedAction: 'none',
      titleIncludes: 'wallet',
    },
    {
      name: 'INSUFFICIENT_FUNDS gas',
      error: { code: -32000, message: 'insufficient funds for gas' },
      category: 'insufficient_native_gas',
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_after_user_action',
      recommendedAction: 'add_native_gas',
    },
    {
      name: 'insufficient token balance',
      error: { message: 'insufficient token balance' },
      category: 'insufficient_token_balance',
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_after_user_action',
      recommendedAction: 'reduce_amount',
    },
    {
      name: 'wrong network',
      error: { code: 4902, message: 'wrong chain' },
      category: 'wrong_network',
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_after_user_action',
      recommendedAction: 'switch_network',
    },
    {
      name: 'quote expired',
      error: { message: 'QUOTE_EXPIRED' },
      context: { stage: 'quote', quoteExpired: true },
      category: 'quote_expired',
      finality: 'not_transaction_related',
      broadcastKnown: false,
      retryability: 'safe_now',
      recommendedAction: 'retry_quote',
    },
    {
      name: 'NETWORK_ERROR timeout',
      error: { message: 'timeout exceeded' },
      category: 'rpc_timeout',
      finality: 'not_transaction_related',
      broadcastKnown: false,
      retryability: 'safe_now',
      recommendedAction: 'retry_quote',
    },
    {
      name: 'unsupported chain',
      error: { message: 'unsupported chain 999' },
      category: 'unsupported_chain',
      finality: 'not_transaction_related',
      broadcastKnown: false,
      retryability: 'not_recommended',
      recommendedAction: 'return_to_swap',
    },
    {
      name: 'storage after broadcast',
      error: { message: 'storage quota exceeded' },
      context: { transactionHash: HASH, broadcastKnown: true, stage: 'storage' },
      category: 'storage_unavailable',
      finality: 'post_broadcast_nonfinal',
      broadcastKnown: true,
      retryability: 'check_status_first',
      recommendedAction: 'view_explorer',
      messageIncludes: 'submitted',
    },
  ];

  it.each(cases)('$name', ({ error, context, ...expected }) => {
    const normalized = normalizeSwaperexError(error, context);
    expect(normalized.category).toBe(expected.category);
    expect(normalized.finality).toBe(expected.finality);
    expect(normalized.broadcastKnown).toBe(expected.broadcastKnown);
    expect(normalized.retryability).toBe(expected.retryability);
    expect(normalized.recommendedAction).toBe(expected.recommendedAction);
    if (expected.titleIncludes) {
      expect(normalized.userTitle.toLowerCase()).toContain(expected.titleIncludes);
    }
    if (expected.messageIncludes) {
      expect(normalized.userMessage.toLowerCase()).toContain(expected.messageIncludes);
    }
  });
});

describe('receipt precedence', () => {
  it('raw timeout + reverted receipt → swap_reverted final', () => {
    const normalized = normalizeSwaperexError(
      { message: 'timeout' },
      { receiptStatus: 0, transactionHash: HASH, broadcastKnown: true, stage: 'swap-confirm' },
    );
    expect(normalized.category).toBe('swap_reverted');
    expect(normalized.finality).toBe('post_broadcast_final');
  });

  it('raw revert string + no receipt → not automatically reverted', () => {
    const normalized = normalizeSwaperexError(
      { message: 'execution reverted' },
      { stage: 'swap-submit', broadcastKnown: false },
    );
    expect(normalized.category).toBe('swap_submission_failed');
    expect(normalized.finality).toBe('pre_broadcast');
  });

  it('hash known + unknown raw error → post_broadcast_nonfinal', () => {
    const normalized = normalizeSwaperexError(
      { message: 'something odd' },
      { transactionHash: HASH, broadcastKnown: true },
    );
    expect(normalized.finality).toBe('post_broadcast_nonfinal');
    expect(normalized.userMessage.toLowerCase()).toContain('explorer');
  });

  it('confirmed journal + provider error does not override via journalStatus', () => {
    const normalized = normalizeSwaperexError(
      { message: 'rpc unavailable' },
      { journalStatus: 'unknown', transactionHash: HASH, broadcastKnown: true },
    );
    expect(normalized.category).toBe('transaction_unknown');
  });
});

describe('retry safety matrix', () => {
  it('unknown never offers resubmit', () => {
    const normalized = normalizeJournalUncertainty('unknown', { transactionHash: HASH });
    const presentation = getErrorPresentation(normalized);
    expect(presentation.canResubmit).toBe(false);
    expect(presentation.canCheckStatus).toBe(true);
    expect(isActionPermitted(normalized, 'check_status')).toBe(true);
    expect(getPermittedErrorActions(normalized)).not.toContain('return_to_swap');
  });

  it('stale never offers resubmit', () => {
    const normalized = normalizeJournalUncertainty('stale', { transactionHash: HASH });
    const presentation = getErrorPresentation(normalized);
    expect(presentation.canResubmit).toBe(false);
    expect(presentation.showExplorer).toBe(true);
  });

  it('pending approval phase does not offer resubmit via unknown path', () => {
    const normalized = normalizeJournalUncertainty('pending', {
      transactionHash: HASH,
      stage: 'approval-confirm',
    });
    const presentation = getErrorPresentation(normalized);
    expect(presentation.canResubmit).toBe(false);
  });

  it('user rejection pre-broadcast may return to swap', () => {
    const normalized = normalizeSwaperexError({ code: 4001 });
    expect(isActionPermitted(normalized, 'return_to_swap')).toBe(true);
    const presentation = getErrorPresentation(normalized);
    expect(presentation.canResubmit).toBe(true);
  });

  it('reverted may offer retry quote', () => {
    const normalized = normalizeJournalUncertainty('reverted', {
      transactionHash: HASH,
      stage: 'swap-confirm',
    });
    const presentation = getErrorPresentation(normalized);
    expect(presentation.canRetryQuote).toBe(true);
    expect(presentation.canResubmit).toBe(false);
  });
});

describe('UI copy safety', () => {
  it('unknown status copy avoids failed wording', () => {
    const normalized = normalizeJournalUncertainty('unknown', { transactionHash: HASH });
    expect(normalized.userMessage.toLowerCase()).not.toMatch(/\bfailed\b/);
    expect(normalized.userTitle.toLowerCase()).not.toMatch(/\bfailed\b/);
  });

  it('stale status copy does not claim failure as fact', () => {
    const normalized = normalizeJournalUncertainty('stale', { transactionHash: HASH });
    expect(normalized.userMessage.toLowerCase()).toContain('does not prove');
    expect(normalized.userTitle.toLowerCase()).not.toMatch(/^transaction failed/);
  });

  it('post-broadcast RPC timeout avoids try again', () => {
    const parsed = parseRpcError(
      { message: 'timeout' },
      { transactionHash: HASH, broadcastKnown: true },
    );
    expect(parsed.message.toLowerCase()).toContain('explorer');
    expect(parsed.shouldShowRetry).toBe(false);
  });

  it('user rejection uses safe copy', () => {
    const parsed = parseTransactionError({ code: 4001 });
    expect(parsed.message).toContain('No transaction was submitted');
    expect(parsed.message.toLowerCase()).not.toMatch(/\bfailed\b/);
  });
});
