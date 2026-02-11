import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateBackoffDelay,
  calculateNextRetry,
  isInBackoff,
  getHealthStatus,
  isStaleDataValid,
  createInitialHealth,
  formatUsdStrict,
  formatUsdStrictPrivate,
  formatMsAgo,
  redactAddress,
  redactError,
} from '../chainHealth';
import { usePortfolioStore, formatUsdPrivate } from '@/stores/portfolioStore';
import type { ChainBalance } from '@/services/portfolioTypes';

// ── Helpers ──────────────────────────────────────────────────────

function makeChainBalance(overrides: Partial<ChainBalance> = {}): ChainBalance {
  return {
    chain: 'ethereum',
    chainId: 1,
    nativeBalance: {
      symbol: 'ETH',
      name: 'Ethereum',
      address: '0xeee',
      decimals: 18,
      balance: '1000000000000000000',
      balanceFormatted: '1.0',
      usdValue: '3000.00',
      usdPrice: '3000.00',
      isNative: true,
      chain: 'ethereum',
    },
    tokenBalances: [],
    totalUsdValue: '3000.00',
    lastUpdated: Date.now(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('chainHealth utilities', () => {
  // ─── Backoff ───────────────────────────────────────────────

  describe('calculateBackoffDelay', () => {
    it('returns 5s for 1 failure', () => {
      expect(calculateBackoffDelay(1)).toBe(5_000);
    });

    it('returns 15s for 2 failures', () => {
      expect(calculateBackoffDelay(2)).toBe(15_000);
    });

    it('returns 45s for 3 failures', () => {
      expect(calculateBackoffDelay(3)).toBe(45_000);
    });

    it('returns 120s max for 4+ failures', () => {
      expect(calculateBackoffDelay(4)).toBe(120_000);
      expect(calculateBackoffDelay(10)).toBe(120_000);
    });
  });

  describe('calculateNextRetry', () => {
    it('returns a future timestamp', () => {
      const now = Date.now();
      const nextRetry = calculateNextRetry(1);
      // Should be in the future (within 5s ±20% = 4s–6s)
      expect(nextRetry).toBeGreaterThan(now);
      expect(nextRetry).toBeLessThanOrEqual(now + 6_100);
    });

    it('increases with failure count', () => {
      // Multiple samples to account for jitter
      const r1 = calculateNextRetry(1) - Date.now();
      const r3 = calculateNextRetry(3) - Date.now();
      // r3 (45s ±20%) should always be larger than r1 (5s ±20%) max
      expect(r3).toBeGreaterThan(r1);
    });
  });

  describe('isInBackoff', () => {
    it('returns false for undefined health', () => {
      expect(isInBackoff(undefined)).toBe(false);
    });

    it('returns false for zero failures', () => {
      expect(isInBackoff(createInitialHealth())).toBe(false);
    });

    it('returns false for ok status even with failures (transient tolerance)', () => {
      const health = {
        ...createInitialHealth(),
        status: 'ok' as const,
        failureCount: 1,
        nextRetryAt: Date.now() + 10_000,
      };
      expect(isInBackoff(health)).toBe(false);
    });

    it('returns true for degraded status when nextRetryAt is in the future', () => {
      const health = {
        ...createInitialHealth(),
        status: 'degraded' as const,
        failureCount: 2,
        nextRetryAt: Date.now() + 10_000,
      };
      expect(isInBackoff(health)).toBe(true);
    });

    it('returns false when nextRetryAt has passed', () => {
      const health = {
        ...createInitialHealth(),
        status: 'degraded' as const,
        failureCount: 2,
        nextRetryAt: Date.now() - 1_000,
      };
      expect(isInBackoff(health)).toBe(false);
    });
  });

  describe('getHealthStatus', () => {
    it('returns ok for 0 failures', () => {
      expect(getHealthStatus(0)).toBe('ok');
    });

    it('returns ok for 1 failure (transient tolerance)', () => {
      expect(getHealthStatus(1)).toBe('ok');
    });

    it('returns degraded for 2 failures (DEGRADED_THRESHOLD)', () => {
      expect(getHealthStatus(2)).toBe('degraded');
    });

    it('returns down for 3+ failures', () => {
      expect(getHealthStatus(3)).toBe('down');
      expect(getHealthStatus(10)).toBe('down');
    });
  });

  // ─── Stale Data ────────────────────────────────────────────

  describe('isStaleDataValid', () => {
    it('returns false for 0 timestamp', () => {
      expect(isStaleDataValid(0)).toBe(false);
    });

    it('returns true for recent success (5 min)', () => {
      expect(isStaleDataValid(Date.now() - 5 * 60_000)).toBe(true);
    });

    it('returns true at boundary (29 min)', () => {
      expect(isStaleDataValid(Date.now() - 29 * 60_000)).toBe(true);
    });

    it('returns false when expired (>30 min)', () => {
      expect(isStaleDataValid(Date.now() - 31 * 60_000)).toBe(false);
    });
  });

  // ─── Store Health Actions ──────────────────────────────────

  describe('portfolioStore chain health actions', () => {
    beforeEach(() => {
      usePortfolioStore.setState({
        chainHealth: {},
        errors: {},
        portfolio: null,
        loading: false,
        updatedAt: 0,
        searchQuery: '',
      });
    });

    it('recordChainSuccess resets failure count and records latency', () => {
      const store = usePortfolioStore.getState();
      const balance = makeChainBalance();
      store.recordChainSuccess('ethereum', balance, 150);

      const health = usePortfolioStore.getState().chainHealth.ethereum;
      expect(health).toBeDefined();
      expect(health!.status).toBe('ok');
      expect(health!.failureCount).toBe(0);
      expect(health!.lastLatencyMs).toBe(150);
      expect(health!.lastError).toBeNull();
      expect(health!.staleData).toBe(balance);
    });

    it('recordChainFailure increments failure count (1st failure stays ok)', () => {
      const store = usePortfolioStore.getState();
      store.recordChainFailure('polygon', 'RPC timeout');

      const health = usePortfolioStore.getState().chainHealth.polygon;
      expect(health).toBeDefined();
      expect(health!.failureCount).toBe(1);
      expect(health!.status).toBe('ok');
      expect(health!.lastError).toBe('RPC timeout');
      expect(health!.nextRetryAt).toBeGreaterThan(Date.now());
    });

    it('2nd consecutive failure transitions to degraded', () => {
      const store = usePortfolioStore.getState();
      store.recordChainFailure('polygon', 'RPC timeout');
      store.recordChainFailure('polygon', 'RPC timeout again');

      const health = usePortfolioStore.getState().chainHealth.polygon;
      expect(health!.failureCount).toBe(2);
      expect(health!.status).toBe('degraded');
    });

    it('consecutive failures increase backoff and change status to down', () => {
      const store = usePortfolioStore.getState();
      store.recordChainFailure('polygon', 'Error 1');
      store.recordChainFailure('polygon', 'Error 2');
      store.recordChainFailure('polygon', 'Error 3');

      const health = usePortfolioStore.getState().chainHealth.polygon;
      expect(health!.failureCount).toBe(3);
      expect(health!.status).toBe('down');
    });

    it('success after failures resets to ok', () => {
      const store = usePortfolioStore.getState();
      store.recordChainFailure('bsc', 'Error 1');
      store.recordChainFailure('bsc', 'Error 2');

      expect(usePortfolioStore.getState().chainHealth.bsc!.status).toBe('degraded');

      store.recordChainSuccess('bsc', makeChainBalance({ chain: 'bsc' }), 100);

      const health = usePortfolioStore.getState().chainHealth.bsc;
      expect(health!.status).toBe('ok');
      expect(health!.failureCount).toBe(0);
      expect(health!.nextRetryAt).toBe(0);
    });

    it('all chains fail once → none show degraded (transient tolerance)', () => {
      const store = usePortfolioStore.getState();
      store.recordChainFailure('ethereum', 'CORS error');
      store.recordChainFailure('bsc', 'Rate limited');
      store.recordChainFailure('polygon', 'Timeout');

      const state = usePortfolioStore.getState();
      expect(state.chainHealth.ethereum!.status).toBe('ok');
      expect(state.chainHealth.bsc!.status).toBe('ok');
      expect(state.chainHealth.polygon!.status).toBe('ok');
    });

    it('failure preserves staleData from prior success within TTL', () => {
      const store = usePortfolioStore.getState();
      const balance = makeChainBalance();
      store.recordChainSuccess('ethereum', balance, 100);

      // Now fail
      store.recordChainFailure('ethereum', 'Network error');

      const health = usePortfolioStore.getState().chainHealth.ethereum;
      expect(health!.staleData).toBe(balance);
    });

    it('batchRecordChainResults: all-fail-once leaves all chains ok', () => {
      const store = usePortfolioStore.getState();
      store.batchRecordChainResults({
        chainResults: [
          { chain: 'ethereum', success: false, balance: null, latencyMs: 0, error: 'CORS' },
          { chain: 'bsc', success: false, balance: null, latencyMs: 0, error: 'Timeout' },
          { chain: 'polygon', success: false, balance: null, latencyMs: 0, error: '429' },
        ],
        pricing: { lastFetchAt: Date.now(), lastError: null, tokensPriced: 0, tokensMissing: 0 },
      });

      const state = usePortfolioStore.getState();
      expect(state.chainHealth.ethereum!.status).toBe('ok');
      expect(state.chainHealth.bsc!.status).toBe('ok');
      expect(state.chainHealth.polygon!.status).toBe('ok');
      expect(state.chainHealth.ethereum!.failureCount).toBe(1);
    });

    it('batchRecordChainResults: 2nd batch failure transitions to degraded', () => {
      const store = usePortfolioStore.getState();
      // First batch — all fail
      store.batchRecordChainResults({
        chainResults: [
          { chain: 'ethereum', success: false, balance: null, latencyMs: 0, error: 'CORS' },
        ],
        pricing: { lastFetchAt: Date.now(), lastError: null, tokensPriced: 0, tokensMissing: 0 },
      });
      expect(usePortfolioStore.getState().chainHealth.ethereum!.status).toBe('ok');

      // Second batch — still failing
      store.batchRecordChainResults({
        chainResults: [
          { chain: 'ethereum', success: false, balance: null, latencyMs: 0, error: 'CORS again' },
        ],
        pricing: { lastFetchAt: Date.now(), lastError: null, tokensPriced: 0, tokensMissing: 0 },
      });
      expect(usePortfolioStore.getState().chainHealth.ethereum!.status).toBe('degraded');
      expect(usePortfolioStore.getState().chainHealth.ethereum!.failureCount).toBe(2);
    });
  });

  // ─── Formatting ────────────────────────────────────────────

  describe('formatUsdStrict', () => {
    it('returns — for null', () => {
      expect(formatUsdStrict(null)).toBe('—');
    });

    it('returns — for undefined', () => {
      expect(formatUsdStrict(undefined)).toBe('—');
    });

    it('returns — for NaN string', () => {
      expect(formatUsdStrict('not-a-number')).toBe('—');
    });

    it('formats zero', () => {
      expect(formatUsdStrict(0)).toBe('$0.00');
    });

    it('formats small value (< $0.01)', () => {
      expect(formatUsdStrict(0.005)).toBe('< $0.01');
    });

    it('formats normal values', () => {
      expect(formatUsdStrict(42.50)).toBe('$42.50');
      expect(formatUsdStrict('100.00')).toBe('$100.00');
    });

    it('formats thousands with K suffix', () => {
      expect(formatUsdStrict(15000)).toBe('$15.00K');
    });

    it('formats millions with M suffix', () => {
      expect(formatUsdStrict(1500000)).toBe('$1.50M');
    });

    it('always shows 2 decimal places', () => {
      expect(formatUsdStrict(1)).toBe('$1.00');
      expect(formatUsdStrict(99.1)).toBe('$99.10');
    });
  });

  describe('formatUsdStrictPrivate', () => {
    it('returns **** in privacy mode', () => {
      expect(formatUsdStrictPrivate(15000, true)).toBe('****');
    });

    it('formats normally when privacy is off', () => {
      expect(formatUsdStrictPrivate(42.5, false)).toBe('$42.50');
    });

    it('returns — for null in privacy off', () => {
      expect(formatUsdStrictPrivate(null, false)).toBe('—');
    });
  });

  // ─── Redaction ─────────────────────────────────────────────

  describe('redactAddress', () => {
    it('redacts standard EVM address', () => {
      expect(redactAddress('0x509c9f07f7476a81d31e5ec36B5d0196')).toBe('0x509c…0196');
    });

    it('handles null', () => {
      expect(redactAddress(null)).toBe('(no address)');
    });

    it('handles short string', () => {
      expect(redactAddress('0x123')).toBe('(no address)');
    });
  });

  describe('redactError', () => {
    it('strips API keys from URLs', () => {
      const err = 'fetch https://api.example.com?apikey=SECRET123 failed';
      expect(redactError(err)).not.toContain('SECRET123');
    });

    it('truncates long errors', () => {
      const longErr = 'a'.repeat(200);
      expect(redactError(longErr).length).toBeLessThanOrEqual(120);
    });

    it('handles null', () => {
      expect(redactError(null)).toBe('(none)');
    });
  });

  // ─── formatMsAgo ──────────────────────────────────────────

  describe('formatMsAgo', () => {
    it('returns never for 0', () => {
      expect(formatMsAgo(0)).toBe('never');
    });

    it('returns just now for recent', () => {
      expect(formatMsAgo(Date.now() - 500)).toBe('just now');
    });

    it('returns seconds ago', () => {
      expect(formatMsAgo(Date.now() - 30_000)).toBe('30s ago');
    });

    it('returns minutes ago', () => {
      expect(formatMsAgo(Date.now() - 5 * 60_000)).toBe('5m ago');
    });
  });

  // ─── formatUsdPrivate (from portfolioStore) ────────────────

  describe('formatUsdPrivate production rules', () => {
    it('returns < $0.01 for tiny values', () => {
      expect(formatUsdPrivate(0.005, false)).toBe('< $0.01');
    });

    it('returns $0.00 for exactly zero', () => {
      expect(formatUsdPrivate(0, false)).toBe('$0.00');
    });

    it('hides in privacy mode', () => {
      expect(formatUsdPrivate(42.5, true)).toBe('****');
    });
  });
});
