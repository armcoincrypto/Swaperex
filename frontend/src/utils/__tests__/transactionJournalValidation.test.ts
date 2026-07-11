import { describe, it, expect } from 'vitest';
import {
  createJournalRecordId,
  createFlowId,
} from '@/utils/transactionJournalIdentity';
import {
  isTransactionHash,
  normalizeTransactionHash,
  normalizeWalletAddress,
  isTransactionJournalRecord,
  isSwapJournalContext,
} from '@/utils/transactionJournalValidation';
import type { SwapJournalRecord } from '@/types/transactionJournal';
import { JOURNAL_RECORD_SCHEMA_VERSION } from '@/types/transactionJournal';

const VALID_HASH = '0x' + 'a'.repeat(64);
const WALLET_A = '0x' + '1'.repeat(40);
const WALLET_B = '0x' + '2'.repeat(40);

function makeSwapRecord(overrides: Partial<SwapJournalRecord> = {}): SwapJournalRecord {
  const id = createJournalRecordId(1, 'swap', VALID_HASH)!;
  return {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id,
    flowId: 'flow-1',
    kind: 'swap',
    source: 'swaperex-client',
    walletAddress: WALLET_A.toLowerCase(),
    chainId: 1,
    transactionHash: VALID_HASH.toLowerCase(),
    status: 'submitted',
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
      inputAmountRaw: '1000000000000000000',
      inputAmountDisplay: '1',
      expectedOutputDisplay: '3000',
      slippageBps: 50,
      provider: 'uniswap-v3',
    },
    ...overrides,
  };
}

describe('transactionJournalIdentity', () => {
  it('creates stable id for same chain/kind/hash', () => {
    const a = createJournalRecordId(1, 'swap', VALID_HASH);
    const b = createJournalRecordId(1, 'swap', VALID_HASH.toUpperCase());
    expect(a).toBe(b);
  });

  it('different chain or kind yields different id', () => {
    const swap = createJournalRecordId(1, 'swap', VALID_HASH);
    const approval = createJournalRecordId(1, 'approval', VALID_HASH);
    const bsc = createJournalRecordId(56, 'swap', VALID_HASH);
    expect(swap).not.toBe(approval);
    expect(swap).not.toBe(bsc);
  });

  it('rejects malformed hash', () => {
    expect(createJournalRecordId(1, 'swap', '0x123')).toBeNull();
  });

  it('creates flow ids', () => {
    const id = createFlowId();
    expect(id.length).toBeGreaterThan(8);
  });
});

describe('transactionJournalValidation', () => {
  it('accepts valid swap record', () => {
    const record = makeSwapRecord();
    expect(isSwapJournalContext(record.context)).toBe(true);
    expect(isTransactionJournalRecord(record)).toBe(true);
  });

  it('rejects invalid hash and wallet', () => {
    expect(isTransactionHash('0x123')).toBe(false);
    expect(normalizeTransactionHash('0x123')).toBeNull();
    expect(normalizeWalletAddress('not-an-address')).toBeNull();
  });

  it('rejects record with mismatched id', () => {
    const record = makeSwapRecord({ id: 'bad-id' });
    expect(isTransactionJournalRecord(record)).toBe(false);
  });
});

describe('wallet normalization', () => {
  it('normalizes wallet casing', () => {
    expect(normalizeWalletAddress(WALLET_A.toUpperCase())).toBe(WALLET_A.toLowerCase());
    expect(normalizeWalletAddress(WALLET_A)).not.toBe(normalizeWalletAddress(WALLET_B));
  });
});
