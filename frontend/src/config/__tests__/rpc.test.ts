import { describe, it, expect } from 'vitest';
import { shouldPreferSameOriginRpcProxy } from '../rpc';

describe('config/rpc', () => {
  describe('shouldPreferSameOriginRpcProxy', () => {
    it('returns false for localhost preview hosts', () => {
      expect(shouldPreferSameOriginRpcProxy('127.0.0.1')).toBe(false);
      expect(shouldPreferSameOriginRpcProxy('localhost')).toBe(false);
      expect(shouldPreferSameOriginRpcProxy('[::1]')).toBe(false);
    });

    it('returns true for production hostname in prod builds', () => {
      if (!import.meta.env.PROD) {
        expect(shouldPreferSameOriginRpcProxy('dex.kobbex.com')).toBe(false);
        return;
      }
      expect(shouldPreferSameOriginRpcProxy('dex.kobbex.com')).toBe(true);
    });
  });
});
