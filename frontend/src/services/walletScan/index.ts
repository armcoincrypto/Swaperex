/**
 * Wallet Scan Service
 *
 * Re-exports the public API for the wallet scan feature.
 */

export { useScanStore } from './scanStore';
export { scanChain } from './scanEngine';
export { getRpcEndpoints, getChainDisplayName, getChainNativeSymbol, ALL_SCAN_CHAINS } from './rpcConfig';
export { fetchEnrichment, applyEnrichment } from './enrichment';
export type {
  ScanChainName,
  ScannedToken,
  ChainScanProgress,
  ScanSession,
  ScanSessionStatus,
  ScanLogEntry,
  ScanOptions,
  ScanDebugInfo,
  ChainScanStatus,
  TokenSource,
} from './types';
export { SCAN_CHAIN_IDS, CHAIN_ID_TO_SCAN_NAME } from './types';
