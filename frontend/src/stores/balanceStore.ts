/**
 * Balance State Store
 *
 * Fetches wallet balances directly from blockchain RPCs.
 * Includes native tokens, popular ERC20 tokens, AND user-added custom tokens.
 * No backend required - fully non-custodial.
 */

import { create } from 'zustand';
import { JsonRpcProvider, Contract, formatUnits, formatEther, Network } from 'ethers';
import { useCustomTokenStore } from './customTokenStore';
import { getTokens, NATIVE_TOKEN_ADDRESS } from '@/tokens';

// RPC proxy base URL (backend-signals proxies to bypass browser CORS)
const RPC_PROXY = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';

// Chain RPC endpoints (ETH/Polygon via proxy; BSC direct — Binance has permissive CORS)
const RPC_URLS: Record<string, string> = {
  ethereum: `${RPC_PROXY}/rpc/eth`,
  bsc: 'https://bsc-dataseed.binance.org',
  polygon: `${RPC_PROXY}/rpc/polygon`,
};

// Chain name to ID mapping (for custom token lookup)
export const CHAIN_NAME_TO_ID: Record<string, number> = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
};

// Chain native token info
const NATIVE_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  ethereum: { symbol: 'ETH', decimals: 18 },
  bsc: { symbol: 'BNB', decimals: 18 },
  polygon: { symbol: 'MATIC', decimals: 18 },
};

// Popular ERC20 tokens to fetch per chain (high-liquidity only)
export const ERC20_TOKENS: Record<string, Array<{ symbol: string; address: string; decimals: number; name: string }>> = {
  ethereum: [
    // Stablecoins
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, name: 'Tether USD' },
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, name: 'USD Coin' },
    { symbol: 'DAI', address: '0x6B175474E89094c44DA98b954EEDcdECb5be3830', decimals: 18, name: 'Dai' },
    // Wrapped
    { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, name: 'Wrapped Ether' },
    { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, name: 'Wrapped Bitcoin' },
    // Blue-chip
    { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, name: 'Chainlink' },
    { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18, name: 'Uniswap' },
    { symbol: 'AAVE', address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', decimals: 18, name: 'Aave' },
    { symbol: 'ARB', address: '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1', decimals: 18, name: 'Arbitrum' },
    { symbol: 'LDO', address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', decimals: 18, name: 'Lido DAO' },
  ],
  bsc: [
    // Stablecoins
    { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, name: 'Tether USD' },
    { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, name: 'USD Coin' },
    { symbol: 'BUSD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18, name: 'Binance USD' },
    { symbol: 'FDUSD', address: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', decimals: 18, name: 'First Digital USD' },
    // Wrapped
    { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18, name: 'Wrapped BNB' },
    { symbol: 'BTCB', address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18, name: 'Bitcoin BEP20' },
    { symbol: 'ETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18, name: 'Ethereum Token' },
    // Blue-chip
    { symbol: 'CAKE', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18, name: 'PancakeSwap' },
    { symbol: 'XRP', address: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', decimals: 18, name: 'XRP Token' },
    { symbol: 'DOGE', address: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', decimals: 8, name: 'Dogecoin Token' },
  ],
  polygon: [
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, name: 'Tether USD' },
    { symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6, name: 'USD Coin' },
    { symbol: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18, name: 'Wrapped Matic' },
  ],
};

/**
 * Singleton provider cache — reuses providers across calls to prevent
 * connection exhaustion. staticNetwork skips eth_chainId detection,
 * eliminating the infinite "retry in 1s" loop on network errors.
 */
const providerCache: Record<string, JsonRpcProvider> = {};
const providerFailCount: Record<string, number> = {};

function getCachedProvider(chain: string): JsonRpcProvider | null {
  const rpcUrl = RPC_URLS[chain];
  const chainId = CHAIN_NAME_TO_ID[chain];
  if (!rpcUrl || !chainId) return null;

  // Recreate provider after 3 consecutive failures (clears stale connections)
  if (providerCache[chain] && (providerFailCount[chain] || 0) >= 3) {
    delete providerCache[chain];
    providerFailCount[chain] = 0;
  }

  if (!providerCache[chain]) {
    const network = Network.from(chainId);
    providerCache[chain] = new JsonRpcProvider(rpcUrl, network, { staticNetwork: network });
  }
  return providerCache[chain];
}

// ERC20 ABI for balanceOf
const ERC20_ABI = ['function balanceOf(address owner) view returns (uint256)'];

interface TokenBalance {
  symbol: string;
  balance: string;
  balance_raw?: string;
  decimals: number;
  chain?: string;
  name?: string;
  logo_url?: string;
  usd_value?: string;
  isCustom?: boolean;  // User-imported token
}

interface ChainBalance {
  chain: string;
  native_balance: TokenBalance;
  token_balances: TokenBalance[];
}

interface BalanceState {
  // Balances by chain
  balances: Record<string, ChainBalance>;

  // Loading state
  isLoading: boolean;
  lastUpdated: number | null;

  // Total portfolio value
  totalUsdValue: string | null;

  // Display settings
  hideZeroBalances: boolean;

  // Actions
  fetchBalances: (address: string, chains: string[]) => Promise<void>;
  fetchChainBalance: (address: string, chain: string) => Promise<void>;
  clearBalances: () => void;
  getTokenBalance: (chain: string, symbol: string) => TokenBalance | null;
  setHideZeroBalances: (hide: boolean) => void;
  getVisibleTokens: (chain: string) => TokenBalance[];
}

/**
 * Look up token logo from static token lists
 */
function getTokenLogo(chain: string, symbol: string, address?: string): string | undefined {
  const chainId = CHAIN_NAME_TO_ID[chain];
  if (!chainId) return undefined;
  const tokens = getTokens(chainId);
  // Try by address first (most accurate)
  if (address) {
    const byAddr = tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
    if (byAddr?.logoURI) return byAddr.logoURI;
  }
  // Fallback: by symbol
  const bySym = tokens.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
  return bySym?.logoURI;
}

/**
 * Fetch ERC20 token balance
 */
async function fetchERC20Balance(
  provider: JsonRpcProvider,
  tokenAddress: string,
  walletAddress: string,
  decimals: number
): Promise<string> {
  try {
    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
    const balanceRaw = await contract.balanceOf(walletAddress);
    return formatUnits(balanceRaw, decimals);
  } catch {
    // Expected: token may not exist on-chain or user holds zero
    return '0';
  }
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  // Initial state
  balances: {},
  isLoading: false,
  lastUpdated: null,
  totalUsdValue: null,
  hideZeroBalances: true,  // Default to hiding zero balances

  // Fetch balances for multiple chains
  fetchBalances: async (address: string, chains: string[]) => {
    // Only show loading spinner on initial fetch (not background auto-refresh)
    const hasExistingData = Object.keys(get().balances).length > 0;
    if (!hasExistingData) set({ isLoading: true });

    try {
      const balanceMap: Record<string, ChainBalance> = {};

      // Fetch all chains in parallel
      await Promise.all(
        chains.map(async (chain) => {
          try {
            const nativeToken = NATIVE_TOKENS[chain];
            const provider = getCachedProvider(chain);

            if (!provider || !nativeToken) {
              return;
            }

            // Fetch native balance
            const balanceWei = await provider.getBalance(address);
            const balance = formatEther(balanceWei);

            // Fetch ERC20 token balances (built-in tokens)
            const erc20Tokens = ERC20_TOKENS[chain] || [];
            const tokenBalances: TokenBalance[] = [];

            await Promise.all(
              erc20Tokens.map(async (token) => {
                const tokenBalance = await fetchERC20Balance(
                  provider,
                  token.address,
                  address,
                  token.decimals
                );

                // Only add tokens with non-zero balance
                if (parseFloat(tokenBalance) > 0) {
                  tokenBalances.push({
                    symbol: token.symbol,
                    balance: tokenBalance,
                    decimals: token.decimals,
                    chain,
                    name: token.name,
                    logo_url: getTokenLogo(chain, token.symbol, token.address),
                  });
                }
              })
            );

            // Fetch custom token balances
            const chainId = CHAIN_NAME_TO_ID[chain];
            if (chainId) {
              const customTokens = useCustomTokenStore.getState().getTokens(chainId);
              await Promise.all(
                customTokens.map(async (token) => {
                  const tokenBalance = await fetchERC20Balance(
                    provider,
                    token.address,
                    address,
                    token.decimals
                  );

                  // Add custom tokens with isCustom flag
                  tokenBalances.push({
                    symbol: token.symbol,
                    balance: tokenBalance,
                    decimals: token.decimals,
                    chain,
                    name: token.name,
                    logo_url: getTokenLogo(chain, token.symbol, token.address),
                    isCustom: true,
                  });
                })
              );
            }

            balanceMap[chain] = {
              chain,
              native_balance: {
                symbol: nativeToken.symbol,
                balance,
                balance_raw: balanceWei.toString(),
                decimals: nativeToken.decimals,
                chain,
                name: nativeToken.symbol,
                logo_url: getTokenLogo(chain, nativeToken.symbol, NATIVE_TOKEN_ADDRESS),
              },
              token_balances: tokenBalances,
            };
          } catch (err) {
            console.warn(`[Balance] Failed to fetch ${chain} balance:`, err);
          }
        })
      );

      set({
        balances: balanceMap,
        isLoading: false,
        lastUpdated: Date.now(),
      });
    } catch (error) {
      set({ isLoading: false });
      console.error('[Balance] Failed to fetch balances:', error);
    }
  },

  // Fetch balance for single chain
  fetchChainBalance: async (address: string, chain: string) => {
    set({ isLoading: true });

    try {
      const nativeToken = NATIVE_TOKENS[chain];
      const provider = getCachedProvider(chain);

      if (!provider || !nativeToken) {
        set({ isLoading: false });
        return;
      }

      // Fetch native balance
      const balanceWei = await provider.getBalance(address);
      const balance = formatEther(balanceWei);

      // Fetch ERC20 token balances (built-in tokens)
      const erc20Tokens = ERC20_TOKENS[chain] || [];
      const tokenBalances: TokenBalance[] = [];

      await Promise.all(
        erc20Tokens.map(async (token) => {
          const tokenBalance = await fetchERC20Balance(
            provider,
            token.address,
            address,
            token.decimals
          );

          // Only add tokens with non-zero balance
          if (parseFloat(tokenBalance) > 0) {
            tokenBalances.push({
              symbol: token.symbol,
              balance: tokenBalance,
              decimals: token.decimals,
              chain,
              name: token.name,
              logo_url: getTokenLogo(chain, token.symbol, token.address),
            });
          }
        })
      );

      // Fetch custom token balances
      const chainId = CHAIN_NAME_TO_ID[chain];
      if (chainId) {
        const customTokens = useCustomTokenStore.getState().getTokens(chainId);
        await Promise.all(
          customTokens.map(async (token) => {
            const tokenBalance = await fetchERC20Balance(
              provider,
              token.address,
              address,
              token.decimals
            );

            // Add custom tokens with isCustom flag
            tokenBalances.push({
              symbol: token.symbol,
              balance: tokenBalance,
              decimals: token.decimals,
              chain,
              name: token.name,
              logo_url: getTokenLogo(chain, token.symbol, token.address),
              isCustom: true,
            });
          })
        );
      }

      set((state) => ({
        balances: {
          ...state.balances,
          [chain]: {
            chain,
            native_balance: {
              symbol: nativeToken.symbol,
              balance,
              balance_raw: balanceWei.toString(),
              decimals: nativeToken.decimals,
              chain,
              name: nativeToken.symbol,
              logo_url: getTokenLogo(chain, nativeToken.symbol, NATIVE_TOKEN_ADDRESS),
            },
            token_balances: tokenBalances,
          },
        },
        isLoading: false,
        lastUpdated: Date.now(),
      }));
    } catch (error) {
      set({ isLoading: false });
      console.error(`[Balance] Failed to fetch ${chain} balance:`, error);
    }
  },

  // Clear all balances
  clearBalances: () => {
    set({
      balances: {},
      lastUpdated: null,
      totalUsdValue: null,
    });
  },

  // Get specific token balance
  getTokenBalance: (chain: string, symbol: string) => {
    const { balances } = get();
    const chainBalances = balances[chain];

    if (!chainBalances) return null;

    // Check native balance
    if (chainBalances.native_balance.symbol === symbol) {
      return chainBalances.native_balance;
    }

    // Check token balances
    return chainBalances.token_balances.find((t) => t.symbol === symbol) || null;
  },

  // Toggle hide zero balances setting
  setHideZeroBalances: (hide: boolean) => {
    set({ hideZeroBalances: hide });
  },

  // Get visible tokens (respects hideZeroBalances setting)
  getVisibleTokens: (chain: string) => {
    const { balances, hideZeroBalances } = get();
    const chainBalances = balances[chain];

    if (!chainBalances) return [];

    const allTokens = chainBalances.token_balances;

    if (!hideZeroBalances) {
      return allTokens;
    }

    // Filter out zero balances (except custom tokens which always show)
    return allTokens.filter((token) => {
      if (token.isCustom) return true;  // Always show custom tokens
      return parseFloat(token.balance) > 0;
    });
  },
}));

export default useBalanceStore;
