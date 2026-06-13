/**
 * Token safety signals for Swap Intelligence Center.
 * GoPlus-backed when contract metadata exists — never fabricates values.
 */

import { fetchTokenSecurity, type RiskLevel } from '@/services/tokenSecurity';

const GOPLUS_API = 'https://api.gopluslabs.io/api/v1/token_security';

const GOPLUS_CHAIN_IDS: Record<number, string> = {
  1: '1',
  56: '56',
  137: '137',
  42161: '42161',
};

export type SafetySignalStatus = 'ok' | 'warn' | 'risk' | 'unknown';

export interface SwapTokenSafetySignal {
  id: string;
  label: string;
  status: SafetySignalStatus;
  detail: string;
}

interface GoPlusRaw {
  is_open_source?: string;
  is_mintable?: string;
  is_proxy?: string;
  can_take_back_ownership?: string;
  hidden_owner?: string;
  owner_address?: string;
  owner_percent?: string;
  creator_percent?: string;
  holder_count?: string;
  dex?: Array<{ liquidity?: string }>;
}

function riskToStatus(level: RiskLevel): SafetySignalStatus {
  switch (level) {
    case 'safe':
      return 'ok';
    case 'warning':
      return 'warn';
    case 'risk':
      return 'risk';
    default:
      return 'unknown';
  }
}

function parseOwnership(data: GoPlusRaw): SwapTokenSafetySignal {
  if (data.can_take_back_ownership === '1') {
    return {
      id: 'ownership',
      label: 'Ownership',
      status: 'risk',
      detail: 'Ownership can be reclaimed by deployer',
    };
  }
  if (data.hidden_owner === '1') {
    return {
      id: 'ownership',
      label: 'Ownership',
      status: 'warn',
      detail: 'Hidden owner detected',
    };
  }
  const ownerPct = data.owner_percent ? parseFloat(data.owner_percent) * 100 : null;
  if (ownerPct != null && ownerPct >= 50) {
    return {
      id: 'ownership',
      label: 'Ownership',
      status: 'warn',
      detail: `Top owner holds ~${ownerPct.toFixed(0)}%`,
    };
  }
  if (data.owner_address && data.owner_address !== '0x0000000000000000000000000000000000000000') {
    return {
      id: 'ownership',
      label: 'Ownership',
      status: 'ok',
      detail: 'Ownership renounced or distributed',
    };
  }
  return {
    id: 'ownership',
    label: 'Ownership',
    status: 'unknown',
    detail: 'Ownership status unclear',
  };
}

function parseMintability(data: GoPlusRaw): SwapTokenSafetySignal {
  if (data.is_mintable === '1') {
    return {
      id: 'mintability',
      label: 'Mintability',
      status: 'warn',
      detail: 'Additional supply can be minted',
    };
  }
  if (data.is_mintable === '0') {
    return {
      id: 'mintability',
      label: 'Mintability',
      status: 'ok',
      detail: 'No mint function detected',
    };
  }
  return {
    id: 'mintability',
    label: 'Mintability',
    status: 'unknown',
    detail: 'Mint status unavailable',
  };
}

function parseProxy(data: GoPlusRaw): SwapTokenSafetySignal {
  if (data.is_proxy === '1') {
    return {
      id: 'proxy',
      label: 'Proxy',
      status: 'warn',
      detail: 'Upgradeable proxy — logic can change',
    };
  }
  if (data.is_proxy === '0') {
    return {
      id: 'proxy',
      label: 'Proxy',
      status: 'ok',
      detail: 'Not a proxy contract',
    };
  }
  return {
    id: 'proxy',
    label: 'Proxy',
    status: 'unknown',
    detail: 'Proxy status unavailable',
  };
}

function parseHolderConcentration(data: GoPlusRaw): SwapTokenSafetySignal {
  const ownerPct = data.owner_percent ? parseFloat(data.owner_percent) * 100 : null;
  const creatorPct = data.creator_percent ? parseFloat(data.creator_percent) * 100 : null;
  const topPct = Math.max(ownerPct ?? 0, creatorPct ?? 0);

  if (topPct >= 50) {
    return {
      id: 'holders',
      label: 'Holder concentration',
      status: 'risk',
      detail: `Top holder ~${topPct.toFixed(0)}% of supply`,
    };
  }
  if (topPct >= 20) {
    return {
      id: 'holders',
      label: 'Holder concentration',
      status: 'warn',
      detail: `Top holder ~${topPct.toFixed(0)}% of supply`,
    };
  }
  if (topPct > 0) {
    return {
      id: 'holders',
      label: 'Holder concentration',
      status: 'ok',
      detail: `Top holder ~${topPct.toFixed(0)}% of supply`,
    };
  }
  const count = data.holder_count ? parseInt(data.holder_count, 10) : null;
  if (count != null && count > 0) {
    return {
      id: 'holders',
      label: 'Holder concentration',
      status: 'ok',
      detail: `${count.toLocaleString()} holders on record`,
    };
  }
  return {
    id: 'holders',
    label: 'Holder concentration',
    status: 'unknown',
    detail: 'Holder data unavailable',
  };
}

async function fetchGoPlusRaw(
  contractAddress: string,
  chainId: number,
): Promise<GoPlusRaw | null> {
  const goPlusChainId = GOPLUS_CHAIN_IDS[chainId];
  if (!goPlusChainId) return null;

  try {
    const url = `${GOPLUS_API}/${goPlusChainId}?contract_addresses=${contractAddress.toLowerCase()}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code !== 1 || !data.result) return null;
    return data.result[contractAddress.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}

export async function fetchSwapTokenSafetySignals(params: {
  chainId: number;
  contractAddress?: string;
  isNative: boolean;
}): Promise<SwapTokenSafetySignal[] | null> {
  if (params.isNative || !params.contractAddress) {
    return null;
  }

  const [security, raw] = await Promise.all([
    fetchTokenSecurity(params.contractAddress, params.chainId),
    fetchGoPlusRaw(params.contractAddress, params.chainId),
  ]);

  if (!security && !raw) return null;

  const signals: SwapTokenSafetySignal[] = [];

  if (security) {
    signals.push({
      id: 'liquidity',
      label: 'Liquidity',
      status: riskToStatus(security.liquidity.level),
      detail: security.liquidity.value,
    });
    signals.push({
      id: 'contract',
      label: 'Contract verification',
      status: riskToStatus(security.contractVerified.level),
      detail: security.contractVerified.value,
    });
  }

  if (raw) {
    signals.push(parseOwnership(raw));
    signals.push(parseMintability(raw));
    signals.push(parseProxy(raw));
    signals.push(parseHolderConcentration(raw));
  } else if (security) {
    signals.push(
      { id: 'ownership', label: 'Ownership', status: 'unknown', detail: 'Ownership data unavailable' },
      { id: 'mintability', label: 'Mintability', status: 'unknown', detail: 'Mint status unavailable' },
      { id: 'proxy', label: 'Proxy', status: 'unknown', detail: 'Proxy status unavailable' },
      { id: 'holders', label: 'Holder concentration', status: 'unknown', detail: 'Holder data unavailable' },
    );
  }

  return signals.length > 0 ? signals : null;
}

export function statusColorClasses(status: SafetySignalStatus): string {
  switch (status) {
    case 'ok':
      return 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40';
    case 'warn':
      return 'text-amber-400 bg-amber-950/35 border-amber-800/40';
    case 'risk':
      return 'text-red-400 bg-red-950/35 border-red-800/40';
    default:
      return 'text-dark-400 bg-electro-panel/40 border-white/[0.06]';
  }
}

export function statusDotClass(status: SafetySignalStatus): string {
  switch (status) {
    case 'ok':
      return 'bg-emerald-400';
    case 'warn':
      return 'bg-amber-400';
    case 'risk':
      return 'bg-red-400';
    default:
      return 'bg-dark-500';
  }
}
