import { describe, it, expect } from 'vitest';
import { migrateLegacyTransactionStorage } from '@/services/transactionJournalMigration';
import { JOURNAL_ENVELOPE_SCHEMA_VERSION, JOURNAL_RECORD_SCHEMA_VERSION } from '@/types/transactionJournal';

describe('transactionJournalMigration', () => {
  it('migrates wallet-scoped pending swap v1', () => {
    const pendingRaw = JSON.stringify({
      v: 1,
      chainId: 1,
      fromAddress: '0x' + 'a'.repeat(40),
      txHash: '0x' + '1'.repeat(64),
      explorerUrl: 'https://etherscan.io/tx/0x1',
      submittedAt: Date.now(),
      fromSymbol: 'ETH',
      toSymbol: 'USDC',
      fromAmount: '1',
      toAmount: '3000',
    });

    const result = migrateLegacyTransactionStorage({
      existingEnvelope: null,
      pendingRaw,
      historyRaw: null,
    });

    expect(result.envelope.records).toHaveLength(1);
    expect(result.envelope.records[0].kind).toBe('swap');
    expect(result.envelope.records[0].walletAddress).toBe('0x' + 'a'.repeat(40));
    expect(result.envelope.migratedAt).toBeTruthy();
  });

  it('quarantines unscoped legacy history', () => {
    const historyRaw = JSON.stringify({
      state: {
        records: [
          {
            id: 'legacy-1',
            timestamp: Date.now(),
            chainId: 1,
            fromAsset: { symbol: 'ETH', name: 'ETH', chain: 'ethereum', decimals: 18, is_native: true },
            toAsset: { symbol: 'USDC', name: 'USDC', chain: 'ethereum', decimals: 6, is_native: false, contract_address: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
            fromAmount: '1',
            toAmount: '3000',
            txHash: '0x' + '2'.repeat(64),
            explorerUrl: 'https://etherscan.io/tx/0x2',
            status: 'success',
            provider: 'uniswap-v3',
            slippage: 0.5,
          },
        ],
      },
    });

    const result = migrateLegacyTransactionStorage({
      existingEnvelope: {
        schemaVersion: JOURNAL_ENVELOPE_SCHEMA_VERSION,
        recordSchemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
        records: [],
      },
      pendingRaw: null,
      historyRaw,
    });

    expect(result.envelope.records).toHaveLength(0);
    expect(result.envelope.legacyQuarantine?.length).toBe(1);
    expect(result.envelope.legacyQuarantine?.[0].reason).toBe('missing_wallet');
  });

  it('is idempotent when migratedAt already set', () => {
    const envelope = {
      schemaVersion: JOURNAL_ENVELOPE_SCHEMA_VERSION,
      recordSchemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
      migratedAt: '2026-07-11T00:00:00.000Z',
      records: [],
    };
    const result = migrateLegacyTransactionStorage({
      existingEnvelope: envelope,
      pendingRaw: JSON.stringify({ v: 1, chainId: 1, fromAddress: '0x' + 'a'.repeat(40), txHash: '0x' + '1'.repeat(64), explorerUrl: '', submittedAt: 1, fromSymbol: 'ETH', toSymbol: 'USDC', fromAmount: '1', toAmount: '1' }),
      historyRaw: null,
    });
    expect(result.migratedCount).toBe(0);
    expect(result.diagnostics).toContain('migration_already_applied');
  });
});
