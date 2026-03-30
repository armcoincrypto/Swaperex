import { describe, it, expect } from 'vitest';
import {
  normalizeLocalRecord,
  normalizeTransaction,
  mergeLocalAndExplorer,
  exportActivityCsv,
  exportActivityJson,
} from '../activityService';
import type { SwapRecord } from '@/stores/swapHistoryStore';
import type { Transaction } from '@/services/transactionHistory';

// ── Test Fixtures ──────────────────────────────────────────────────

function makeSwapRecord(overrides: Partial<SwapRecord> = {}): SwapRecord {
  return {
    id: 'rec-1',
    timestamp: 1700000000000,
    chainId: 1,
    fromAsset: {
      symbol: 'ETH', name: 'Ethereum', chain: 'ethereum',
      decimals: 18, is_native: true, contract_address: '0xeee',
    },
    toAsset: {
      symbol: 'USDT', name: 'Tether', chain: 'ethereum',
      decimals: 6, is_native: false, contract_address: '0xdac17',
    },
    fromAmount: '1.0',
    toAmount: '3000.123456',
    txHash: '0xabc123',
    explorerUrl: 'https://etherscan.io/tx/0xabc123',
    status: 'success',
    provider: '1inch',
    slippage: 0.5,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    hash: '0xdef456',
    from: '0x1111',
    to: '0x2222',
    value: '1000000000000000000',
    valueFormatted: '1.0 ETH',
    timestamp: 1700000500000,
    blockNumber: 12345,
    isSwap: true,
    swapRouter: 'Uniswap V3',
    status: 'success',
    explorerUrl: 'https://etherscan.io/tx/0xdef456',
    chainId: 1,
    methodId: '0x04e45aaf',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('activityService', () => {
  describe('normalizeLocalRecord', () => {
    it('creates an ActivityItem from a SwapRecord', () => {
      const item = normalizeLocalRecord(makeSwapRecord());
      expect(item.id).toBe('local:0xabc123');
      expect(item.type).toBe('swap');
      expect(item.status).toBe('success');
      expect(item.title).toBe('ETH → USDT');
      expect(item.canRepeat).toBe(true);
      expect(item.localRecord).toBeTruthy();
      expect(item.tokenIn?.symbol).toBe('ETH');
      expect(item.tokenOut?.symbol).toBe('USDT');
    });

    it('marks failed swaps as non-repeatable', () => {
      const item = normalizeLocalRecord(makeSwapRecord({ status: 'failed' }));
      expect(item.canRepeat).toBe(false);
    });

    it('marks uncertain swaps as non-repeatable and preserves status', () => {
      const item = normalizeLocalRecord(makeSwapRecord({ status: 'uncertain' }));
      expect(item.status).toBe('uncertain');
      expect(item.canRepeat).toBe(false);
    });

    it('includes quoted tilde output and min on success when minimumToAmount set', () => {
      const item = normalizeLocalRecord(
        makeSwapRecord({
          status: 'success',
          minimumToAmount: '2990',
          toAmount: '3000.123456',
        })
      );
      expect(item.detail).toContain('~3000.1235');
      expect(item.detail).toContain('min 2990');
    });
  });

  describe('normalizeTransaction', () => {
    it('creates an ActivityItem from a Transaction', () => {
      const item = normalizeTransaction(makeTransaction());
      expect(item.id).toBe('chain:0xdef456');
      expect(item.type).toBe('swap');
      expect(item.title).toBe('Uniswap V3');
      expect(item.canRepeat).toBe(false);
    });

    it('marks non-swap as transfer', () => {
      const item = normalizeTransaction(makeTransaction({ isSwap: false }));
      expect(item.type).toBe('transfer');
    });
  });

  describe('mergeLocalAndExplorer', () => {
    it('merges and sorts by timestamp descending', () => {
      const local = [makeSwapRecord({ timestamp: 1700000000000 })];
      const explorer = [makeTransaction({ timestamp: 1700000500000 })];
      const merged = mergeLocalAndExplorer(local, explorer);

      expect(merged.length).toBe(2);
      expect(merged[0].ts).toBe(1700000500000); // explorer tx is newer
      expect(merged[1].ts).toBe(1700000000000);
    });

    it('deduplicates by txHash (local wins)', () => {
      const txHash = '0xSAME';
      const local = [makeSwapRecord({ txHash })];
      const explorer = [makeTransaction({ hash: txHash })];
      const merged = mergeLocalAndExplorer(local, explorer);

      expect(merged.length).toBe(1);
      expect(merged[0].id).toBe(`local:${txHash}`); // local wins
      expect(merged[0].canRepeat).toBe(true); // has repeat ability
    });

    it('handles empty local records', () => {
      const merged = mergeLocalAndExplorer([], [makeTransaction()]);
      expect(merged.length).toBe(1);
    });

    it('handles empty explorer results', () => {
      const merged = mergeLocalAndExplorer([makeSwapRecord()], []);
      expect(merged.length).toBe(1);
    });

    it('handles both empty', () => {
      expect(mergeLocalAndExplorer([], []).length).toBe(0);
    });

    it('case-insensitive txHash dedup', () => {
      const local = [makeSwapRecord({ txHash: '0xABC' })];
      const explorer = [makeTransaction({ hash: '0xabc' })];
      const merged = mergeLocalAndExplorer(local, explorer);
      expect(merged.length).toBe(1);
    });
  });

  describe('exportActivityCsv', () => {
    it('produces valid CSV with header', () => {
      const items = [normalizeLocalRecord(makeSwapRecord())];
      const csv = exportActivityCsv(items);
      const lines = csv.split('\n');

      expect(lines[0]).toContain('Time,Type,Status');
      expect(lines.length).toBe(2); // header + 1 row
    });

    it('returns only header for empty items', () => {
      const csv = exportActivityCsv([]);
      const lines = csv.split('\n');
      expect(lines.length).toBe(1);
    });
  });

  describe('exportActivityJson', () => {
    it('produces valid JSON without localRecord', () => {
      const items = [normalizeLocalRecord(makeSwapRecord())];
      const json = exportActivityJson(items);
      const parsed = JSON.parse(json);

      expect(parsed.length).toBe(1);
      expect(parsed[0].localRecord).toBeUndefined(); // stripped
      expect(parsed[0].id).toBe('local:0xabc123');
    });
  });
});
