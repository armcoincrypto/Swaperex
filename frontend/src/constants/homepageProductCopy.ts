/**
 * P9 / P20 — Homepage product copy (static, display-only).
 * Values must match Trust Center / commission audit facts — no invented metrics.
 */

import { getProtocolStatistics } from '@/constants/protocolStatistics';

const protocolStats = getProtocolStatistics();

/** Single compact trust line for screen readers / optional display. */
export const HOMEPAGE_TRUST_STRIP =
  'Self-custody swaps with live quotes on Ethereum and BNB Chain';

/** Max three concise trust signals near the swap form (P20). */
export const HOMEPAGE_TRUST_PILLS = [
  'Self-custody',
  'Live quotes',
  'No registration',
] as const;

/** Network / route coverage metrics — not marketing principles. */
export const HOMEPAGE_PROTOCOL_STATS = [
  {
    id: 'networks',
    value: String(protocolStats.swapEnabledNetworks),
    label: 'Swap-enabled networks',
  },
  {
    id: 'routes',
    value: String(protocolStats.certifiedDirectionalRoutes),
    label: 'Production-certified routes',
  },
  {
    id: 'pairs',
    value: String(protocolStats.supportedPairEntries),
    label: 'Supported pair entries',
  },
] as const;

/** Product principles — shown in Why Swaperex / trust, not as “statistics”. */
export const HOMEPAGE_TRUST_PRINCIPLES = [
  { id: 'custody', value: '100%', label: 'Self-custody' },
  { id: 'keys', value: '0', label: 'Seed phrase access' },
] as const;

export const HOMEPAGE_FEE_STATS = [
  { network: 'Ethereum', fee: '0.20%' },
  { network: 'BNB Chain', fee: '0.50%' },
] as const;

export const HOMEPAGE_WHY_CARDS = [
  {
    title: 'Self-Custody',
    body: 'You remain in control of your wallet and sign every transaction.',
  },
  {
    title: 'Production-Certified Routes',
    body: 'Only internally validated routing paths are enabled in the interface.',
  },
  {
    title: 'Transparent Fees',
    body: 'Platform, pool, and estimated network fees are shown before signing.',
  },
] as const;

export const HOMEPAGE_INTEGRATIONS = [
  'Uniswap V3',
  'PancakeSwap V3',
  'WalletConnect',
  'GoPlus',
] as const;

export const HOMEPAGE_INTEGRATIONS_DISCLAIMER =
  'Routing uses Uniswap V3 and PancakeSwap V3 infrastructure. Wallet connectivity is provided through WalletConnect. References do not imply partnership or endorsement.';
