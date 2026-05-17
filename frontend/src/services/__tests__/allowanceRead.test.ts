import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ethers', () => {
  class MockContract {
    allowance = vi.fn();
    constructor(
      _token: string,
      _abi: unknown,
      _provider: unknown,
    ) {}
  }
  return {
    Contract: MockContract,
    JsonRpcProvider: vi.fn(),
    Network: { from: vi.fn(() => ({})) },
  };
});

vi.mock('@/config/chains', () => ({
  CHAINS: { ethereum: { id: 1 }, bsc: { id: 56 } },
}));

vi.mock('@/config/rpc', () => ({
  getPrimaryEthereumReadRpcUrl: () => 'https://ethereum.example',
  getPrimaryBscReadRpcUrl: () => 'https://bsc.example',
}));

vi.mock('@/utils/productionMonitoring', () => ({
  logProductionEvent: vi.fn(),
}));

vi.mock('@/utils/swapObservability', () => ({
  swapObsLog: vi.fn(),
}));

describe('readCommissionWrapperAllowanceVsRequired', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('retries once when first static read throws', async () => {
    vi.useFakeTimers();
    const { Contract } = await import('ethers');
    const allowanceMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(1000n);

    (Contract as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      allowance: allowanceMock,
    }));

    const { readCommissionWrapperAllowanceVsRequired } = await import('../allowanceRead');

    const promise = readCommissionWrapperAllowanceVsRequired({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      tokenSymbol: 'USDC',
      fromSymbol: 'USDC',
      toSymbol: 'WETH',
      spender: '0xa7702Ce9267567fd811B39C886CdABeC6eB249fc',
      owner: '0x0000000000000000000000000000000000000001',
      required: 100n,
      swapProvider: 'uniswap-v3-wrapper-v3',
    });

    await vi.advanceTimersByTimeAsync(400);
    const result = await promise;
    vi.useRealTimers();

    expect(result).toBe('sufficient');
    expect(allowanceMock).toHaveBeenCalledTimes(2);
  });
});
