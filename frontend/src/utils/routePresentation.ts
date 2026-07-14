/**
 * P18.4 / P18.5 — Canonical public route presentation (no canary / pilot language).
 */

export type RoutePresentation = {
  /** Primary UI: short human-readable venue */
  shortName: string;
  /** Details: full router / wrapper wording */
  displayName: string;
  /** Advanced / support: slug id */
  supportIdentifier: string;
};

const ROUTE_PRESENTATION: Record<string, RoutePresentation> = {
  '1inch': {
    shortName: '1inch',
    displayName: '1inch aggregator',
    supportIdentifier: '1inch',
  },
  'uniswap-v3': {
    shortName: 'Uniswap V3',
    displayName: 'Uniswap V3',
    supportIdentifier: 'uniswap-v3',
  },
  'uniswap-v3-wrapper': {
    shortName: 'Uniswap V3',
    displayName: 'Uniswap V3 via Swaperex Wrapper',
    supportIdentifier: 'uniswap-v3-wrapper',
  },
  'uniswap-v3-wrapper-v2': {
    shortName: 'Uniswap V3',
    displayName: 'Uniswap V3 via Swaperex Wrapper V2',
    supportIdentifier: 'uniswap-v3-wrapper-v2',
  },
  'uniswap-v3-wrapper-v3': {
    shortName: 'Uniswap V3',
    displayName: 'Uniswap V3 via Swaperex Wrapper V3',
    supportIdentifier: 'uniswap-v3-wrapper-v3',
  },
  'pancakeswap-v3': {
    shortName: 'PancakeSwap V3',
    displayName: 'PancakeSwap V3',
    supportIdentifier: 'pancakeswap-v3',
  },
  'pancakeswap-v3-wrapper': {
    shortName: 'PancakeSwap V3',
    displayName: 'PancakeSwap V3 via Swaperex Wrapper',
    supportIdentifier: 'pancakeswap-v3-wrapper',
  },
  'pancakeswap-v3-wrapper-v2': {
    shortName: 'PancakeSwap V3',
    displayName: 'PancakeSwap V3 via Swaperex Wrapper V2',
    supportIdentifier: 'pancakeswap-v3-wrapper-v2',
  },
};

function normalizeProviderKey(provider: string): string {
  return String(provider || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

export function getRoutePresentation(provider: string): RoutePresentation {
  const key = normalizeProviderKey(provider);
  if (ROUTE_PRESENTATION[key]) return ROUTE_PRESENTATION[key];
  return {
    shortName: provider || '—',
    displayName: provider || '—',
    supportIdentifier: key || 'unknown',
  };
}

/** Full public route name (details / transparency card). */
export function getRouteDisplayName(provider: string): string {
  return getRoutePresentation(provider).displayName;
}

/** Short venue name for badges / compact UI. */
export function getRouteShortName(provider: string): string {
  return getRoutePresentation(provider).shortName;
}

/** Internal route id for advanced details / support diagnostics. */
export function getRouteSupportIdentifier(provider: string): string {
  return getRoutePresentation(provider).supportIdentifier;
}

/** Why-this-route tooltip copy — public, no canary wording. */
export function getRouteExplanation(provider: string): string {
  const key = normalizeProviderKey(provider);
  switch (key) {
    case '1inch':
      return 'The aggregator compares multiple DEX routes and picks the best output for this size (may split across pools).';
    case 'uniswap-v3':
      return 'Direct swap through Uniswap V3 concentrated liquidity on this chain.';
    case 'uniswap-v3-wrapper':
      return 'Uniswap V3 execution via the Swaperex fee wrapper on Ethereum (ERC20→ERC20). Quoted output is net of the wrapper protocol fee.';
    case 'uniswap-v3-wrapper-v2':
      return 'Uniswap V3 via Swaperex Wrapper V2 on Ethereum. Quoted output is net of the wrapper protocol fee.';
    case 'uniswap-v3-wrapper-v3':
      return 'Uniswap V3 via Swaperex Wrapper V3 on Ethereum (multi-hop exactInput). Quoted output is net of the wrapper protocol fee.';
    case 'pancakeswap-v3':
      return 'Direct swap through PancakeSwap V3 on BNB Chain.';
    case 'pancakeswap-v3-wrapper':
      return 'PancakeSwap V3 execution via the Swaperex fee wrapper on BNB Chain (ERC20→ERC20). Quoted output is net of the wrapper protocol fee.';
    case 'pancakeswap-v3-wrapper-v2':
      return 'PancakeSwap V3 via Swaperex Wrapper V2. Quoted output is net of the wrapper protocol fee.';
    default:
      return 'Route selected for best output among sources we query for this pair.';
  }
}
