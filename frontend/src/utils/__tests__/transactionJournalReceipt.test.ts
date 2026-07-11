import { describe, it, expect } from 'vitest';
import { normalizeReceipt } from '@/utils/transactionJournalReceipt';

describe('transactionJournalReceipt', () => {
  it('normalizes successful receipt', () => {
    const snapshot = normalizeReceipt({
      status: 1,
      blockNumber: 12345,
      gasUsed: 21000n,
      effectiveGasPrice: 1000000000n,
    });
    expect(snapshot?.status).toBe(1);
    expect(snapshot?.blockNumber).toBe(12345);
    expect(snapshot?.gasUsed).toBe('21000');
  });

  it('rejects ambiguous receipt status', () => {
    expect(normalizeReceipt({ status: null, blockNumber: 1 })).toBeNull();
  });
});
