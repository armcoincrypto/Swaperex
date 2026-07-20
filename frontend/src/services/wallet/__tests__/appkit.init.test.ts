import { afterEach, describe, expect, it, vi } from 'vitest';

const createAppKit = vi.fn();

vi.mock('@reown/appkit/react', () => ({
  createAppKit,
}));

vi.mock('@reown/appkit-adapter-ethers', () => ({
  EthersAdapter: class EthersAdapter {},
}));

vi.mock('@reown/appkit/networks', () => ({
  mainnet: { id: 1 },
  bsc: { id: 56 },
  polygon: { id: 137 },
  arbitrum: { id: 42161 },
  optimism: { id: 10 },
  avalanche: { id: 43114 },
}));

vi.mock('@/stores/toastStore', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('@/services/wallet/sanitizeAppKitPersistedState', () => ({
  sanitizeAppKitPersistedState: vi.fn(),
}));

describe('initAppKit project ID gate', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('skips createAppKit when project ID is empty', async () => {
    vi.doMock('@/utils/constants', () => ({
      WALLETCONNECT_PROJECT_ID: '',
      HAS_WALLETCONNECT_PROJECT_ID: false,
    }));
    const { initAppKit, isAppKitCreated } = await import('../appkit');
    initAppKit();
    expect(createAppKit).not.toHaveBeenCalled();
    expect(isAppKitCreated()).toBe(false);
  });

  it('skips createAppKit when project ID is placeholder', async () => {
    vi.doMock('@/utils/constants', () => ({
      WALLETCONNECT_PROJECT_ID: 'PASTE_YOUR_PROJECT_ID_HERE',
      HAS_WALLETCONNECT_PROJECT_ID: true,
    }));
    const { initAppKit, isAppKitCreated } = await import('../appkit');
    initAppKit();
    expect(createAppKit).not.toHaveBeenCalled();
    expect(isAppKitCreated()).toBe(false);
  });

  it('creates AppKit once with a valid project ID', async () => {
    vi.doMock('@/utils/constants', () => ({
      WALLETCONNECT_PROJECT_ID: 'a'.repeat(32),
      HAS_WALLETCONNECT_PROJECT_ID: true,
    }));
    const { initAppKit, isAppKitCreated } = await import('../appkit');
    initAppKit();
    initAppKit();
    expect(createAppKit).toHaveBeenCalledTimes(1);
    expect(isAppKitCreated()).toBe(true);
    const arg = createAppKit.mock.calls[0][0];
    expect(arg.projectId).toHaveLength(32);
    expect(arg.metadata.url).toBeTruthy();
    expect(arg.enableInjected).toBe(false);
  });
});
