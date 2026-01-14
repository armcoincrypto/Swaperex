/**
 * Solana Balance Service
 *
 * PHASE 13: Fetches balances from Solana blockchain.
 * Supports SOL and SPL tokens.
 *
 * SECURITY: Read-only operations, no signing.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  type TokenBalance,
  type ChainBalance,
  formatBalance,
  logPortfolioLifecycle,
} from './portfolioTypes';
import { SOLANA_TOKENS } from '@/config/tokens';
import { SOLANA_CONFIG } from '@/config/chains';

/**
 * SPL Token Program ID
 */
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * Token 2022 Program ID
 */
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/**
 * Create Solana connection
 */
function getConnection(): Connection {
  return new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');
}

/**
 * Fetch native SOL balance
 */
async function fetchSolBalance(
  connection: Connection,
  publicKey: PublicKey
): Promise<TokenBalance> {
  const balance = await connection.getBalance(publicKey);

  return {
    symbol: 'SOL',
    name: 'Solana',
    address: SOLANA_TOKENS.SOL,
    decimals: 9,
    balance: balance.toString(),
    balanceFormatted: formatBalance(BigInt(balance), 9),
    usdValue: null,
    usdPrice: null,
    isNative: true,
    chain: 'solana',
  };
}

/**
 * Fetch all SPL token balances
 */
async function fetchSplTokenBalances(
  connection: Connection,
  publicKey: PublicKey
): Promise<TokenBalance[]> {
  const tokenBalances: TokenBalance[] = [];

  try {
    // Get all token accounts for both program IDs
    const [tokenAccounts, token2022Accounts] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];

    // Build reverse lookup: mint address -> symbol
    const mintToSymbol: Record<string, string> = {};
    for (const [symbol, mint] of Object.entries(SOLANA_TOKENS)) {
      mintToSymbol[mint] = symbol;
    }

    for (const account of allAccounts) {
      const parsed = account.account.data.parsed;
      if (!parsed || parsed.type !== 'account') continue;

      const info = parsed.info;
      const mint = info.mint as string;
      const tokenAmount = info.tokenAmount;

      // Skip zero balances
      if (tokenAmount.uiAmount === 0) continue;

      const symbol = mintToSymbol[mint];
      const decimals = tokenAmount.decimals as number;

      tokenBalances.push({
        symbol: symbol || 'UNKNOWN',
        name: symbol || 'Unknown Token',
        address: mint,
        decimals,
        balance: tokenAmount.amount as string,
        balanceFormatted: (tokenAmount.uiAmount as number).toString(),
        usdValue: null,
        usdPrice: null,
        isNative: false,
        chain: 'solana',
      });
    }

    return tokenBalances;
  } catch (error) {
    console.warn('[SolanaBalance] Failed to fetch SPL tokens:', error);
    return [];
  }
}

/**
 * Fetch all Solana balances for an address
 */
export async function fetchSolanaBalance(address: string): Promise<ChainBalance> {
  logPortfolioLifecycle('Fetching Solana balances', { address: address.slice(0, 10) + '...' });

  try {
    const publicKey = new PublicKey(address);
    const connection = getConnection();

    // Fetch native SOL and SPL tokens in parallel
    const [solBalance, splBalances] = await Promise.all([
      fetchSolBalance(connection, publicKey),
      fetchSplTokenBalances(connection, publicKey),
    ]);

    logPortfolioLifecycle('Solana balances fetched', {
      solBalance: solBalance.balanceFormatted,
      tokenCount: splBalances.length,
    });

    return {
      chain: 'solana',
      chainId: 'solana',
      nativeBalance: solBalance,
      tokenBalances: splBalances,
      totalUsdValue: '0', // Will be filled by price service
      lastUpdated: Date.now(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Solana balances';
    logPortfolioLifecycle('Solana balance error', { error: message });

    return {
      chain: 'solana',
      chainId: 'solana',
      nativeBalance: {
        symbol: 'SOL',
        name: 'Solana',
        address: SOLANA_TOKENS.SOL,
        decimals: 9,
        balance: '0',
        balanceFormatted: '0',
        usdValue: null,
        usdPrice: null,
        isNative: true,
        chain: 'solana',
      },
      tokenBalances: [],
      totalUsdValue: '0',
      lastUpdated: Date.now(),
      error: message,
    };
  }
}

/**
 * Check if address is valid Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get recent transactions for a Solana address
 */
export async function fetchSolanaTransactions(
  address: string,
  limit: number = 20
): Promise<Array<{ signature: string; slot: number; timestamp: number | null }>> {
  try {
    const publicKey = new PublicKey(address);
    const connection = getConnection();

    const signatures = await connection.getSignaturesForAddress(publicKey, {
      limit,
    });

    return signatures.map((sig) => ({
      signature: sig.signature,
      slot: sig.slot,
      timestamp: sig.blockTime ? sig.blockTime * 1000 : null,
    }));
  } catch (error) {
    console.error('[SolanaBalance] Failed to fetch transactions:', error);
    return [];
  }
}

export default fetchSolanaBalance;
