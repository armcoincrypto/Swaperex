/**
 * Ankr Provider
 *
 * Uses Ankr Advanced API for wallet token balances.
 * Free tier available, API key optional for higher limits.
 *
 * Radar: Wallet Scan MVP
 */

import { WalletToken, WalletTokenProvider, WALLET_SCAN_CONFIG } from "../types.js";

const ANKR_API_BASE = "https://rpc.ankr.com/multichain";
const ANKR_API_KEY = process.env.ANKR_API_KEY || "";

// Chain name mapping for Ankr
const ANKR_CHAIN_NAMES: Record<number, string> = {
  1: "eth",
  56: "bsc",
  137: "polygon",
  42161: "arbitrum",
  10: "optimism",
  43114: "avalanche",
};

interface AnkrTokenBalance {
  blockchain: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenType: string;
  contractAddress?: string;
  holderAddress: string;
  balance: string;
  balanceRawInteger: string;
  balanceUsd: string;
  tokenPrice: string;
  thumbnail?: string;
}

interface AnkrResponse {
  jsonrpc: string;
  id: number;
  result?: {
    totalBalanceUsd: string;
    assets: AnkrTokenBalance[];
  };
  error?: {
    code: number;
    message: string;
  };
}

export class AnkrProvider implements WalletTokenProvider {
  name = "ankr";
  supportedChains = [1, 56, 137, 42161, 10, 43114];

  async getTokens(chainId: number, wallet: string): Promise<WalletToken[]> {
    const chainName = ANKR_CHAIN_NAMES[chainId];

    if (!chainName) {
      throw new Error(`Chain ${chainId} not supported by Ankr`);
    }

    const endpoint = ANKR_API_KEY
      ? `https://rpc.ankr.com/multichain/${ANKR_API_KEY}`
      : ANKR_API_BASE;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WALLET_SCAN_CONFIG.requestTimeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "ankr_getAccountBalance",
          params: {
            blockchain: [chainName],
            walletAddress: wallet,
            onlyWhitelisted: false,
          },
          id: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Ankr API error: ${response.status}`);
      }

      const data = (await response.json()) as AnkrResponse;

      if (data.error) {
        throw new Error(`Ankr RPC error: ${data.error.message}`);
      }

      if (!data.result?.assets) {
        return [];
      }

      return data.result.assets.map((asset) => this.normalizeToken(asset, chainId));
    } catch (err: any) {
      clearTimeout(timeout);

      if (err.name === "AbortError") {
        throw new Error("Ankr request timeout");
      }
      throw err;
    }
  }

  private normalizeToken(asset: AnkrTokenBalance, chainId: number): WalletToken {
    const balanceFormatted = parseFloat(asset.balance) || 0;
    const priceUsd = parseFloat(asset.tokenPrice) || null;
    const valueUsd = parseFloat(asset.balanceUsd) || null;

    // For native tokens (ETH, BNB, etc), address is the zero address
    const isNative = !asset.contractAddress || asset.tokenType === "NATIVE";
    const address = isNative
      ? "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" // Common convention for native token
      : asset.contractAddress!;

    return {
      address,
      symbol: asset.tokenSymbol || "???",
      name: asset.tokenName || asset.tokenSymbol || "Unknown Token",
      decimals: asset.tokenDecimals || 18,
      balance: asset.balanceRawInteger || "0",
      balanceFormatted: balanceFormatted.toFixed(6),
      priceUsd,
      valueUsd,
      logo: asset.thumbnail || null,
      source: "ankr",
    };
  }
}

export const ankrProvider = new AnkrProvider();
