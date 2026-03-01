/**
 * Wallet Scan Service (v3)
 *
 * Re-exports the public API for the wallet scan feature.
 */

export { useScanStore } from './scanStore';
export { scanChain, connectToRpc, connectToSpecificRpc } from './scanEngine';
export {
  getRpcEndpoints, getChainDisplayName, getChainNativeSymbol, ALL_SCAN_CHAINS,
  DEGRADED_AFTER_SEC, getExplorerTokenUrl, getExplorerAddressUrl, getDexScreenerUrl,
} from './rpcConfig';
export {
  fetchEnrichment, applyEnrichment, getCachedRisk,
  parseRiskFactors, computeRiskLevel,
} from './enrichment';
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
  RiskLevel,
  RiskFactor,
  DegradedReason,
  DustFilterSettings,
} from './types';
export { SCAN_CHAIN_IDS, CHAIN_ID_TO_SCAN_NAME, DEFAULT_DUST_SETTINGS } from './types';
