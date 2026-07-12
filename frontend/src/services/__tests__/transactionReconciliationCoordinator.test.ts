import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transactionReconciliationCoordinator } from '@/services/transactionReconciliationCoordinator';
import { useTransactionJournalStore } from '@/stores/transactionJournalStore';
import * as reconciliationProvider from '@/services/reconciliationProvider';
import * as transactionReconciliation from '@/services/transactionReconciliation';

const WALLET = '0x' + 'a'.repeat(40);
const HASH = '0x' + '1'.repeat(64);

describe('transactionReconciliationCoordinator deduplication', () => {
  beforeEach(() => {
    useTransactionJournalStore.setState({
      records: [],
      legacyQuarantine: undefined,
      migratedAt: '2026-07-11T00:00:00.000Z',
      migrationDiagnostics: [],
      hydrationComplete: true,
    });
    vi.restoreAllMocks();
  });

  it('shares one in-flight reconciliation for duplicate triggers', async () => {
    useTransactionJournalStore.getState().journalSwapSubmitted({
      flowId: 'flow-1',
      walletAddress: WALLET,
      chainId: 1,
      transactionHash: HASH,
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
    });
    const record = useTransactionJournalStore.getState().records[0];

    vi.spyOn(reconciliationProvider, 'resolveReconciliationProvider').mockResolvedValue({} as never);
    const reconcileSpy = vi.spyOn(transactionReconciliation, 'reconcileKnownTransaction').mockResolvedValue({
      kind: 'pending',
      transactionSeen: true,
    });

    await Promise.all([
      transactionReconciliationCoordinator.reconcileRecord(record.id, 'manual'),
      transactionReconciliationCoordinator.reconcileRecord(record.id, 'manual'),
    ]);

    expect(reconcileSpy).toHaveBeenCalledTimes(1);
  });

  it('skips reconciliation while active wait is registered', async () => {
    useTransactionJournalStore.getState().journalSwapSubmitted({
      flowId: 'flow-2',
      walletAddress: WALLET,
      chainId: 1,
      transactionHash: HASH,
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
    });
    const record = useTransactionJournalStore.getState().records[0];
    transactionReconciliationCoordinator.registerActiveWait(record.id);

    const reconcileSpy = vi.spyOn(transactionReconciliation, 'reconcileKnownTransaction');
    await transactionReconciliationCoordinator.reconcileRecord(record.id, 'scheduled');
    expect(reconcileSpy).not.toHaveBeenCalled();
  });
});
