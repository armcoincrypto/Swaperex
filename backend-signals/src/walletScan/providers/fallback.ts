/**
 * Fallback Provider
 *
 * Basic on-chain balance check using RPC.
 * Used when main providers fail.
 * Returns native token balance only (no ERC20 enumeration without indexer).
 *
 * Radar: Wallet Scan MVP
 */

import { WalletToken, WalletTokenProvider, SUPPORTED_CHAINS } from "../types.js";

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

  async getTokens(chainId: number, wallet: string): Promise<WalletToken[]> {
    const rpcUrl = RPC_ENDPOINTS[chainId];

    if (!rpcUrl) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    const chainInfo = SUPPORTED_CHAINS[chainId];
    if (!chainInfo) {
      throw new Error(`Chain ${chainId} not configured`);
    }

    try {
      // Get native token balance
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

      const data = (await response.json()) as any;

      if (data.error) {
        throw new Error(`RPC error: ${data.error.message}`);
      }

      const balanceWei = BigInt(data.result || "0x0");
      const balanceFormatted = Number(balanceWei) / 1e18;

      // Only return native token if balance > 0
      if (balanceWei === 0n) {
        return [];
      }

      return [
        {
          address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          symbol: chainInfo.symbol,
          name: `${chainInfo.name} Native Token`,
          decimals: 18,
          balance: balanceWei.toString(),
          balanceFormatted: balanceFormatted.toFixed(6),
          priceUsd: null, // Fallback doesn't have price data
          valueUsd: null,
          logo: null,
          source: "fallback",
        },
      ];
    } catch (err) {
      console.error(`[FallbackProvider] Error for chain ${chainId}:`, err);
      return [];
    }
  }
}

export const fallbackProvider = new FallbackProvider();
