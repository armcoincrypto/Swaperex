/**
 * Wallet Scan Types
 *
 * Shared type definitions for the scan service, store, and UI.
 */

/** Supported chain identifiers for scanning */
export type ScanChainName = 'ethereum' | 'bsc' | 'polygon';

export const SCAN_CHAIN_IDS: Record<ScanChainName, number> = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
};

export const CHAIN_ID_TO_SCAN_NAME: Record<number, ScanChainName> = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
};

/** Status of an individual chain scan */
export type ChainScanStatus = 'pending' | 'scanning' | 'completed' | 'failed';

/** Overall scan session status */
export type ScanSessionStatus = 'idle' | 'scanning' | 'completed' | 'failed';

/** Source of a discovered token */
export type TokenSource = 'known' | 'custom' | 'discovered';

/** A token found during a wallet scan */
export interface ScannedToken {
  chainId: number;
  chainName: ScanChainName;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceRaw?: string;
  source: TokenSource;
  /** Whether this token is already in the watchlist */
  isWatched: boolean;
  /** Whether this is a native token (ETH/BNB/MATIC) */
  isNative: boolean;
  /** Logo URL if available */
  logoUrl?: string;
  /** Approximate USD value if known */
  usdValue?: number;
  /** Risk level from signals API (cached) */
  riskLevel?: 'low' | 'medium' | 'high' | 'unknown';
  /** Risk factors from GoPlus */
  riskFactors?: string[];
}

/** Per-chain scan progress */
export interface ChainScanProgress {
  chainName: ScanChainName;
  chainId: number;
  status: ChainScanStatus;
  /** Tokens found so far on this chain */
  tokens: ScannedToken[];
  /** Number of token contracts checked */
  checked: number;
  /** Total token contracts to check */
  total: number;
  /** Time elapsed in ms */
  elapsedMs: number;
  /** Error message if failed */
  error?: string;
  /** Error code for UI hints */
  errorCode?: 'rpc_timeout' | 'rate_limited' | 'checksum_error' | 'unknown';
  /** Which RPC was used */
  rpcUsed?: string;
}

/** A complete scan session */
export interface ScanSession {
  id: string;
  status: ScanSessionStatus;
  walletAddress: string;
  startedAt: number;
  completedAt?: number;
  chains: Record<ScanChainName, ChainScanProgress>;
  /** Total tokens found across all chains */
  totalFound: number;
  /** Total tokens added to watchlist in this session */
  totalAdded: number;
}

/** Scan log entry for structured logging */
export interface ScanLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  chain?: ScanChainName;
  message: string;
  data?: Record<string, unknown>;
}

/** Options for starting a scan */
export interface ScanOptions {
  /** Which chains to scan (default: all) */
  chains?: ScanChainName[];
  /** Whether to use Transfer log discovery (advanced) */
  discoverTokens?: boolean;
  /** Max blocks to look back for Transfer logs */
  discoveryBlockRange?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/** Debug info for "Copy debug info" button */
export interface ScanDebugInfo {
  sessionId: string;
  walletAddress: string;
  chains: Array<{
    name: ScanChainName;
    chainId: number;
    status: ChainScanStatus;
    rpcUsed: string;
    elapsedMs: number;
    tokensFound: number;
    errorCode?: string;
    errorMessage?: string;
  }>;
  totalElapsedMs: number;
  timestamp: string;
  userAgent: string;
}
