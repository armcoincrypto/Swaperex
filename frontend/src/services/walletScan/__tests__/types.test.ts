import { describe, it, expect } from 'vitest';
import { SCAN_CHAIN_IDS, CHAIN_ID_TO_SCAN_NAME } from '../types';

describe('walletScan/types', () => {
  describe('SCAN_CHAIN_IDS', () => {
    it('maps chain names to correct IDs', () => {
      expect(SCAN_CHAIN_IDS.ethereum).toBe(1);
      expect(SCAN_CHAIN_IDS.bsc).toBe(56);
      expect(SCAN_CHAIN_IDS.polygon).toBe(137);
    });
  });

  describe('CHAIN_ID_TO_SCAN_NAME', () => {
    it('maps chain IDs back to names', () => {
      expect(CHAIN_ID_TO_SCAN_NAME[1]).toBe('ethereum');
      expect(CHAIN_ID_TO_SCAN_NAME[56]).toBe('bsc');
      expect(CHAIN_ID_TO_SCAN_NAME[137]).toBe('polygon');
    });

    it('is consistent with SCAN_CHAIN_IDS', () => {
      for (const [name, id] of Object.entries(SCAN_CHAIN_IDS)) {
        expect(CHAIN_ID_TO_SCAN_NAME[id]).toBe(name);
      }
    });
  });
});
