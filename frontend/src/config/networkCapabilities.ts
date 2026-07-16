/**
 * P15 — Canonical network capability registry.
 * Single source for wallet vs swap vs portfolio capability — do not duplicate in UI components.
 */

import { CHAINS, getChain } from '@/wallet/chains';
import type { ChainConfig } from '@/wallet/types';
import {
  COMMISSION_SWAP_CHAIN_IDS,
  isCommissionSwapChain,
} from '@/constants/commissionChains';

export type NetworkCapabilityStatus =
  | 'swap_enabled'
  | 'read_only'
  | 'send_enabled'
  | 'data_only'
  | 'unavailable';

export interface NetworkCapability {
  networkId: string;
  chainId: number;
  name: string;
  shortName: string;
  walletConnectSupported: boolean;
  readOnlySupported: boolean;
  marketDataSupported: boolean;
  portfolioSupported: boolean;
  sendSupported: boolean;
  swapSupported: boolean;
  commissionWrapperSupported: boolean;
  productionCertified: boolean;
  explorerUrl: string;
  nativeToken: string;
  /** Lower = higher in selectors */
  displayOrder: number;
  /** User-facing explanation when capability is limited */
  statusReason: string | null;
  capabilityStatus: NetworkCapabilityStatus;
}

const WALLET_CHAIN_IDS = CHAINS.map((c) => c.id);

/** Chains with static token lists / screener data (may exceed wallet connect set). */
const MARKET_DATA_CHAIN_IDS = new Set([1, 56, 137, 42161, 10, 43114, 100, 250, 8453]);

function networkIdFromChain(chain: ChainConfig): string {
  return chain.shortName.toLowerCase();
}

function buildCapability(chain: ChainConfig): NetworkCapability {
  const swapSupported = isCommissionSwapChain(chain.id);
  const walletSupported = WALLET_CHAIN_IDS.includes(chain.id);

  let capabilityStatus: NetworkCapabilityStatus = 'unavailable';
  let statusReason: string | null = null;

  if (swapSupported) {
    capabilityStatus = 'swap_enabled';
    statusReason = null;
  } else if (walletSupported) {
    capabilityStatus = 'read_only';
    statusReason =
      'Swaps are available on Ethereum and BNB Chain only. This network supports balance viewing, portfolio, and send.';
  } else {
    capabilityStatus = 'unavailable';
    statusReason = 'This network is not supported in the Kobbex wallet interface.';
  }

  return {
    networkId: networkIdFromChain(chain),
    chainId: chain.id,
    name: chain.name,
    shortName: chain.shortName,
    walletConnectSupported: walletSupported,
    readOnlySupported: walletSupported,
    marketDataSupported: MARKET_DATA_CHAIN_IDS.has(chain.id),
    portfolioSupported: walletSupported,
    sendSupported: walletSupported,
    swapSupported,
    commissionWrapperSupported: swapSupported,
    productionCertified: swapSupported,
    explorerUrl: chain.explorer,
    nativeToken: chain.nativeSymbol,
    displayOrder: swapSupported ? chain.id === 1 ? 0 : 1 : 10 + chain.id,
    statusReason,
    capabilityStatus,
  };
}

/** All wallet-visible networks with declared capabilities. */
export const NETWORK_CAPABILITIES: NetworkCapability[] = CHAINS.map(buildCapability);

export const NETWORK_CAPABILITY_BY_CHAIN_ID: Record<number, NetworkCapability> = Object.fromEntries(
  NETWORK_CAPABILITIES.map((n) => [n.chainId, n]),
);

export function getNetworkCapability(chainId: number): NetworkCapability | undefined {
  return NETWORK_CAPABILITY_BY_CHAIN_ID[chainId];
}

/** Swap-enabled networks first, then read-only wallet networks. */
export function getWalletNetworkCapabilities(): NetworkCapability[] {
  return [...NETWORK_CAPABILITIES]
    .filter((n) => n.walletConnectSupported)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getSwapEnabledNetworkCapabilities(): NetworkCapability[] {
  return NETWORK_CAPABILITIES.filter((n) => n.swapSupported);
}

export function getNetworkCapabilityLabel(chainId: number): string {
  const cap = getNetworkCapability(chainId);
  if (!cap) return 'Unavailable';
  if (cap.swapSupported) return 'Swap enabled';
  if (cap.readOnlySupported) return 'Balances & send only';
  return 'Unavailable';
}

export function getSwapUnavailableReason(chainId: number): string {
  const cap = getNetworkCapability(chainId);
  if (!cap) {
    return 'This network is not supported. Swaps are available on Ethereum and BNB Chain.';
  }
  if (cap.swapSupported) return '';
  return (
    cap.statusReason ??
    'Swaps are currently available on Ethereum and BNB Chain only.'
  );
}

export function isSwapEnabledNetwork(chainId: number): boolean {
  return getNetworkCapability(chainId)?.swapSupported ?? false;
}

export function formatSwapEnabledNetworkList(): string {
  return getSwapEnabledNetworkCapabilities()
    .map((n) => n.name)
    .join(' and ');
}

/** Re-export chain lookup for explorer links in capability-aware UI */
export { getChain, COMMISSION_SWAP_CHAIN_IDS };
