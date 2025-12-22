/**
 * Balance State Store
 *
 * Fetches wallet balances directly from blockchain RPCs.
 * Includes native tokens AND ERC20 tokens.
 * No backend required - fully non-custodial.
 */

import { create } from 'zustand';
import { JsonRpcProvider, Contract, formatUnits, formatEther } from 'ethers';

// Chain RPC endpoints
const RPC_URLS: Record<string, string> = {
  ethereum: 'https://eth.llamarpc.com',
  bsc: 'https://bsc-dataseed.binance.org',
  polygon: 'https://polygon-rpc.com',
};

// Chain native token info
const NATIVE_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  ethereum: { symbol: 'ETH', decimals: 18 },
  bsc: { symbol: 'BNB', decimals: 18 },
  polygon: { symbol: 'MATIC', decimals: 18 },
};

// Popular ERC20 tokens to fetch per chain (high-liquidity only)
const ERC20_TOKENS: Record<string, Array<{ symbol: string; address: string; decimals: number; name: string }>> = {
  ethereum: [
    // Stablecoins
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, name: 'Tether USD' },
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, name: 'USD Coin' },
    { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedcdeCB5BE3830', decimals: 18, name: 'Dai' },
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

  // Actions
  fetchBalances: (address: string, chains: string[]) => Promise<void>;
  fetchChainBalance: (address: string, chain: string) => Promise<void>;
  clearBalances: () => void;
  getTokenBalance: (chain: string, symbol: string) => TokenBalance | null;
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
  } catch (err) {
    console.warn(`[Balance] Failed to fetch ERC20 balance for ${tokenAddress}:`, err);
    return '0';
  }
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  // Initial state
  balances: {},
  isLoading: false,
  lastUpdated: null,
  totalUsdValue: null,

  // Fetch balances for multiple chains
  fetchBalances: async (address: string, chains: string[]) => {
    set({ isLoading: true });

    try {
      const balanceMap: Record<string, ChainBalance> = {};

      // Fetch all chains in parallel
      await Promise.all(
        chains.map(async (chain) => {
          try {
            const rpcUrl = RPC_URLS[chain];
            const nativeToken = NATIVE_TOKENS[chain];

            if (!rpcUrl || !nativeToken) {
              console.warn(`[Balance] Unknown chain: ${chain}`);
              return;
            }

            const provider = new JsonRpcProvider(rpcUrl);

            // Fetch native balance
            const balanceWei = await provider.getBalance(address);
            const balance = formatEther(balanceWei);

            // Fetch ERC20 token balances
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
                  });
                }
              })
            );

            balanceMap[chain] = {
              chain,
              native_balance: {
                symbol: nativeToken.symbol,
                balance,
                balance_raw: balanceWei.toString(),
                decimals: nativeToken.decimals,
                chain,
                name: nativeToken.symbol,
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
      const rpcUrl = RPC_URLS[chain];
      const nativeToken = NATIVE_TOKENS[chain];

      if (!rpcUrl || !nativeToken) {
        console.warn(`[Balance] Unknown chain: ${chain}`);
        set({ isLoading: false });
        return;
      }

      const provider = new JsonRpcProvider(rpcUrl);

      // Fetch native balance
      const balanceWei = await provider.getBalance(address);
      const balance = formatEther(balanceWei);

      // Fetch ERC20 token balances
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
            });
          }
        })
      );

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
}));

export default useBalanceStore;
