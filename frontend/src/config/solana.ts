/**
 * Solana public chain config (read-only).
 * Kept separate from chains.ts so lazy portfolio/Solana bundles avoid EVM RPC imports.
 */

export const SOLANA_CONFIG = {
  name: 'Solana',
  symbol: 'SOL',
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  explorerUrl: 'https://solscan.io',
  explorerTxPath: '/tx/',
  nativeToken: 'SOL',
  nativeDecimals: 9,
  cluster: 'mainnet-beta' as const,
};

export function getSolanaExplorerUrl(signature: string): string {
  return `${SOLANA_CONFIG.explorerUrl}${SOLANA_CONFIG.explorerTxPath}${signature}`;
}

export const SOLANA_CHAIN_ID = 'solana' as const;

export function isSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}
