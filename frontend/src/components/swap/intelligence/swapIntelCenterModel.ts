/**
 * Pure models for Swap Intelligence Center — display-only, no execution logic.
 */

import type { AssetInfo } from '@/types/api';
import { isCommissionRequiredMode } from '@/config';
import { getProtocolStatistics } from '@/constants/protocolStatistics';
import { getChainName } from '@/utils/format';
import { isStaticToken } from '@/tokens';

export type PrepItemStatus = 'ok' | 'pending' | 'warn' | 'idle';

export interface TradePrepItem {
  id: string;
  label: string;
  status: PrepItemStatus;
  detail: string;
}

export interface MarketContextRow {
  label: string;
  value: string;
}

const COMMISSION_CHAINS = [
  { id: 1, label: 'Ethereum' },
  { id: 56, label: 'BNB Chain' },
] as const;

export function buildTradePreparationItems(params: {
  isConnected: boolean;
  isWrongChain: boolean;
  walletChainId: number | null;
  activeChainId: number;
  fromAsset: AssetInfo | null;
  toAsset: AssetInfo | null;
  slippage: number;
  hasActiveQuote: boolean;
  isQuoting: boolean;
}): TradePrepItem[] {
  const networkOk =
    params.isConnected &&
    !params.isWrongChain &&
    params.walletChainId === params.activeChainId;

  const receiveToken = params.toAsset;
  const tokenVerified =
    !!receiveToken &&
    (receiveToken.is_native ||
      (!!receiveToken.contract_address &&
        isStaticToken(receiveToken.contract_address, params.activeChainId)));

  let quoteStatus: PrepItemStatus = 'idle';
  let quoteDetail = 'Enter an amount to fetch a quote';
  if (params.isQuoting) {
    quoteStatus = 'pending';
    quoteDetail = 'Quote in progress…';
  } else if (params.hasActiveQuote) {
    quoteStatus = 'ok';
    quoteDetail = 'Active quote loaded — confirm before it expires';
  } else if (params.fromAsset && params.toAsset) {
    quoteStatus = 'pending';
    quoteDetail = 'No quote yet — enter amount or refresh';
  }

  return [
    {
      id: 'network',
      label: 'Wallet network matches route',
      status: !params.isConnected ? 'idle' : networkOk ? 'ok' : 'warn',
      detail: !params.isConnected
        ? 'Connect wallet to verify network'
        : networkOk
          ? `${getChainName(params.activeChainId)} aligned`
          : `Switch wallet to ${getChainName(params.activeChainId)}`,
    },
    {
      id: 'token',
      label: 'Receive token verified',
      status: !receiveToken ? 'idle' : tokenVerified ? 'ok' : 'warn',
      detail: !receiveToken
        ? 'Select receive token'
        : tokenVerified
          ? `${receiveToken.symbol} in audited catalog or native`
          : `${receiveToken.symbol} — verify contract before swapping`,
    },
    {
      id: 'slippage',
      label: 'Slippage reviewed',
      status: params.slippage > 0 ? 'ok' : 'warn',
      detail: `${params.slippage}% tolerance — adjust in swap settings if needed`,
    },
    {
      id: 'quote',
      label: 'Quote fresh',
      status: quoteStatus,
      detail: quoteDetail,
    },
  ];
}

export function buildMarketContext(activeChainId: number): MarketContextRow[] {
  const stats = getProtocolStatistics();
  const ethCount = stats.catalogPairsOnNetwork(1);
  const bscCount = stats.catalogPairsOnNetwork(56);
  const onChainCount = stats.catalogPairsOnNetwork(activeChainId);
  const directionalOnChain = stats.routesOnNetwork(activeChainId);

  const rows: MarketContextRow[] = [
    {
      label: 'Commission routing',
      value: isCommissionRequiredMode() ? 'Production-certified wrapper routes' : 'Standard routing',
    },
    {
      label: 'Supported networks',
      value: COMMISSION_CHAINS.map((c) => c.label).join(' · '),
    },
    {
      label: 'Supported pair entries (ETH / BSC)',
      value: `${ethCount} / ${bscCount} catalog pairs`,
    },
    {
      label: 'Certified directional routes',
      value: String(stats.certifiedDirectionalRoutes),
    },
    {
      label: 'Routes on this network',
      value:
        activeChainId === 1 || activeChainId === 56
          ? `${directionalOnChain} certified · ${onChainCount} catalog pairs`
          : 'Switch to Ethereum or BNB Chain',
    },
    {
      label: 'Route categories',
      value: 'Featured · High-liquidity · Certified',
    },
  ];

  return rows;
}
