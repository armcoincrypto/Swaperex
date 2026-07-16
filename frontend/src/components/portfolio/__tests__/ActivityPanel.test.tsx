import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ActivityPanel } from '../ActivityPanel';
import { useWalletStore } from '@/stores/walletStore';
import { useTransactionJournalStore } from '@/stores/transactionJournalStore';
import { useSwapHistoryStore } from '@/stores/swapHistoryStore';
import type { SwapJournalRecord } from '@/types/transactionJournal';
import { JOURNAL_RECORD_SCHEMA_VERSION } from '@/types/transactionJournal';

vi.mock('@/services/transactionHistory', () => ({
  getMultiChainTransactions: vi.fn().mockResolvedValue([]),
  formatTimeAgo: () => '1m ago',
}));

vi.mock('@/services/transactionReconciliationCoordinator', () => ({
  transactionReconciliationCoordinator: {
    reconcileWallet: vi.fn().mockResolvedValue(undefined),
  },
}));

const WALLET = '0x' + 'a'.repeat(40);
const HASH = '0x' + '1'.repeat(64);

function seedSwap(status: SwapJournalRecord['status'] = 'confirmed') {
  const record: SwapJournalRecord = {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id: `1:swap:${HASH}`,
    flowId: 'flow-ui',
    kind: 'swap',
    source: 'swaperex-client',
    walletAddress: WALLET,
    chainId: 1,
    transactionHash: HASH,
    status,
    submittedAt: '2026-07-11T12:00:00.000Z',
    updatedAt: '2026-07-11T12:00:00.000Z',
    relatedRecordIds: [],
    explorerUrl: 'https://etherscan.io/tx/' + HASH,
    context: {
      fromTokenAddress: 'native',
      fromTokenSymbol: 'ETH',
      fromTokenDecimals: 18,
      toTokenAddress: '0x' + '2'.repeat(40),
      toTokenSymbol: 'USDC',
      toTokenDecimals: 6,
      inputAmountRaw: '1',
      inputAmountDisplay: '1',
      expectedOutputDisplay: '2000',
      slippageBps: 50,
      provider: 'uniswap-v3',
    },
  };
  useTransactionJournalStore.setState({ records: [record] });
  useSwapHistoryStore.getState().syncFromJournal();
}

describe('ActivityPanel', () => {
  beforeEach(() => {
    useWalletStore.setState({
      address: WALLET,
      isConnected: true,
      chainId: 1,
    });
    useTransactionJournalStore.setState({ records: [] });
    useSwapHistoryStore.setState({ transferRecords: [], records: [] });
  });

  it('shows disconnected empty state', () => {
    useWalletStore.setState({ isConnected: false, address: null });
    render(<ActivityPanel />);
    expect(screen.getByText(/Connect a wallet to view activity/i)).toBeInTheDocument();
  });

  it('shows device-local disclaimer', async () => {
    seedSwap();
    render(<ActivityPanel />);
    expect(screen.getByTestId('activity-disclaimer')).toHaveTextContent(/stored on this device/i);
  });

  it('renders journal swap with source and kind labels', async () => {
    seedSwap();
    render(<ActivityPanel />);
    await waitFor(() => {
      expect(screen.getAllByTestId('activity-row').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Kobbex')).toBeInTheDocument();
    expect(screen.getByText(/ETH → USDC/)).toBeInTheDocument();
  });

  it('shows no-history empty state when wallet has no records', async () => {
    render(<ActivityPanel />);
    await waitFor(() => {
      expect(
        screen.getByText(/No Kobbex transactions have been saved on this device yet/i),
      ).toBeInTheDocument();
    });
  });

  it('filters pending items', async () => {
    seedSwap('pending');
    render(<ActivityPanel />);
    await waitFor(() => expect(screen.getAllByTestId('activity-row').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('tab', { name: 'Pending' }));
    expect(screen.getAllByTestId('activity-row').length).toBeGreaterThan(0);
  });

  it('shows explorer error without hiding journal rows', async () => {
    const { getMultiChainTransactions } = await import('@/services/transactionHistory');
    vi.mocked(getMultiChainTransactions).mockRejectedValueOnce(new Error('down'));
    seedSwap();
    render(<ActivityPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('explorer-error')).toBeInTheDocument();
      expect(screen.getAllByTestId('activity-row').length).toBeGreaterThan(0);
    });
  });

  it('refresh activity triggers reconciliation coordinator', async () => {
    const { transactionReconciliationCoordinator } = await import(
      '@/services/transactionReconciliationCoordinator'
    );
    seedSwap();
    render(<ActivityPanel />);
    await waitFor(() => expect(screen.getByText('Refresh activity')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Refresh activity'));
    expect(transactionReconciliationCoordinator.reconcileWallet).toHaveBeenCalled();
  });
});
