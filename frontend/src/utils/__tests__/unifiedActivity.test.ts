import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/transactionHistory', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services/transactionHistory')>();
  return {
    ...mod,
    getMultiChainTransactions: vi.fn().mockResolvedValue([]),
  };
});

import {
  buildUnifiedWalletActivity,
  fetchUnifiedWalletActivity,
  getCompactJournalActivity,
} from '@/services/activityService';
import { getMultiChainTransactions } from '@/services/transactionHistory';
import { dedupeUnifiedActivityItems, unifiedActivityDedupeKey } from '@/utils/unifiedActivityDedupe';
import {
  explorerTransactionToUnifiedItem,
  journalRecordToUnifiedItem,
  legacyTransferToUnifiedItem,
} from '@/utils/unifiedActivityAdapters';
import {
  filterUnifiedActivityGroups,
  groupUnifiedActivityItems,
} from '@/utils/unifiedActivityFlowGrouping';
import { presentActivityStatus } from '@/utils/activityPresentation';
import type { SwapRecord } from '@/stores/swapHistoryStore';
import type { ApprovalJournalRecord, SwapJournalRecord } from '@/types/transactionJournal';
import { JOURNAL_RECORD_SCHEMA_VERSION } from '@/types/transactionJournal';
import type { Transaction } from '@/services/transactionHistory';

const WALLET_A = '0x' + 'a'.repeat(40);
const WALLET_B = '0x' + 'b'.repeat(40);
const HASH_SWAP = '0x' + '1'.repeat(64);
const HASH_APPROVAL = '0x' + '2'.repeat(64);

function makeApproval(overrides: Partial<ApprovalJournalRecord> = {}): ApprovalJournalRecord {
  return {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id: `1:approval:${HASH_APPROVAL}`,
    flowId: 'flow-1',
    kind: 'approval',
    source: 'swaperex-client',
    walletAddress: WALLET_A,
    chainId: 1,
    transactionHash: HASH_APPROVAL,
    status: 'confirmed',
    submittedAt: '2026-07-11T11:00:00.000Z',
    updatedAt: '2026-07-11T11:01:00.000Z',
    relatedRecordIds: [`1:swap:${HASH_SWAP}`],
    explorerUrl: 'https://etherscan.io/tx/' + HASH_APPROVAL,
    context: {
      tokenAddress: '0x' + '3'.repeat(40),
      tokenSymbol: 'USDT',
      tokenDecimals: 6,
      spenderAddress: '0x' + '4'.repeat(40),
      approvalMode: 'exact',
      approvedAmountDisplay: '100',
      provider: 'uniswap-v3',
    },
    ...overrides,
  };
}

function makeSwap(overrides: Partial<SwapJournalRecord> = {}): SwapJournalRecord {
  return {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id: `1:swap:${HASH_SWAP}`,
    flowId: 'flow-1',
    kind: 'swap',
    source: 'swaperex-client',
    walletAddress: WALLET_A,
    chainId: 1,
    transactionHash: HASH_SWAP,
    status: 'pending',
    submittedAt: '2026-07-11T12:00:00.000Z',
    updatedAt: '2026-07-11T12:00:00.000Z',
    relatedRecordIds: [`1:approval:${HASH_APPROVAL}`],
    explorerUrl: 'https://etherscan.io/tx/' + HASH_SWAP,
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

function makeTransfer(overrides: Partial<SwapRecord> = {}): SwapRecord {
  return {
    id: 'transfer-1',
    timestamp: 1700000000000,
    chainId: 1,
    fromAsset: {
      symbol: 'ETH',
      name: 'Ethereum',
      chain: 'ethereum',
      decimals: 18,
      is_native: true,
    },
    toAsset: {
      symbol: 'ETH',
      name: 'Ethereum',
      chain: 'ethereum',
      decimals: 18,
      is_native: true,
    },
    fromAmount: '0.1',
    toAmount: '0.1',
    txHash: '0x' + '9'.repeat(64),
    explorerUrl: 'https://etherscan.io/tx/0x' + '9'.repeat(64),
    status: 'success',
    provider: 'transfer',
    slippage: 0,
    toAddress: '0x' + '6'.repeat(40),
    ...overrides,
  };
}

function makeExplorerTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    hash: HASH_SWAP,
    from: WALLET_A,
    to: '0x' + '7'.repeat(40),
    value: '0',
    valueFormatted: '0',
    timestamp: 1700001000000,
    blockNumber: 1,
    isSwap: true,
    swapRouter: 'Uniswap V3',
    status: 'success',
    explorerUrl: 'https://etherscan.io/tx/' + HASH_SWAP,
    chainId: 1,
    methodId: '0x04e45aaf',
    ...overrides,
  };
}

describe('unified activity adapters', () => {
  it('maps journal approval and swap distinctly', () => {
    const approval = journalRecordToUnifiedItem(makeApproval());
    const swap = journalRecordToUnifiedItem(makeSwap());
    expect(approval?.kind).toBe('approval');
    expect(approval?.source).toBe('journal');
    expect(swap?.kind).toBe('swap');
    expect(swap?.flowId).toBe('flow-1');
  });

  it('maps explorer transfer conservatively', () => {
    const item = explorerTransactionToUnifiedItem(
      makeExplorerTx({ isSwap: false, value: '1', valueFormatted: '1 ETH' }),
      WALLET_A,
    );
    expect(item.kind).toBe('transfer');
    expect(item.confidence).toBe('chain-observed');
  });

  it('maps legacy transfer with device source', () => {
    const item = legacyTransferToUnifiedItem(makeTransfer(), WALLET_A);
    expect(item.kind).toBe('transfer');
    expect(item.source).toBe('legacy-transfer');
    expect(item.status).toBe('confirmed');
  });

  it('maps unknown journal status copy', () => {
    const item = journalRecordToUnifiedItem(makeSwap({ status: 'unknown' }));
    expect(presentActivityStatus(item!.status)).toBe('Status unavailable');
  });

  it('maps stale journal status copy', () => {
    const item = journalRecordToUnifiedItem(makeSwap({ status: 'stale' }));
    expect(presentActivityStatus(item!.status)).toBe('Unresolved');
  });
});

describe('unified activity dedupe', () => {
  it('uses chainId + kind + hash identity', () => {
    const approval = journalRecordToUnifiedItem(makeApproval())!;
    const swap = journalRecordToUnifiedItem(makeSwap())!;
    expect(unifiedActivityDedupeKey(approval)).not.toBe(unifiedActivityDedupeKey(swap));
  });

  it('journal wins over explorer for same swap hash', () => {
    const journal = journalRecordToUnifiedItem(makeSwap({ status: 'pending' }))!;
    const explorer = explorerTransactionToUnifiedItem(makeExplorerTx(), WALLET_A);
    const merged = dedupeUnifiedActivityItems([explorer, journal]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('journal');
    expect(merged[0].status).toBe('pending');
  });

  it('keeps same hash on different chains', () => {
    const chain1 = journalRecordToUnifiedItem(makeSwap({ chainId: 1 }))!;
    const chain56 = journalRecordToUnifiedItem(makeSwap({ chainId: 56, id: '56:swap:' + HASH_SWAP }))!;
    const merged = dedupeUnifiedActivityItems([chain1, chain56]);
    expect(merged).toHaveLength(2);
  });

  it('terminal journal status overrides weaker explorer pending', () => {
    const journal = journalRecordToUnifiedItem(makeSwap({ status: 'confirmed' }))!;
    const explorer = explorerTransactionToUnifiedItem(
      makeExplorerTx({ status: 'pending' }),
      WALLET_A,
    );
    const merged = dedupeUnifiedActivityItems([explorer, journal]);
    expect(merged[0].status).toBe('confirmed');
  });
});

describe('unified activity flow grouping', () => {
  it('groups approval and swap by flowId', () => {
    const items = [
      journalRecordToUnifiedItem(makeSwap())!,
      journalRecordToUnifiedItem(makeApproval())!,
    ];
    const groups = groupUnifiedActivityItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].isFlow).toBe(true);
    expect(groups[0].items[0].kind).toBe('approval');
    expect(groups[0].items[1].kind).toBe('swap');
  });

  it('keeps approval-only flow as single item', () => {
    const items = [journalRecordToUnifiedItem(makeApproval())!];
    const groups = groupUnifiedActivityItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].isFlow).toBe(false);
  });

  it('filters pending tab without hiding unrelated flows entirely', () => {
    const items = [
      journalRecordToUnifiedItem(makeSwap())!,
      journalRecordToUnifiedItem(makeApproval({ status: 'confirmed', flowId: 'flow-2', id: '1:approval:0x' + '8'.repeat(64), transactionHash: '0x' + '8'.repeat(64) }))!,
    ];
    const groups = groupUnifiedActivityItems(items);
    const pending = filterUnifiedActivityGroups(groups, 'pending');
    expect(pending.some((g) => g.items.some((i) => i.kind === 'swap'))).toBe(true);
  });
});

describe('buildUnifiedWalletActivity', () => {
  it('scopes journal records to wallet A', () => {
    const result = buildUnifiedWalletActivity({
      walletAddress: WALLET_A,
      journalRecords: [makeSwap(), makeSwap({ walletAddress: WALLET_B, id: 'other', flowId: 'flow-2', transactionHash: '0x' + '3'.repeat(64) })],
      transferRecords: [],
    });
    expect(result.items.every((i) => i.walletAddress === WALLET_A.toLowerCase() || i.source === 'legacy-transfer')).toBe(true);
    expect(result.items.filter((i) => i.source === 'journal')).toHaveLength(1);
  });

  it('isolates explorer failure from journal rendering', () => {
    const result = buildUnifiedWalletActivity({
      walletAddress: WALLET_A,
      journalRecords: [makeSwap()],
      transferRecords: [],
      explorerTxs: [],
      explorerStatus: 'error',
      explorerMessage: 'timeout',
    });
    expect(result.items).toHaveLength(1);
    expect(result.sources.journal.status).toBe('ok');
    expect(result.sources.explorer.status).toBe('error');
  });

  it('includes legacy transfers independently', () => {
    const result = buildUnifiedWalletActivity({
      walletAddress: WALLET_A,
      journalRecords: [],
      transferRecords: [makeTransfer()],
    });
    expect(result.items.some((i) => i.source === 'legacy-transfer')).toBe(true);
    expect(result.sources.transfers.count).toBe(1);
  });

  it('skips malformed journal records safely', () => {
    const bad = { ...makeSwap(), kind: 'transfer' } as unknown as SwapJournalRecord;
    const result = buildUnifiedWalletActivity({
      walletAddress: WALLET_A,
      journalRecords: [bad, makeSwap()],
      transferRecords: [],
    });
    expect(result.items.filter((i) => i.source === 'journal')).toHaveLength(1);
  });
});

describe('getCompactJournalActivity', () => {
  it('prioritizes attention items and excludes recovery flow', () => {
    const pending = makeSwap({ status: 'pending', flowId: 'flow-pending' });
    const confirmed = makeSwap({
      status: 'confirmed',
      flowId: 'flow-done',
      id: '1:swap:0x' + '4'.repeat(64),
      transactionHash: '0x' + '4'.repeat(64),
      submittedAt: '2026-07-10T12:00:00.000Z',
    });
    const rows = getCompactJournalActivity(WALLET_A, 1, [confirmed, pending], 2, 'flow-pending');
    expect(rows.some((r) => r.flowId === 'flow-pending')).toBe(false);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('fetchUnifiedWalletActivity partial failure', () => {
  it('returns journal data when explorer fetch fails', async () => {
    vi.mocked(getMultiChainTransactions).mockRejectedValueOnce(new Error('network'));
    const result = await fetchUnifiedWalletActivity(WALLET_A, [makeSwap()], []);
    expect(result.items).toHaveLength(1);
    expect(result.sources.explorer.status).toBe('error');
  });
});
