import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionDetailsDialog } from '../TransactionDetailsDialog';
import { buildDetailFromJournalRecord } from '@/services/transactionDetailService';
import type { SwapJournalRecord } from '@/types/transactionJournal';
import { JOURNAL_RECORD_SCHEMA_VERSION } from '@/types/transactionJournal';

vi.mock('@/utils/clipboard', () => ({
  copyTextToClipboard: vi.fn().mockResolvedValue('success'),
}));

const WALLET = '0x' + 'a'.repeat(40);
const HASH = '0x' + '1'.repeat(64);

function makeDetail() {
  const record: SwapJournalRecord = {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id: `1:swap:${HASH}`,
    flowId: 'flow-1',
    kind: 'swap',
    source: 'swaperex-client',
    walletAddress: WALLET,
    chainId: 1,
    transactionHash: HASH,
    status: 'pending',
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
  return buildDetailFromJournalRecord(record, [record], WALLET)!;
}

describe('TransactionDetailsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders summary and transaction sections', () => {
    render(
      <TransactionDetailsDialog isOpen onClose={() => {}} model={makeDetail()} />,
    );
    expect(screen.getByTestId('transaction-details-dialog')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Transaction')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Swap' })).toBeInTheDocument();
  });

  it('shows privacy disclosure and support copy actions', () => {
    render(
      <TransactionDetailsDialog isOpen onClose={() => {}} model={makeDetail()} />,
    );
    expect(screen.getByText(/do not include private keys/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy support details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument();
  });

  it('copies transaction hash on demand', async () => {
    const { copyTextToClipboard } = await import('@/utils/clipboard');
    render(
      <TransactionDetailsDialog isOpen onClose={() => {}} model={makeDetail()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy hash' }));
    expect(copyTextToClipboard).toHaveBeenCalledWith(HASH);
  });

  it('falls back when model is unavailable', () => {
    render(<TransactionDetailsDialog isOpen onClose={() => {}} model={null} />);
    expect(screen.getByText(/unavailable for this record/i)).toBeInTheDocument();
  });
});
