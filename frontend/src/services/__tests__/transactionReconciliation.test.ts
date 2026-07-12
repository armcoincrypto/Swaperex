import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reconcileKnownTransaction } from '@/services/transactionReconciliation';
import type { SwapJournalRecord } from '@/types/transactionJournal';
import { JOURNAL_RECORD_SCHEMA_VERSION } from '@/types/transactionJournal';

const HASH = '0x' + 'a'.repeat(64);

function makeRecord(): SwapJournalRecord {
  return {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id: `1:swap:${HASH}`,
    flowId: 'flow-1',
    kind: 'swap',
    source: 'swaperex-client',
    walletAddress: '0x' + '1'.repeat(40),
    chainId: 1,
    transactionHash: HASH,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

describe('transactionReconciliation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps successful receipt to confirmed', async () => {
    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: 1,
        blockNumber: 100,
        gasUsed: 21000n,
      }),
      getTransaction: vi.fn(),
    };

    const result = await reconcileKnownTransaction(makeRecord(), {
      readProvider: provider as never,
    });
    expect(result.kind).toBe('confirmed');
    if (result.kind === 'confirmed') {
      expect(result.receipt.status).toBe(1);
    }
  });

  it('maps failed receipt to reverted', async () => {
    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: 0,
        blockNumber: 100,
      }),
      getTransaction: vi.fn(),
    };

    const result = await reconcileKnownTransaction(makeRecord(), {
      readProvider: provider as never,
    });
    expect(result.kind).toBe('reverted');
  });

  it('returns pending when tx exists without receipt', async () => {
    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
      getTransaction: vi.fn().mockResolvedValue({ hash: HASH }),
    };

    const result = await reconcileKnownTransaction(makeRecord(), {
      readProvider: provider as never,
    });
    expect(result).toEqual({ kind: 'pending', transactionSeen: true });
  });

  it('returns not_found when neither tx nor receipt exist', async () => {
    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
      getTransaction: vi.fn().mockResolvedValue(null),
    };

    const result = await reconcileKnownTransaction(makeRecord(), {
      readProvider: provider as never,
    });
    expect(result.kind).toBe('not_found');
  });

  it('returns provider_error on RPC failure', async () => {
    const provider = {
      getTransactionReceipt: vi.fn().mockRejectedValue(new Error('network timeout')),
      getTransaction: vi.fn(),
    };

    const result = await reconcileKnownTransaction(makeRecord(), {
      readProvider: provider as never,
    });
    expect(result.kind).toBe('provider_error');
  });
});
