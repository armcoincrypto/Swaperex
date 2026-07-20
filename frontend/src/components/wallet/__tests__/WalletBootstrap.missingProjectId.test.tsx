import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const createAppKit = vi.fn();
const useAppKit = vi.fn(() => {
  throw new Error('Please call "createAppKit" before using "useAppKit" hook');
});
const useDisconnect = vi.fn(() => {
  throw new Error('Please call "createAppKit" before using "useDisconnect" hook');
});
const useAppKitAccount = vi.fn(() => ({ address: undefined, isConnected: false }));
const useAppKitProvider = vi.fn(() => ({ walletProvider: undefined }));

vi.mock('@reown/appkit/react', () => ({
  createAppKit,
  useAppKit,
  useDisconnect,
  useAppKitAccount,
  useAppKitProvider,
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

vi.mock('@/components/wallet/AppKitBridge', () => ({
  AppKitBridge: () => null,
}));

describe('WalletBootstrap missing project ID (P21.5 production crash regression)', () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not call useAppKit hooks when createAppKit was skipped', async () => {
    vi.doMock('@/utils/constants', () => ({
      WALLETCONNECT_PROJECT_ID: '',
      HAS_WALLETCONNECT_PROJECT_ID: false,
    }));

    const { default: WalletBootstrap } = await import('../WalletBootstrap');
    const { isAppKitCreated } = await import('@/services/wallet/appkit');
    const { getOpenAppKit, signalAppKitActionsReady, waitForAppKitActions } = await import(
      '@/services/wallet/appKitActionsRegistry'
    );

    expect(isAppKitCreated()).toBe(false);
    expect(createAppKit).not.toHaveBeenCalled();

    const { container } = render(<WalletBootstrap />);
    expect(container).toBeTruthy();
    expect(useAppKit).not.toHaveBeenCalled();
    expect(useDisconnect).not.toHaveBeenCalled();

    // Waiters must unblock even when AppKit is unavailable.
    const waitPromise = waitForAppKitActions(2_000);
    signalAppKitActionsReady();
    await waitPromise;
    expect(getOpenAppKit()).toBeNull();

    await waitFor(() => {
      expect(useAppKit).not.toHaveBeenCalled();
    });
  });
});
