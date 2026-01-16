/**
 * Fallback Provider V2
 *
 * Basic RPC provider for when Ankr is unavailable.
 * Only returns native token balance.
 *
 * Radar: Wallet Scan V2
 */

import { WalletToken, WalletTokenProvider, ScanWarning, SUPPORTED_CHAINS } from "../types.js";

// Public RPC endpoints
const RPC_ENDPOINTS: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  56: "https://bsc-dataseed1.binance.org",
  137: "https://polygon-rpc.com",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  43114: "https://api.avax.network/ext/bc/C/rpc",
};

export class FallbackProvider implements WalletTokenProvider {
  name = "fallback";
  supportedChains = [1, 56, 137, 42161, 10, 43114];

  async getTokens(
    chainId: number,
    wallet: string
  ): Promise<{ tokens: WalletToken[]; warnings: ScanWarning[] }> {
    const warnings: ScanWarning[] = ["FALLBACK_PROVIDER_LIMITED"];
    const rpcUrl = RPC_ENDPOINTS[chainId];

    if (!rpcUrl) {
      throw new Error(`No RPC endpoint for chain ${chainId}`);
    }

    const chainInfo = SUPPORTED_CHAINS[chainId];
    if (!chainInfo) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    try {
      // Get native balance via eth_getBalance
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [wallet, "latest"],
          id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`RPC error: ${response.status}`);
      }

      const data = (await response.json()) as {
        result?: string;
        error?: { message: string };
      };

      if (data.error) {
        throw new Error(`RPC error: ${data.error.message}`);
      }

      const balanceWei = BigInt(data.result || "0x0");
      const balanceEth = Number(balanceWei) / 1e18;

      // Only return if balance > 0
      if (balanceWei === 0n) {
        return { tokens: [], warnings };
      }

      const token: WalletToken = {
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        symbol: chainInfo.symbol,
        name: `${chainInfo.name} Native Token`,
        decimals: 18,
        balance: balanceEth.toFixed(6),
        priceUsd: null, // Fallback doesn't have price data
        valueUsd: null,
        logoUrl: null,
        verified: true, // Native tokens are always verified
        isNative: true,
      };

      return { tokens: [token], warnings };
    } catch (err: any) {
      console.error(`[FallbackProvider] Error:`, err.message);
      throw err;
    }
  }
}

export const fallbackProvider = new FallbackProvider();
