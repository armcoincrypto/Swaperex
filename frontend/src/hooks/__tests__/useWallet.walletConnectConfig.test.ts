import { beforeEach, describe, expect, it, vi } from 'vitest';

const waitForAppKitActions = vi.fn(async () => undefined);
const getOpenAppKit = vi.fn(() => null);

vi.mock('@/services/wallet/appKitActionsRegistry', () => ({
  waitForAppKitActions,
  getOpenAppKit,
  getAppKitDisconnect: vi.fn(() => null),
}));

vi.mock('@/wallet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/wallet')>();
  return {
    ...actual,
    autoReconnect: vi.fn(async () => null),
    disconnectAll: vi.fn(async () => undefined),
    getWcProvider: vi.fn(() => null),
  };
});

vi.mock('@/utils/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/constants')>();
  return {
    ...actual,
    WALLETCONNECT_PROJECT_ID: '',
    HAS_WALLETCONNECT_PROJECT_ID: false,
  };
});

describe('connectWalletConnect missing project ID', () => {
  beforeEach(() => {
    waitForAppKitActions.mockClear();
    getOpenAppKit.mockClear();
  });

  it('sets a local connection error and does not wait for AppKit', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { useWallet } = await import('../useWallet');
    const { useWalletStore } = await import('@/stores/walletStore');

    useWalletStore.getState().clearError();
    const { result } = renderHook(() => useWallet());

    await expect(
      act(async () => {
        await result.current.connectWalletConnect();
      }),
    ).rejects.toThrow(/not configured/i);

    expect(waitForAppKitActions).not.toHaveBeenCalled();
    expect(useWalletStore.getState().connectionError).toMatch(/not configured/i);
  });
});
