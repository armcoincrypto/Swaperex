import { describe, it, expect } from 'vitest';
import {
  buildDetailFromJournalRecord,
  buildDetailFromUnifiedActivity,
  buildFlowDetailModels,
  canAccessJournalDetail,
} from '@/services/transactionDetailService';
import { journalRecordToUnifiedItem } from '@/utils/unifiedActivityAdapters';
import type { ApprovalJournalRecord, SwapJournalRecord } from '@/types/transactionJournal';
import { JOURNAL_RECORD_SCHEMA_VERSION } from '@/types/transactionJournal';
import type { SwapRecord } from '@/stores/swapHistoryStore';
import { presentStatusExplanation } from '@/utils/transactionDetailFormatting';

const WALLET_A = '0x' + 'a'.repeat(40);
const WALLET_B = '0x' + 'b'.repeat(40);
const HASH_A = '0x' + '1'.repeat(64);
const HASH_B = '0x' + '2'.repeat(64);

function makeApproval(): ApprovalJournalRecord {
  return {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id: `1:approval:${HASH_A}`,
    flowId: 'flow-1',
    kind: 'approval',
    source: 'swaperex-client',
    walletAddress: WALLET_A,
    chainId: 1,
    transactionHash: HASH_A,
    status: 'confirmed',
    submittedAt: '2026-07-11T11:00:00.000Z',
    updatedAt: '2026-07-11T11:01:00.000Z',
    relatedRecordIds: [`1:swap:${HASH_B}`],
    explorerUrl: 'https://etherscan.io/tx/' + HASH_A,
    context: {
      tokenAddress: '0x' + '3'.repeat(40),
      tokenSymbol: 'USDT',
      tokenDecimals: 6,
      spenderAddress: '0x' + '4'.repeat(40),
      approvalMode: 'exact',
      approvedAmountDisplay: '100',
      provider: 'uniswap-v3',
    },
  };
}

function makeSwap(overrides: Partial<SwapJournalRecord> = {}): SwapJournalRecord {
  return {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id: `1:swap:${HASH_B}`,
    flowId: 'flow-1',
    kind: 'swap',
    source: 'swaperex-client',
    walletAddress: WALLET_A,
    chainId: 1,
    transactionHash: HASH_B,
    status: 'pending',
    submittedAt: '2026-07-11T12:00:00.000Z',
    updatedAt: '2026-07-11T12:00:00.000Z',
    relatedRecordIds: [`1:approval:${HASH_A}`],
    explorerUrl: 'https://etherscan.io/tx/' + HASH_B,
    context: {
      fromTokenAddress: 'native',
      fromTokenSymbol: 'ETH',
      fromTokenDecimals: 18,
      toTokenAddress: '0x' + '5'.repeat(40),
      toTokenSymbol: 'USDC',
      toTokenDecimals: 6,
      inputAmountRaw: '1',
      inputAmountDisplay: '1',
      expectedOutputDisplay: '2000',
      slippageBps: 50,
      provider: 'uniswap-v3',
    },
    ...overrides,
  };
}

describe('transactionDetailService', () => {
  it('builds journal swap details with quote qualifier', () => {
    const detail = buildDetailFromJournalRecord(makeSwap(), [makeApproval(), makeSwap()], WALLET_A);
    expect(detail?.kind).toBe('swap');
    expect(detail?.swap?.fields.some((f) => f.hint?.includes('quote context'))).toBe(true);
  });

  it('marks approval-only flow', () => {
    const detail = buildDetailFromJournalRecord(makeApproval(), [makeApproval()], WALLET_A);
    expect(detail?.approvalOnlyFlow).toBe(true);
    expect(detail?.limitations.some((l) => l.includes('not submitted'))).toBe(true);
  });

  it('builds linked flow models in approval-before-swap order', () => {
    const flow = buildFlowDetailModels('flow-1', [makeSwap(), makeApproval()], WALLET_A);
    expect(flow).toHaveLength(2);
    expect(flow[0].kind).toBe('approval');
    expect(flow[1].kind).toBe('swap');
  });

  it('blocks wrong-wallet journal access', () => {
    expect(canAccessJournalDetail(makeSwap(), WALLET_B)).toBe(false);
    expect(buildDetailFromJournalRecord(makeSwap(), [makeSwap()], WALLET_B)).toBeNull();
  });

  it('explains unknown and stale statuses', () => {
    const unknown = buildDetailFromJournalRecord(makeSwap({ status: 'unknown' }), [makeSwap()], WALLET_A);
    expect(unknown?.statusExplanation).toBe(presentStatusExplanation('unknown'));
    const stale = buildDetailFromJournalRecord(makeSwap({ status: 'stale' }), [makeSwap()], WALLET_A);
    expect(stale?.statusExplanation).toBe(presentStatusExplanation('stale'));
  });

  it('builds explorer-only limited details from unified item', () => {
    const explorerItem = journalRecordToUnifiedItem(makeSwap({ status: 'confirmed' }))!;
    explorerItem.source = 'explorer';
    explorerItem.confidence = 'chain-observed';
    const detail = buildDetailFromUnifiedActivity(explorerItem, [], [], WALLET_A);
    expect(detail?.source).toBe('explorer');
    expect(detail?.swap).toBeUndefined();
    expect(detail?.limitations.some((l) => l.includes('Explorer-observed'))).toBe(true);
  });

  it('builds legacy transfer details with limitation', () => {
    const transfer: SwapRecord = {
      id: 't1',
      timestamp: Date.now(),
      chainId: 1,
      fromAsset: { symbol: 'ETH', name: 'ETH', chain: 'ethereum', decimals: 18, is_native: true },
      toAsset: { symbol: 'ETH', name: 'ETH', chain: 'ethereum', decimals: 18, is_native: true },
      fromAmount: '0.1',
      toAmount: '0.1',
      txHash: '0x' + '9'.repeat(64),
      explorerUrl: 'https://etherscan.io/tx/0x' + '9'.repeat(64),
      status: 'success',
      provider: 'transfer',
      slippage: 0,
    };
    const item = {
      id: 'legacy-transfer:t1',
      source: 'legacy-transfer' as const,
      kind: 'transfer' as const,
      walletAddress: WALLET_A,
      chainId: 1,
      transactionHash: transfer.txHash,
      status: 'confirmed' as const,
      timestamp: new Date().toISOString(),
      ts: Date.now(),
      title: 'Send ETH',
      confidence: 'legacy-local' as const,
      localRecord: transfer,
    };
    const detail = buildDetailFromUnifiedActivity(item, [], [transfer], WALLET_A);
    expect(detail?.transfer).toBeTruthy();
    expect(detail?.limitations.some((l) => l.includes('wallet ownership not proven'))).toBe(true);
  });
});
