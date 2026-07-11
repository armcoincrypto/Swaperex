import { describe, expect, it } from 'vitest';
import {
  NETWORK_CAPABILITIES,
  getNetworkCapability,
  getNetworkCapabilityLabel,
  getSwapEnabledNetworkCapabilities,
  getSwapUnavailableReason,
  getWalletNetworkCapabilities,
  isSwapEnabledNetwork,
} from '@/config/networkCapabilities';

describe('networkCapabilities', () => {
  it('declares exactly Ethereum and BNB Chain as swap-enabled', () => {
    const swapChains = getSwapEnabledNetworkCapabilities().map((n) => n.chainId);
    expect(swapChains.sort()).toEqual([1, 56]);
  });

  it('lists six wallet-connect networks', () => {
    expect(getWalletNetworkCapabilities()).toHaveLength(6);
  });

  it('marks Polygon as read-only with swap disabled', () => {
    const polygon = getNetworkCapability(137);
    expect(polygon?.swapSupported).toBe(false);
    expect(polygon?.portfolioSupported).toBe(true);
    expect(polygon?.capabilityStatus).toBe('read_only');
    expect(getNetworkCapabilityLabel(137)).toBe('Balances & send only');
  });

  it('returns swap unavailable reason for non-swap chains', () => {
    const reason = getSwapUnavailableReason(42161);
    expect(reason).toContain('Ethereum and BNB Chain');
  });

  it('returns empty reason for swap-enabled chains', () => {
    expect(getSwapUnavailableReason(1)).toBe('');
    expect(isSwapEnabledNetwork(56)).toBe(true);
  });

  it('orders swap-enabled networks before read-only', () => {
    const ordered = getWalletNetworkCapabilities();
    expect(ordered[0].chainId).toBe(1);
    expect(ordered[1].chainId).toBe(56);
    expect(ordered[2].swapSupported).toBe(false);
  });

  it('has one entry per wallet chain', () => {
    expect(NETWORK_CAPABILITIES.filter((n) => n.walletConnectSupported)).toHaveLength(6);
  });
});
