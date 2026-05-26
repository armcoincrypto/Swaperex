#!/usr/bin/env node
/**
 * P3.2 — Commission coverage audit (read-only).
 * No swaps, approvals, keys, or wallet. Static RPC + wrapper quoter staticCall only.
 *
 * Usage (repo root):
 *   node scripts/audit/commission-coverage-audit.mjs
 *   ENV_FILE=frontend/.env.production node scripts/audit/commission-coverage-audit.mjs
 *   OUT_JSON=reports/commission-coverage-audit.json node scripts/audit/commission-coverage-audit.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.join(REPO_ROOT, 'frontend');
const ENV_FILE = process.env.ENV_FILE || path.join(FRONTEND, '.env.production');
const OUT_JSON = process.env.OUT_JSON || path.join(REPO_ROOT, 'reports', 'commission-coverage-audit.json');

const ethersHref = new URL('../../frontend/node_modules/ethers/lib.esm/index.js', import.meta.url).href;
const { Contract, JsonRpcProvider, Network, formatUnits, parseUnits, solidityPacked, getAddress } =
  await import(ethersHref);

const ENABLED = new Set(['1', 'true', 'yes', 'on']);
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const ETH_FEE_V2 = [100, 500, 3000, 10000];
const ETH_FEE_V3 = [500, 3000, 100, 10000];
const BSC_FEE = [100, 500, 2500, 10000];

const WRAPPER_V2_SINGLE_ABI = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'quoteExactInputSingleERC20',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const WRAPPER_V3_MULTI_ABI = [
  {
    inputs: [
      { name: 'path', type: 'bytes' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    name: 'quoteExactInputERC20',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
      { name: '', type: 'uint160[]' },
      { name: '', type: 'uint32[]' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const FEE_BPS_ABI = [
  { inputs: [], name: 'feeBps', outputs: [{ name: '', type: 'uint16' }], stateMutability: 'view', type: 'function' },
];

function loadEnv(filePath) {
  const env = { ...process.env };
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function parseBool(raw) {
  if (raw === undefined || raw === null) return false;
  return ENABLED.has(String(raw).trim().toLowerCase());
}

function norm(sym) {
  return String(sym || '')
    .trim()
    .toUpperCase();
}

function loadTokenList(chainId) {
  const file = chainId === 56 ? 'bsc.json' : 'ethereum.json';
  const raw = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'src/tokens', file), 'utf8'));
  const map = new Map();
  for (const t of raw.tokens) {
    map.set(norm(t.symbol), { ...t, symbol: norm(t.symbol) });
  }
  return map;
}

function isNativeAddr(addr) {
  return String(addr).toLowerCase() === NATIVE;
}

function checksumAddr(addr) {
  const raw = String(addr);
  try {
    return getAddress(raw);
  } catch {
    try {
      return getAddress(raw.toLowerCase());
    } catch {
      return raw;
    }
  }
}

function swapAddr(token, chainId) {
  if (isNativeAddr(token.address)) {
    return chainId === 56 ? checksumAddr(WBNB) : checksumAddr(WETH);
  }
  return checksumAddr(token.address);
}

function parseCanaryList(env) {
  const raw = env.VITE_UNISWAP_WRAPPER_V3_CANARY_PAIRS;
  const defaults = ['WETH-USDC', 'WETH-USDC-SNX', 'WETH-USDC-PENDLE'];
  const segments = raw && String(raw).trim() !== '' ? String(raw).split(',') : defaults;
  const out = [];
  for (const piece of segments) {
    const parts = piece
      .split('-')
      .map((p) => norm(p))
      .filter(Boolean);
    if (parts.length >= 2) out.push(parts);
  }
  return out.length ? out : [['WETH', 'USDC']];
}

function resolveV3Path(fromSym, toSym, canaryList) {
  const a = norm(fromSym);
  const b = norm(toSym);
  for (const row of canaryList) {
    const first = norm(row[0]);
    const last = norm(row[row.length - 1]);
    if (first === a && last === b) return [...row];
    if (row.length === 2 && first === b && last === a) return [row[1], row[0]];
    if (row.length > 2 && first === b && last === a) return [...row].reverse();
  }
  return null;
}

function encodeV3Path(tokenAddresses, fees) {
  const types = [];
  const vals = [];
  for (let i = 0; i < tokenAddresses.length; i++) {
    types.push('address');
    vals.push(tokenAddresses[i]);
    if (i < fees.length) {
      types.push('uint24');
      vals.push(BigInt(fees[i]));
    }
  }
  return solidityPacked(types, vals);
}

function* feeTuples(hops) {
  const order = ETH_FEE_V3;
  if (hops === 1) {
    for (const f of order) yield [f];
    return;
  }
  if (hops === 2) {
    for (const f0 of order) {
      for (const f1 of order) yield [f0, f1];
    }
  }
}

function isNativeWrapped(chainId, fromSym, toSym) {
  if (chainId === 1) {
    return (
      (fromSym === 'ETH' && toSym === 'WETH') ||
      (fromSym === 'WETH' && toSym === 'ETH')
    );
  }
  if (chainId === 56) {
    return (
      (fromSym === 'BNB' && toSym === 'WBNB') ||
      (fromSym === 'WBNB' && toSym === 'BNB')
    );
  }
  return false;
}

function pickEthProvider(env, fromTok, toTok, canaryList) {
  const inNat = isNativeAddr(fromTok.address);
  const outNat = isNativeAddr(toTok.address);
  const u3 = parseBool(env.VITE_UNISWAP_WRAPPER_V3_ENABLED) && env.VITE_UNISWAP_WRAPPER_V3_ADDRESS;
  const u2 = parseBool(env.VITE_UNISWAP_WRAPPER_V2_ENABLED) && env.VITE_UNISWAP_WRAPPER_V2_ADDRESS;
  const u1 = parseBool(env.VITE_UNISWAP_WRAPPER_ENABLED) && env.VITE_UNISWAP_WRAPPER_ADDRESS;
  const v2NativeQuote = parseBool(env.VITE_UNISWAP_WRAPPER_V2_NATIVE_QUOTE_ENABLED);

  if (inNat || outNat) {
    if (!u2) return { provider: null, wrapperVersion: null, reason: 'v2_disabled' };
    if (!v2NativeQuote) return { provider: null, wrapperVersion: null, reason: 'native_quote_disabled' };
    return { provider: 'uniswap-v3-wrapper-v2', wrapperVersion: 'V2', wrapperAddress: env.VITE_UNISWAP_WRAPPER_V2_ADDRESS };
  }

  const path = resolveV3Path(fromTok.symbol, toTok.symbol, canaryList);
  if (u3 && path) {
    return {
      provider: 'uniswap-v3-wrapper-v3',
      wrapperVersion: 'V3',
      wrapperAddress: env.VITE_UNISWAP_WRAPPER_V3_ADDRESS,
      v3Path: path,
    };
  }
  if (u2) {
    return { provider: 'uniswap-v3-wrapper-v2', wrapperVersion: 'V2', wrapperAddress: env.VITE_UNISWAP_WRAPPER_V2_ADDRESS };
  }
  if (u1) {
    return { provider: 'uniswap-v3-wrapper', wrapperVersion: 'V1', wrapperAddress: env.VITE_UNISWAP_WRAPPER_ADDRESS };
  }
  return { provider: null, wrapperVersion: null, reason: 'no_wrapper' };
}

function pickBscProvider(env) {
  const p2 = parseBool(env.VITE_PANCAKE_WRAPPER_V2_ENABLED) && env.VITE_PANCAKE_WRAPPER_V2_ADDRESS;
  if (!p2) return { provider: null, wrapperVersion: null, reason: 'pancake_v2_disabled' };
  return {
    provider: 'pancakeswap-v3-wrapper-v2',
    wrapperVersion: 'PancakeV2',
    wrapperAddress: env.VITE_PANCAKE_WRAPPER_V2_ADDRESS,
  };
}

async function readFeeBps(provider, wrapperAddress) {
  try {
    const c = new Contract(wrapperAddress, FEE_BPS_ABI, provider);
    const raw = await c.feeBps();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function quoteSingle(provider, wrapperAddress, tokenIn, tokenOut, amountInWei, feeOrder) {
  const wrapper = new Contract(wrapperAddress, WRAPPER_V2_SINGLE_ABI, provider);
  let lastErr;
  for (const fee of feeOrder) {
    try {
      const result = await wrapper.quoteExactInputSingleERC20.staticCall(
        tokenIn,
        tokenOut,
        fee,
        amountInWei,
        0n,
      );
      return {
        amountOutNet: result[2],
        feeTier: fee,
        gasEstimate: result[5],
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('no_pool');
}

async function quoteV3(provider, wrapperAddress, pathSymbols, tokens, amountInWei, outDecimals) {
  const addrs = pathSymbols.map((s) => swapAddr(tokens.get(s), 1));
  const hops = addrs.length - 1;
  const wrapper = new Contract(wrapperAddress, WRAPPER_V3_MULTI_ABI, provider);
  let lastErr;
  for (const fees of feeTuples(hops)) {
    const path = encodeV3Path(addrs, fees);
    try {
      const result = await wrapper.quoteExactInputERC20.staticCall(
        path,
        addrs[0],
        addrs[addrs.length - 1],
        amountInWei,
      );
      return {
        amountOutNet: result[2],
        feeAmount: result[1],
        v3FeeTiers: fees,
        gasEstimate: result[5],
        path: pathSymbols.join('→'),
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('no_v3_route');
}

function defaultAmount(fromSym, toSym) {
  const f = norm(fromSym);
  if (f === 'ETH' || f === 'WETH' || f === 'BNB' || f === 'WBNB') return '0.01';
  if (f === 'WBTC' || f === 'BTCB') return '0.001';
  if (['USDC', 'USDT', 'DAI', 'BUSD', 'FDUSD'].includes(f)) return '25';
  return '10';
}

/** Product policy — static quote may succeed (often dust) but must never be promoted. */
const POLICY_BLOCKED_PAIR_KEYS = new Set(['1|WETH|PEPE', '1|PEPE|WETH']);

const POLICY_BLOCK_RECOMMENDATION =
  'Do not promote — quote exists but route is blocked by policy / low-confidence output.';

function pairKey(chainId, fromSym, toSym) {
  return `${chainId}|${norm(fromSym)}|${norm(toSym)}`;
}

function isPolicyBlockedPair(chainId, fromSym, toSym) {
  return POLICY_BLOCKED_PAIR_KEYS.has(pairKey(chainId, fromSym, toSym));
}

const TEST_PAIRS = [
  // Ethereum — proven majors
  { chainId: 1, from: 'WETH', to: 'USDC' },
  { chainId: 1, from: 'USDC', to: 'WETH' },
  { chainId: 1, from: 'WETH', to: 'USDT' },
  { chainId: 1, from: 'USDT', to: 'WETH' },
  { chainId: 1, from: 'ETH', to: 'USDC' },
  { chainId: 1, from: 'USDC', to: 'ETH' },
  { chainId: 1, from: 'ETH', to: 'USDT' },
  { chainId: 1, from: 'USDT', to: 'ETH' },
  { chainId: 1, from: 'WETH', to: 'WBTC' },
  { chainId: 1, from: 'WBTC', to: 'WETH' },
  { chainId: 1, from: 'ETH', to: 'WETH' },
  { chainId: 1, from: 'WETH', to: 'ETH' },
  // Expansion candidates
  { chainId: 1, from: 'WETH', to: 'DAI' },
  { chainId: 1, from: 'DAI', to: 'WETH' },
  { chainId: 1, from: 'WETH', to: 'LINK' },
  { chainId: 1, from: 'LINK', to: 'WETH' },
  { chainId: 1, from: 'WETH', to: 'UNI' },
  { chainId: 1, from: 'UNI', to: 'WETH' },
  { chainId: 1, from: 'WETH', to: 'SNX' },
  { chainId: 1, from: 'SNX', to: 'WETH' },
  { chainId: 1, from: 'WETH', to: 'PENDLE' },
  { chainId: 1, from: 'PENDLE', to: 'WETH' },
  { chainId: 1, from: 'WETH', to: 'AAVE' },
  { chainId: 1, from: 'AAVE', to: 'WETH' },
  { chainId: 1, from: 'WETH', to: 'LDO' },
  { chainId: 1, from: 'LDO', to: 'WETH' },
  { chainId: 1, from: 'WETH', to: 'PEPE' },
  // BSC
  { chainId: 56, from: 'BNB', to: 'USDT' },
  { chainId: 56, from: 'USDT', to: 'BNB' },
  { chainId: 56, from: 'BNB', to: 'USDC' },
  { chainId: 56, from: 'USDC', to: 'BNB' },
  { chainId: 56, from: 'WBNB', to: 'USDT' },
  { chainId: 56, from: 'USDT', to: 'WBNB' },
  { chainId: 56, from: 'BNB', to: 'WBNB' },
  { chainId: 56, from: 'WBNB', to: 'BTCB' },
  { chainId: 56, from: 'BTCB', to: 'WBNB' },
  { chainId: 56, from: 'CAKE', to: 'USDT' },
  { chainId: 56, from: 'USDT', to: 'CAKE' },
];

function classifyPreQuote(chainId, fromSym, toSym, env, canaryList) {
  if (!parseBool(env.VITE_COMMISSION_REQUIRED)) {
    return { classification: 'CHAIN_NOT_COMMISSION_READY', reasonCode: 'commission_not_required_in_env' };
  }
  if (chainId !== 1 && chainId !== 56) {
    return { classification: 'CHAIN_NOT_COMMISSION_READY', reasonCode: 'unsupported_chain' };
  }
  if (isNativeWrapped(chainId, fromSym, toSym)) {
    return {
      classification: 'NATIVE_WRAP_SPECIAL',
      reasonCode: 'native_wrapped_not_commission_swap',
      recommendedAction: 'Show wrap/unwrap helper only; do not market as DEX swap.',
    };
  }
  return null;
}

async function auditPair(env, ethProvider, bscProvider, ethTokens, bscTokens, canaryList, pair) {
  const { chainId, from: fromSym, to: toSym } = pair;
  const tokens = chainId === 56 ? bscTokens : ethTokens;
  const provider = chainId === 56 ? bscProvider : ethProvider;
  const fromTok = tokens.get(norm(fromSym));
  const toTok = tokens.get(norm(toSym));

  const base = {
    chain: chainId === 56 ? 'BSC' : 'Ethereum',
    chainId,
    from: norm(fromSym),
    to: norm(toSym),
    providerSelected: null,
    wrapperVersion: null,
    estimatedOutput: null,
    feeBps: null,
    reasonCode: null,
    recommendedAction: null,
  };

  const pre = classifyPreQuote(chainId, fromSym, toSym, env, canaryList);
  if (pre) return { ...base, ...pre };

  if (!fromTok || !toTok) {
    return {
      ...base,
      classification: 'UNSUPPORTED_COMMISSION',
      reasonCode: 'unknown_token_symbol',
      recommendedAction: 'Add token to static list or exclude from suggestions.',
    };
  }

  const route =
    chainId === 56
      ? pickBscProvider(env, fromTok, toTok)
      : pickEthProvider(env, fromTok, toTok, canaryList);

  if (!route.provider) {
    return {
      ...base,
      classification: 'UNSUPPORTED_COMMISSION',
      reasonCode: route.reason || 'no_commission_provider',
      recommendedAction: 'Enable wrapper or add pair to V3 canary before UX promotion.',
    };
  }

  if (chainId === 56) {
    const inNat = isNativeAddr(fromTok.address);
    const outNat = isNativeAddr(toTok.address);
    const nativeOn = parseBool(env.VITE_PANCAKE_WRAPPER_V2_NATIVE_QUOTE_ENABLED);
    if ((inNat || outNat) && !nativeOn) {
      return {
        ...base,
        classification: 'UNSUPPORTED_COMMISSION',
        reasonCode: 'bsc_native_quote_disabled',
        recommendedAction: 'Enable VITE_PANCAKE_WRAPPER_V2_NATIVE_QUOTE_ENABLED for BNB legs.',
      };
    }
  }

  const amountHuman = defaultAmount(fromSym, toSym);
  const amountInWei = parseUnits(amountHuman, fromTok.decimals);
  let feeBps = null;
  try {
    feeBps = await readFeeBps(provider, route.wrapperAddress);
  } catch {
    /* optional */
  }

  try {
    let quote;
    if (route.provider === 'uniswap-v3-wrapper-v3') {
      quote = await quoteV3(provider, route.wrapperAddress, route.v3Path, tokens, amountInWei, toTok.decimals);
    } else {
      const feeOrder = chainId === 56 ? BSC_FEE : ETH_FEE_V2;
      quote = await quoteSingle(
        provider,
        route.wrapperAddress,
        swapAddr(fromTok, chainId),
        swapAddr(toTok, chainId),
        amountInWei,
        feeOrder,
      );
    }
    const out = formatUnits(quote.amountOutNet, toTok.decimals);
    if (isPolicyBlockedPair(chainId, fromSym, toSym)) {
      return {
        ...base,
        classification: 'BLOCKED_POLICY',
        providerSelected: route.provider,
        wrapperVersion: route.wrapperVersion,
        estimatedOutput: out,
        amountIn: amountHuman,
        feeBps: feeBps ?? (chainId === 56 ? Number(env.VITE_PANCAKE_WRAPPER_V2_FEE_BPS) : Number(env.VITE_UNISWAP_WRAPPER_V3_FEE_BPS || env.VITE_UNISWAP_WRAPPER_V2_FEE_BPS || 20)),
        v3Path: quote.path || null,
        reasonCode: 'blocked_by_product_policy',
        recommendedAction: POLICY_BLOCK_RECOMMENDATION,
      };
    }
    return {
      ...base,
      classification: 'SUPPORTED_COMMISSION',
      providerSelected: route.provider,
      wrapperVersion: route.wrapperVersion,
      estimatedOutput: out,
      amountIn: amountHuman,
      feeBps: feeBps ?? (chainId === 56 ? Number(env.VITE_PANCAKE_WRAPPER_V2_FEE_BPS) : Number(env.VITE_UNISWAP_WRAPPER_V3_FEE_BPS || env.VITE_UNISWAP_WRAPPER_V2_FEE_BPS || 20)),
      v3Path: quote.path || null,
      reasonCode: 'quote_ok',
      recommendedAction:
        route.provider === 'uniswap-v3-wrapper-v3'
          ? 'Safe for commission UX; keep on V3 canary list.'
          : 'Safe for commission UX; keep in supported tier.',
    };
  } catch (err) {
    const msg = err?.shortMessage || err?.message || String(err);
    const notAllowlisted =
      route.provider === 'uniswap-v3-wrapper-v2' &&
      !resolveV3Path(fromSym, toSym, canaryList) &&
      parseBool(env.VITE_UNISWAP_WRAPPER_V3_ENABLED) &&
      !isNativeAddr(fromTok.address) &&
      !isNativeAddr(toTok.address);

    return {
      ...base,
      classification: notAllowlisted ? 'UNSUPPORTED_COMMISSION' : 'QUOTE_FAILED',
      providerSelected: route.provider,
      wrapperVersion: route.wrapperVersion,
      reasonCode: notAllowlisted ? 'not_on_v3_canary_v2_fallback_failed' : 'wrapper_quote_revert',
      errorDetail: msg.slice(0, 240),
      recommendedAction: notAllowlisted
        ? 'Add WETH-USDC-TOKEN to VITE_UNISWAP_WRAPPER_V3_CANARY_PAIRS or quote via V2 if pool exists.'
        : 'Check V3 pool liquidity / fee tier; do not show Likely routable until quote succeeds.',
    };
  }
}

function printTable(rows) {
  const cols = [
    ['chain', 10],
    ['from', 8],
    ['to', 8],
    ['class', 22],
    ['provider', 26],
    ['out', 12],
    ['reason', 28],
  ];
  const hdr = cols.map(([k, w]) => k.padEnd(w)).join(' ');
  console.log(hdr);
  console.log('-'.repeat(hdr.length));
  for (const r of rows) {
    console.log(
      [
        [r.chain, 10],
        [r.from, 8],
        [r.to, 8],
        [r.classification, 22],
        [r.providerSelected || r.wrapperVersion || '-', 26],
        [r.estimatedOutput || '-', 12],
        [r.reasonCode || '-', 28],
      ]
        .map(([v, w]) => String(v).slice(0, w).padEnd(w))
        .join(' '),
    );
  }
}

function buildExpansionTiers(rows) {
  const supported = rows.filter((r) => r.classification === 'SUPPORTED_COMMISSION');
  const policyBlocked = rows.filter((r) => r.classification === 'BLOCKED_POLICY');
  const quoteFailed = rows.filter((r) => r.classification === 'QUOTE_FAILED');
  const unsupported = rows.filter((r) => r.classification === 'UNSUPPORTED_COMMISSION');
  const nativeWrap = rows.filter((r) => r.classification === 'NATIVE_WRAP_SPECIAL');

  const tier1Keys = new Set([
    '1|WETH|USDT',
    '1|USDT|WETH',
    '1|WETH|DAI',
    '1|DAI|WETH',
    '56|BNB|USDT',
    '56|USDT|BNB',
    '56|BNB|USDC',
  ]);

  const tier2Keys = new Set([
    '1|WETH|LINK',
    '1|LINK|WETH',
    '1|WETH|UNI',
    '1|UNI|WETH',
    '1|WETH|SNX',
    '1|SNX|WETH',
    '1|WETH|PENDLE',
    '1|PENDLE|WETH',
    '56|WBNB|USDT',
  ]);

  const tier1 = [];
  const tier2 = [];
  const tier3 = [];
  const tier4 = nativeWrap.map((r) => ({
    pair: `${r.from}→${r.to}`,
    chain: r.chain,
    note: r.recommendedAction || 'Native wrap — not a commission DEX swap.',
  }));

  for (const r of supported) {
    const key = `${r.chainId}|${r.from}|${r.to}`;
    const entry = { pair: `${r.from}→${r.to}`, chain: r.chain, note: r.recommendedAction };
    if (tier1Keys.has(key) && !['1|WETH|USDC', '1|USDC|WETH', '1|ETH|USDC', '1|ETH|USDT'].includes(key)) {
      tier1.push(entry);
    } else if (tier2Keys.has(key)) {
      tier2.push(entry);
    } else if (key.includes('WETH') && key.includes('USDC')) {
      /* already live */
    } else {
      tier1.push({ ...entry, note: 'Already quoting — keep promoted.' });
    }
  }

  for (const r of policyBlocked) {
    tier3.push({
      pair: `${r.from}→${r.to}`,
      chain: r.chain,
      note: r.recommendedAction || POLICY_BLOCK_RECOMMENDATION,
    });
  }
  for (const r of quoteFailed) {
    tier2.push({
      pair: `${r.from}→${r.to}`,
      chain: r.chain,
      note: r.recommendedAction || r.errorDetail,
    });
  }
  for (const r of unsupported) {
    if (r.reasonCode === 'not_on_v3_canary_v2_fallback_failed') {
      tier2.push({
        pair: `${r.from}→${r.to}`,
        chain: r.chain,
        note: 'Expand V3 canary then re-audit.',
      });
    } else {
      tier3.push({ pair: `${r.from}→${r.to}`, chain: r.chain, note: r.reasonCode });
    }
  }
  tier4.push({ pair: 'Exotic / un-audited', chain: 'Any', note: 'Do not show Likely routable without a fresh audit quote.' });

  return { tier1, tier2, tier3, tier4 };
}

async function main() {
  const env = loadEnv(ENV_FILE);
  const ethRpc = env.VITE_ETHEREUM_RPC_URL || process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com';
  const bscRpc = env.VITE_BSC_RPC_URL || process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';

  const ethNet = Network.from(1);
  const bscNet = Network.from(56);
  const ethProvider = new JsonRpcProvider(ethRpc, ethNet, { staticNetwork: ethNet });
  const bscProvider = new JsonRpcProvider(bscRpc, bscNet, { staticNetwork: bscNet });

  const ethTokens = loadTokenList(1);
  const bscTokens = loadTokenList(56);
  const canaryList = parseCanaryList(env);

  console.log('=== P3.2 Commission coverage audit (read-only) ===');
  console.log(`env=${ENV_FILE}`);
  console.log(`commission_required=${parseBool(env.VITE_COMMISSION_REQUIRED)}`);
  console.log(`eth_rpc=${ethRpc.replace(/\/\/[^@]+@/, '//***@')}`);
  console.log(`v3_canary=${canaryList.map((p) => p.join('-')).join(', ')}`);
  console.log(`pairs=${TEST_PAIRS.length}\n`);

  const rows = [];
  for (const pair of TEST_PAIRS) {
    process.stderr.write(`  quote ${pair.chainId} ${pair.from}→${pair.to}…\n`);
    const row = await auditPair(env, ethProvider, bscProvider, ethTokens, bscTokens, canaryList, pair);
    rows.push(row);
  }

  const expansion = buildExpansionTiers(rows);
  const summary = {
    auditedAt: new Date().toISOString(),
    envFile: ENV_FILE,
    commissionRequired: parseBool(env.VITE_COMMISSION_REQUIRED),
    v3CanaryPairs: canaryList,
    counts: {
      supported: rows.filter((r) => r.classification === 'SUPPORTED_COMMISSION').length,
      policyBlocked: rows.filter((r) => r.classification === 'BLOCKED_POLICY').length,
      unsupported: rows.filter((r) => r.classification === 'UNSUPPORTED_COMMISSION').length,
      quoteFailed: rows.filter((r) => r.classification === 'QUOTE_FAILED').length,
      nativeWrap: rows.filter((r) => r.classification === 'NATIVE_WRAP_SPECIAL').length,
    },
    pairs: rows,
    expansionRecommendations: expansion,
    supportedPairKeys: rows
      .filter((r) => r.classification === 'SUPPORTED_COMMISSION')
      .map((r) => `${r.chainId}|${r.from}|${r.to}`),
    blockedPairKeys: rows
      .filter(
        (r) =>
          r.classification === 'BLOCKED_POLICY' ||
          (r.classification !== 'SUPPORTED_COMMISSION' && r.classification !== 'NATIVE_WRAP_SPECIAL'),
      )
      .map((r) => `${r.chainId}|${r.from}|${r.to}`),
    policyBlockedPairKeys: rows
      .filter((r) => r.classification === 'BLOCKED_POLICY')
      .map((r) => `${r.chainId}|${r.from}|${r.to}`),
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));

  printTable(rows);
  console.log('\n=== Expansion tiers ===');
  for (const [name, list] of Object.entries(expansion)) {
    console.log(`\n${name}:`);
    for (const item of list) console.log(`  - ${item.chain} ${item.pair}: ${item.note}`);
  }
  console.log(`\nWrote ${OUT_JSON}`);
  console.log(
    `Summary: ${summary.counts.supported} supported, ${summary.counts.policyBlocked} policy_blocked, ${summary.counts.unsupported} unsupported, ${summary.counts.quoteFailed} quote_failed, ${summary.counts.nativeWrap} native_wrap`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
