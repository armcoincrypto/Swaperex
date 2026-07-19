/**
 * P21.4 — Verified Kobbex wrapper / treasury constants for assertions.
 * Cross-check against .env.production and on-chain wrapper verification in journeys.
 */

export const KOBBEX_WRAPPERS = {
  ethV1: '0xe07f5940487a58E30F9fa711Be358FB036B0Fc44',
  ethV2: '0x660B2E98E9eeAA4CaE21f319FbF3D6aD6909b491',
  ethV3: '0xa7702Ce9267567fd811B39C886CdABeC6eB249fc',
  bscV2: '0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6',
} as const;

export const KOBBEX_TREASURY = '0x509Cfd32ce279E08010C143F90Cc1782a3520196';

export const KOBBEX_FEE_BPS = {
  ethereum: 20,
  bsc: 50,
} as const;

/** Direct routers that must never be eth_sendTransaction destinations in commission mode. */
export const FORBIDDEN_DIRECT_ROUTERS = [
  '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 SwapRouter
  '0x68b3465833fb72A710864c5b2b37E7e959EAe627', // Uniswap SwapRouter02
  '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', // Pancake SmartRouter
  '0x10ED43C718714eb63d5aA57B78B54704E256024E', // Pancake V2 router
] as const;

export const ERC20_APPROVE_SELECTOR = '0x095ea7b3';

export function normalizeAddress(addr: string | undefined | null): string {
  return (addr || '').toLowerCase();
}

export function isKobbexWrapper(address: string, chainId: number): boolean {
  const a = normalizeAddress(address);
  if (chainId === 1) {
    return (
      a === normalizeAddress(KOBBEX_WRAPPERS.ethV1) ||
      a === normalizeAddress(KOBBEX_WRAPPERS.ethV2) ||
      a === normalizeAddress(KOBBEX_WRAPPERS.ethV3)
    );
  }
  if (chainId === 56) {
    return a === normalizeAddress(KOBBEX_WRAPPERS.bscV2);
  }
  return false;
}

export function isForbiddenDirectRouter(address: string): boolean {
  const a = normalizeAddress(address);
  return FORBIDDEN_DIRECT_ROUTERS.some((r) => normalizeAddress(r) === a);
}

export function dataSelector(data: string | undefined): string {
  if (!data || data === '0x') return '';
  return data.slice(0, 10).toLowerCase();
}
