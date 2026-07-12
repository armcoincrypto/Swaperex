import { describe, it, expect } from 'vitest';
import {
  getRecoveredTraceForWallet,
  selectRecoveredSwapTrace,
  getRecoveryStatusCopy,
} from '@/utils/recoveredSwapTrace';
import type { SwapJournalRecord, ApprovalJournalRecord } from '@/types/transactionJournal';
import { JOURNAL_RECORD_SCHEMA_VERSION } from '@/types/transactionJournal';

const WALLET = '0x' + 'a'.repeat(40);
const HASH_A = '0x' + '1'.repeat(64);
const HASH_B = '0x' + '2'.repeat(64);

function baseSwap(overrides: Partial<SwapJournalRecord> = {}): SwapJournalRecord {
  return {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id: `1:swap:${HASH_B}`,
    flowId: 'flow-1',
    kind: 'swap',
    source: 'swaperex-client',
    walletAddress: WALLET,
    chainId: 1,
    transactionHash: HASH_B,
    status: 'pending',
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
      expectedOutputDisplay: '2',
      slippageBps: 50,
      provider: 'uniswap-v3',
    },
    ...overrides,
  };
}

describe('recoveredSwapTrace', () => {
  it('selects pending swap over confirmed approval in same flow', () => {
    const approval: ApprovalJournalRecord = {
      schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
      id: `1:approval:${HASH_A}`,
      flowId: 'flow-1',
      kind: 'approval',
      source: 'swaperex-client',
      walletAddress: WALLET,
      chainId: 1,
      transactionHash: HASH_A,
      status: 'confirmed',
      submittedAt: '2026-07-11T11:00:00.000Z',
      updatedAt: '2026-07-11T11:01:00.000Z',
      relatedRecordIds: [],
      context: {
        tokenAddress: '0x' + '3'.repeat(40),
        tokenSymbol: 'USDT',
        tokenDecimals: 6,
        spenderAddress: '0x' + '4'.repeat(40),
        approvalMode: 'exact',
        provider: 'uniswap-v3',
      },
    };
    const swap = baseSwap();
    const trace = selectRecoveredSwapTrace([approval, swap], 'flow-1');
    expect(trace?.kind).toBe('swap');
    expect(trace?.phase).toBe('swap_pending');
  });

  it('returns approval-only confirmed trace', () => {
    const approval: ApprovalJournalRecord = {
      schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
      id: `1:approval:${HASH_A}`,
      flowId: 'flow-2',
      kind: 'approval',
      source: 'swaperex-client',
      walletAddress: WALLET,
      chainId: 1,
      transactionHash: HASH_A,
      status: 'confirmed',
      submittedAt: '2026-07-11T11:00:00.000Z',
      updatedAt: '2026-07-11T11:01:00.000Z',
      relatedRecordIds: [],
      context: {
        tokenAddress: '0x' + '3'.repeat(40),
        tokenSymbol: 'USDT',
        tokenDecimals: 6,
        spenderAddress: '0x' + '4'.repeat(40),
        approvalMode: 'exact',
        provider: 'uniswap-v3',
      },
    };
    const trace = getRecoveredTraceForWallet([approval], WALLET);
    expect(trace?.phase).toBe('approval_confirmed');
    expect(trace?.kind).toBe('approval');
  });

  it('excludes other wallet records', () => {
    const otherWallet = '0x' + 'b'.repeat(40);
    const trace = getRecoveredTraceForWallet([baseSwap({ walletAddress: otherWallet })], WALLET);
    expect(trace).toBeNull();
  });

  it('provides non-failure copy for unknown and stale', () => {
    expect(getRecoveryStatusCopy('status_unavailable').title).toContain('unavailable');
    expect(getRecoveryStatusCopy('stale').title).not.toMatch(/failed/i);
  });
});
