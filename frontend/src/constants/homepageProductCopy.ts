/**
 * P9 — Homepage product copy (static, display-only).
 * Values must match Trust Center / commission audit facts — no invented metrics.
 */

import { COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS } from '@/constants/commissionCoverage';

export const HOMEPAGE_TRUST_STRIP =
  'Self-custody swaps · Audited routes · Live quotes · No registration · Ethereum & BNB Chain';

export const HOMEPAGE_PROTOCOL_STATS = [
  {
    id: 'routes',
    value: String(COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.size),
    label: 'Audited directional routes',
  },
  { id: 'networks', value: '2', label: 'Swap networks' },
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
    body: 'Your wallet. Your keys. Every swap is reviewed and signed by you.',
  },
  {
    title: 'Audited Routes',
    body: 'Swaperex enables only production-certified wrapper routes on supported networks.',
  },
  {
    title: 'Transparent Fees',
    body: 'Platform fees are shown before signing and deducted on-chain through wrapper routing.',
  },
] as const;

export const HOMEPAGE_INTEGRATIONS = [
  'Uniswap V3',
  'PancakeSwap V3',
  'WalletConnect',
  'GoPlus',
] as const;

export const HOMEPAGE_INTEGRATIONS_DISCLAIMER =
  'Routing infrastructure and security tooling referenced by the interface — not a partnership endorsement.';
