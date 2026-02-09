import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScanStore } from '../scanStore';

// Mock the scanEngine to avoid real RPC calls
vi.mock('../scanEngine', () => ({
  scanChain: vi.fn(async (chain, _wallet, onProgress, onLog) => {
    const progress = {
      chainName: chain,
      chainId: chain === 'ethereum' ? 1 : chain === 'bsc' ? 56 : 137,
      status: 'completed' as const,
      tokens: chain === 'polygon' ? [] : [{
        chainId: chain === 'ethereum' ? 1 : 56,
        chainName: chain,
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        balance: '100.5',
        source: 'known' as const,
        isWatched: false,
        isNative: false,
      }],
      checked: 11,
      total: 11,
      elapsedMs: 500,
    };
    onProgress(progress);
    onLog({ timestamp: Date.now(), level: 'info', chain, message: 'Test scan complete' });
    return progress;
  }),
}));

// Mock watchlistStore
vi.mock('@/stores/watchlistStore', () => ({
  useWatchlistStore: {
    getState: () => ({
      hasToken: vi.fn(() => false),
      addToken: vi.fn(() => true),
    }),
  },
}));

describe('walletScan/scanStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useScanStore.setState({
      session: null,
      status: 'idle',
      logs: [],
      _abortController: null,
    });
  });

  describe('initial state', () => {
    it('starts in idle status', () => {
      const state = useScanStore.getState();
      expect(state.status).toBe('idle');
      expect(state.session).toBeNull();
      expect(state.logs).toEqual([]);
    });
  });

  describe('startScan', () => {
    it('transitions to scanning status', async () => {
      const store = useScanStore.getState();
      const scanPromise = store.startScan('0x1234567890abcdef1234567890abcdef12345678');

      // Should be scanning immediately
      expect(useScanStore.getState().status).toBe('scanning');

      await scanPromise;

      // Should be completed after scan
      const finalState = useScanStore.getState();
      expect(finalState.status).toBe('completed');
      expect(finalState.session).not.toBeNull();
      expect(finalState.session!.totalFound).toBeGreaterThan(0);
    });

    it('creates session with all chain progress', async () => {
      await useScanStore.getState().startScan('0x1234567890abcdef1234567890abcdef12345678');

      const session = useScanStore.getState().session!;
      expect(session.chains.ethereum).toBeDefined();
      expect(session.chains.bsc).toBeDefined();
      expect(session.chains.polygon).toBeDefined();
    });

    it('generates structured logs', async () => {
      await useScanStore.getState().startScan('0x1234567890abcdef1234567890abcdef12345678');

      const logs = useScanStore.getState().logs;
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toHaveProperty('timestamp');
      expect(logs[0]).toHaveProperty('level');
      expect(logs[0]).toHaveProperty('message');
    });

    it('saves session to history', async () => {
      await useScanStore.getState().startScan('0x1234567890abcdef1234567890abcdef12345678');

      const saved = useScanStore.getState().savedSessions;
      expect(saved.length).toBeGreaterThanOrEqual(1);
      expect(saved[0].walletAddress).toBe('0x1234567890abcdef1234567890abcdef12345678');
    });
  });

  describe('resetSession', () => {
    it('clears session and returns to idle', async () => {
      await useScanStore.getState().startScan('0x1234567890abcdef1234567890abcdef12345678');
      expect(useScanStore.getState().status).toBe('completed');

      useScanStore.getState().resetSession();
      expect(useScanStore.getState().status).toBe('idle');
      expect(useScanStore.getState().session).toBeNull();
    });
  });

  describe('getDebugInfo', () => {
    it('returns null when no session', () => {
      expect(useScanStore.getState().getDebugInfo()).toBeNull();
    });

    it('returns structured debug info after scan', async () => {
      await useScanStore.getState().startScan('0x1234567890abcdef1234567890abcdef12345678');
      const debug = useScanStore.getState().getDebugInfo();

      expect(debug).not.toBeNull();
      expect(debug!.sessionId).toMatch(/^scan_/);
      expect(debug!.chains).toHaveLength(3);
      expect(debug!.timestamp).toBeTruthy();
    });
  });
});
