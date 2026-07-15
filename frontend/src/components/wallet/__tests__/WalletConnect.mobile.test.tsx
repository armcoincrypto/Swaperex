/**
 * P19 — Mobile wallet entry must expose a reachable Connect control
 * that opens the canonical WalletConnect path (same handler as desktop).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletConnect } from '@/components/wallet/WalletConnect';

const connectWalletConnect = vi.fn(async () => undefined);

vi.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({
    isConnected: false,
    isConnecting: false,
    isReadOnly: false,
    isSwitchingChain: false,
    address: null,
    chainId: 56,
    connectorLabel: null,
    error: null,
    connectWalletConnect,
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
    enterReadOnlyMode: vi.fn(),
    exitReadOnlyMode: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock('@/stores/balanceStore', () => ({
  useBalanceStore: () => ({}),
}));

vi.mock('@/stores/termsStore', () => ({
  useTermsStore: (sel: (s: { accepted: boolean }) => unknown) => sel({ accepted: true }),
}));

describe('WalletConnect mobile entry (P19)', () => {
  beforeEach(() => {
    connectWalletConnect.mockClear();
  });

  it('exposes Connect with accessible name and opens WalletConnect option', async () => {
    render(<WalletConnect />);

    const connect = screen.getByRole('button', { name: 'Connect Wallet' });
    fireEvent.click(connect);

    await waitFor(() => {
      expect(screen.getByText('Open your wallet app or use QR on another device')).toBeTruthy();
    });

    const wcRow = screen.getByText('Open your wallet app or use QR on another device').closest('button');
    expect(wcRow).toBeTruthy();
    fireEvent.click(wcRow!);

    await waitFor(() => {
      expect(connectWalletConnect).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps View address available inside the picker for mobile', async () => {
    render(<WalletConnect />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect Wallet' }));
    await waitFor(() => {
      expect(screen.getByText('Read-only — balances without signing')).toBeTruthy();
    });
  });
});
