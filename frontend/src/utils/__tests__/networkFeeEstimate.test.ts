import { describe, expect, it } from 'vitest';
import { estimateNetworkFeeForDisplay } from '@/utils/networkFeeEstimate';

describe('estimateNetworkFeeForDisplay', () => {
  it('prompts wallet connect when provider missing', async () => {
    const result = await estimateNetworkFeeForDisplay({
      chainId: 1,
      gasEstimate: '150000',
      walletConnected: false,
    });
    expect(result.gasUnits).toBe('150000');
    expect(result.nativeFeeFormatted).toBeNull();
    expect(result.unavailableReason).toContain('Connect wallet');
  });

  it('handles missing gas units', async () => {
    const result = await estimateNetworkFeeForDisplay({
      chainId: 1,
      gasEstimate: null,
      walletConnected: true,
      provider: {},
    });
    expect(result.gasUnits).toBeNull();
    expect(result.unavailableReason).toContain('unavailable');
  });
});
