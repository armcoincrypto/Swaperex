/**
 * P16.2 — Swap URL query persistence (chain, tokens, slippage).
 * Never trust raw URL input — validate against catalog and bounds.
 */

import { COMMISSION_SWAP_CHAIN_IDS } from '@/constants/commissionChains';
import { getTokenBySymbol } from '@/tokens';
import type { AssetInfo } from '@/types/api';

const SLIPPAGE_MIN = 0.01;
const SLIPPAGE_MAX = 50;
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,16}$/;

export interface SwapUrlParams {
  chain?: number;
  from?: string;
  to?: string;
  slippage?: number;
}

export interface ParsedSwapUrlState {
  params: SwapUrlParams;
  /** Params dropped because they were invalid */
  rejected: string[];
}

function parseChain(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  if (!COMMISSION_SWAP_CHAIN_IDS.includes(n as (typeof COMMISSION_SWAP_CHAIN_IDS)[number])) {
    return undefined;
  }
  return n;
}

function parseSymbol(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || !SYMBOL_PATTERN.test(trimmed)) return undefined;
  return trimmed.toUpperCase();
}

function parseSlippage(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < SLIPPAGE_MIN || n > SLIPPAGE_MAX) return undefined;
  return Math.round(n * 100) / 100;
}

export function parseSwapSearchParams(search: string): ParsedSwapUrlState {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rejected: string[] = [];
  const params: SwapUrlParams = {};

  const chainRaw = sp.get('chain');
  const chain = parseChain(chainRaw);
  if (chainRaw && chain === undefined) rejected.push('chain');

  const fromRaw = sp.get('from');
  const from = parseSymbol(fromRaw);
  if (fromRaw && from === undefined) rejected.push('from');

  const toRaw = sp.get('to');
  const to = parseSymbol(toRaw);
  if (toRaw && to === undefined) rejected.push('to');

  const slippageRaw = sp.get('slippage');
  const slippage = parseSlippage(slippageRaw);
  if (slippageRaw && slippage === undefined) rejected.push('slippage');

  if (chain !== undefined) params.chain = chain;
  if (from !== undefined) params.from = from;
  if (to !== undefined) params.to = to;
  if (slippage !== undefined) params.slippage = slippage;

  return { params, rejected };
}

export function tokenToAssetInfo(symbol: string, chainId: number): AssetInfo | null {
  const token = getTokenBySymbol(symbol, chainId);
  if (!token) return null;
  const chainLabel =
    chainId === 56 ? 'bsc' : chainId === 137 ? 'polygon' : 'ethereum';
  return {
    symbol: token.symbol,
    name: token.name,
    chain: chainLabel,
    decimals: token.decimals,
    is_native: symbol === 'ETH' || symbol === 'BNB' || symbol === 'MATIC',
    contract_address: token.address,
    logo_url: token.logoURI,
  };
}

export interface BuildSwapSearchParamsInput {
  chainId?: number | null;
  fromSymbol?: string | null;
  toSymbol?: string | null;
  slippage?: number | null;
}

/** Build validated swap query string (no leading `?`). */
export function buildSwapSearchParams(input: BuildSwapSearchParamsInput): string {
  const sp = new URLSearchParams();

  if (input.chainId != null && COMMISSION_SWAP_CHAIN_IDS.includes(input.chainId as never)) {
    sp.set('chain', String(input.chainId));
  }

  const from = input.fromSymbol?.trim().toUpperCase();
  if (from && SYMBOL_PATTERN.test(from)) {
    sp.set('from', from);
  }

  const to = input.toSymbol?.trim().toUpperCase();
  if (to && SYMBOL_PATTERN.test(to)) {
    sp.set('to', to);
  }

  if (
    input.slippage != null &&
    Number.isFinite(input.slippage) &&
    input.slippage >= SLIPPAGE_MIN &&
    input.slippage <= SLIPPAGE_MAX
  ) {
    sp.set('slippage', String(input.slippage));
  }

  return sp.toString();
}

export function swapSearchStringsEqual(a: string, b: string): boolean {
  const norm = (s: string) => {
    const sp = new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
    const entries = [...sp.entries()].sort(([ka], [kb]) => ka.localeCompare(kb));
    return new URLSearchParams(entries).toString();
  };
  return norm(a) === norm(b);
}
