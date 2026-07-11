import { describe, it, expect, beforeEach } from 'vitest';
import { useTransactionJournalStore } from '@/stores/transactionJournalStore';
import { createFlowId } from '@/utils/transactionJournalIdentity';

const WALLET_A = '0x' + 'a'.repeat(40);
const WALLET_B = '0x' + 'b'.repeat(40);
const HASH_A = '0x' + '1'.repeat(64);
const HASH_B = '0x' + '2'.repeat(64);

describe('transactionJournalStore', () => {
  beforeEach(() => {
    useTransactionJournalStore.setState({
      records: [],
      legacyQuarantine: undefined,
      migratedAt: '2026-07-11T00:00:00.000Z',
      migrationDiagnostics: [],
      hydrationComplete: true,
    });
  });

  it('journals swap and approval idempotently', () => {
    const flowId = createFlowId();
    const context = {
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
    };

    const first = useTransactionJournalStore.getState().journalSwapSubmitted({
      flowId,
      walletAddress: WALLET_A,
      chainId: 1,
      transactionHash: HASH_A,
      context,
    });
    const second = useTransactionJournalStore.getState().journalSwapSubmitted({
      flowId,
      walletAddress: WALLET_A,
      chainId: 1,
      transactionHash: HASH_A,
      context,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(useTransactionJournalStore.getState().records).toHaveLength(1);
  });

  it('isolates wallet A from wallet B', () => {
    const flowId = createFlowId();
    const context = {
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
    };

    useTransactionJournalStore.getState().journalSwapSubmitted({
      flowId,
      walletAddress: WALLET_A,
      chainId: 1,
      transactionHash: HASH_A,
      context,
    });
    useTransactionJournalStore.getState().journalSwapSubmitted({
      flowId: createFlowId(),
      walletAddress: WALLET_B,
      chainId: 1,
      transactionHash: HASH_B,
      context,
    });

    const walletARecords = useTransactionJournalStore.getState().getRecordsForWallet(WALLET_A);
    expect(walletARecords).toHaveLength(1);
    expect(walletARecords[0].walletAddress).toBe(WALLET_A.toLowerCase());
    expect(walletARecords[0].transactionHash).toBe(HASH_A.toLowerCase());
  });

  it('links approval and swap records', () => {
    const flowId = createFlowId();
    const approval = useTransactionJournalStore.getState().journalApprovalSubmitted({
      flowId,
      walletAddress: WALLET_A,
      chainId: 1,
      transactionHash: HASH_A,
      context: {
        tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        tokenSymbol: 'USDT',
        tokenDecimals: 6,
        spenderAddress: '0x' + '3'.repeat(40),
        approvalMode: 'exact',
        provider: 'uniswap-v3',
      },
    });
    const swap = useTransactionJournalStore.getState().journalSwapSubmitted({
      flowId,
      walletAddress: WALLET_A,
      chainId: 1,
      transactionHash: HASH_B,
      context: {
        fromTokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        fromTokenSymbol: 'USDT',
        fromTokenDecimals: 6,
        toTokenAddress: 'native',
        toTokenSymbol: 'ETH',
        toTokenDecimals: 18,
        inputAmountRaw: '1',
        inputAmountDisplay: '1',
        expectedOutputDisplay: '1',
        slippageBps: 50,
        provider: 'uniswap-v3',
      },
    });

    expect(approval.ok && swap.ok).toBe(true);
    if (!approval.ok || !swap.ok) return;

    useTransactionJournalStore.getState().linkApprovalAndSwap(approval.record.id, swap.record.id);
    const linkedSwap = useTransactionJournalStore.getState().getSwapForApproval(approval.record.id);
    expect(linkedSwap?.context.approvalRecordId).toBe(approval.record.id);
  });

  it('applies receipt-backed confirmed transition', () => {
    const flowId = createFlowId();
    const submitted = useTransactionJournalStore.getState().journalSwapSubmitted({
      flowId,
      walletAddress: WALLET_A,
      chainId: 1,
      transactionHash: HASH_A,
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
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    const confirmed = useTransactionJournalStore.getState().applyConfirmedReceipt(submitted.record.id, {
      status: 1,
      blockNumber: 100,
      confirmedAt: '2026-07-11T12:01:00.000Z',
    });
    expect(confirmed.ok).toBe(true);
    expect(confirmed.ok && confirmed.record.status).toBe('confirmed');
  });
});
