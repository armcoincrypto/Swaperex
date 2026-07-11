import { describe, it, expect } from 'vitest';
import {
  resolveTransition,
  transitionJournalRecord,
} from '@/utils/transactionJournalTransitions';
import type { SwapJournalRecord } from '@/types/transactionJournal';
import { createJournalRecordId } from '@/utils/transactionJournalIdentity';
import { JOURNAL_RECORD_SCHEMA_VERSION } from '@/types/transactionJournal';

const HASH = '0x' + 'b'.repeat(64);

function baseRecord(status: SwapJournalRecord['status']): SwapJournalRecord {
  const id = createJournalRecordId(1, 'swap', HASH)!;
  return {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id,
    flowId: 'flow-1',
    kind: 'swap',
    source: 'swaperex-client',
    walletAddress: '0x' + '1'.repeat(40),
    chainId: 1,
    transactionHash: HASH,
    status,
    submittedAt: '2026-07-11T12:00:00.000Z',
    updatedAt: '2026-07-11T12:00:00.000Z',
    relatedRecordIds: [],
    context: {
      fromTokenAddress: 'native',
      fromTokenSymbol: 'ETH',
      fromTokenDecimals: 18,
      toTokenAddress: 'native',
      toTokenSymbol: 'USDC',
      toTokenDecimals: 6,
      inputAmountRaw: '1',
      inputAmountDisplay: '1',
      expectedOutputDisplay: '1',
      slippageBps: 50,
      provider: 'uniswap-v3',
    },
  };
}

describe('transactionJournalTransitions', () => {
  it('allows submitted -> pending/confirmed/reverted/unknown', () => {
    expect(resolveTransition('submitted', 'TRANSACTION_PENDING').allowed).toBe(true);
    expect(resolveTransition('submitted', 'RECEIPT_CONFIRMED').allowed).toBe(true);
    expect(resolveTransition('submitted', 'RECEIPT_REVERTED').allowed).toBe(true);
    expect(resolveTransition('submitted', 'RECONCILIATION_UNKNOWN').allowed).toBe(true);
  });

  it('blocks confirmed regression', () => {
    const result = resolveTransition('confirmed', 'TRANSACTION_PENDING');
    expect(result.allowed).toBe(false);
  });

  it('allows unknown -> confirmed', () => {
    const next = transitionJournalRecord(baseRecord('unknown'), 'RECEIPT_CONFIRMED', {
      confirmedAt: '2026-07-11T12:01:00.000Z',
      receipt: {
        status: 1,
        blockNumber: 123,
        confirmedAt: '2026-07-11T12:01:00.000Z',
      },
    });
    expect(next?.status).toBe('confirmed');
  });

  it('keeps confirmed terminal on duplicate confirm', () => {
    const confirmed = baseRecord('confirmed');
    const next = transitionJournalRecord(confirmed, 'RECEIPT_CONFIRMED');
    expect(next?.status).toBe('confirmed');
  });
});
