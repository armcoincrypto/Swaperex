import { describe, it, expect, vi } from 'vitest';
import { getOneInchRouterAddress } from '../oneInchTxBuilder';
import { ONEINCH_CONFIG } from '@/config/dex';

// Mock fetchWithTimeout to reject immediately (no retry jitter)
vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn().mockRejectedValue(new Error('Network error')),
  default: vi.fn().mockRejectedValue(new Error('Network error')),
}));

describe('1inch router address fallback map', () => {
  const EXPECTED_V6_ROUTER = '0x111111125421cA6dc452d289314280a0f8842A65';

  it.each([
    ['Ethereum', 1],
    ['BSC', 56],
    ['Polygon', 137],
    ['Arbitrum', 42161],
    ['Optimism', 10],
    ['Avalanche', 43114],
    ['Gnosis', 100],
    ['Fantom', 250],
    ['Base', 8453],
  ] as const)('resolves %s (chainId %d) to 1inch v6 router', async (_name, chainId) => {
    const address = await getOneInchRouterAddress(chainId);
    expect(address).toBe(EXPECTED_V6_ROUTER);
  });

  it('all 1inch supported chains have explicit router entries', async () => {
    for (const chainId of ONEINCH_CONFIG.supportedChains) {
      const address = await getOneInchRouterAddress(chainId);
      // Should get the explicit entry, not fallback to routers[1]
      expect(address).toBe(EXPECTED_V6_ROUTER);
    }
  });

  it('falls back to Ethereum router for unknown chain', async () => {
    const address = await getOneInchRouterAddress(999);
    expect(address).toBe(EXPECTED_V6_ROUTER);
  });
});
