#!/usr/bin/env node
/**
 * Read-only commission pair audit for Swaperex (chains 1 + 56 only).
 * Quotes via wrapper staticCall — never broadcasts transactions.
 *
 * Usage (repo root):
 *   node scripts/audit/audit-commission-pairs.mjs
 *   node scripts/audit/audit-commission-pairs.mjs --candidates-only
 *
 * Env: ETH_RPC_URL, BSC_RPC_URL (optional; public defaults used)
 * Loads wrapper addresses from frontend/.env.production
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ethersHref = new URL('../../frontend/node_modules/ethers/lib.esm/index.js', import.meta.url).href;
const { Contract, JsonRpcProvider, Network, formatUnits, parseUnits, solidityPacked, getAddress } =
  await import(ethersHref);

const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const ETH_RPC = process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com';
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';

const FEE_TIERS = [100, 500, 3000, 10000];
const PANCAKE_FEE_TIERS = [100, 500, 2500, 10000];

/** Default human amounts per token class */
const AMOUNT_PROFILES = {
  small: { ETH: '0.001', WETH: '0.001', BNB: '0.01', WBNB: '0.01', USDC: '5', USDT: '5', default: '0.01' },
  normal: { ETH: '0.01', WETH: '0.01', BNB: '0.1', WBNB: '0.1', USDC: '25', USDT: '25', default: '0.1' },
  large: { ETH: '0.1', WETH: '0.1', BNB: '1', WBNB: '1', USDC: '250', USDT: '250', default: '1' },
};

const V2_SINGLE_ABI = [
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

const V3_MULTI_ABI = [
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

function loadEnvProduction() {
  const p = path.join(REPO_ROOT, 'frontend/.env.production');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function loadTokens(chainFile) {
  const raw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'frontend/src/tokens', chainFile), 'utf8'));
  const map = new Map();
  for (const t of raw.tokens) {
    map.set(t.symbol.toUpperCase(), { ...t, symbol: t.symbol.toUpperCase() });
  }
  return map;
}

function swapAddress(token, chainId) {
  if (token.address.toLowerCase() === NATIVE.toLowerCase()) {
    return chainId === 1 ? WETH : WBNB;
  }
  return getAddress(token.address);
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

function parseV3Canary(env) {
  const raw = env.VITE_UNISWAP_WRAPPER_V3_CANARY_PAIRS || 'WETH-USDC,WETH-USDC-DAI,WETH-USDC-SNX,WETH-USDC-PENDLE';
  return raw.split(',').map((seg) =>
    seg
      .trim()
      .split('-')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  ).filter((p) => p.length >= 2);
}

function resolveV3Path(tokenInSym, tokenOutSym, canary) {
  const a = tokenInSym.toUpperCase();
  const b = tokenOutSym.toUpperCase();
  for (const path of canary) {
    const first = path[0];
    const last = path[path.length - 1];
    if (first === a && last === b) return [...path];
    if (path.length === 2 && first === b && last === a) return [path[1], path[0]];
  }
  return null;
}

function amountFor(profile, symbol) {
  const p = AMOUNT_PROFILES[profile];
  return p[symbol.toUpperCase()] ?? p.default;
}

function pairKey(chainId, from, to) {
  return `${chainId}|${from.toUpperCase()}|${to.toUpperCase()}`;
}

/** Candidate undirected pairs to audit */
const CANDIDATES = [
  // Ethereum — production majors
  { chainId: 1, a: 'WETH', b: 'USDC' },
  { chainId: 1, a: 'WETH', b: 'USDT' },
  { chainId: 1, a: 'WETH', b: 'DAI' },
  { chainId: 1, a: 'WETH', b: 'WBTC' },
  { chainId: 1, a: 'WETH', b: 'LINK' },
  { chainId: 1, a: 'WETH', b: 'UNI' },
  { chainId: 1, a: 'WETH', b: 'AAVE' },
  { chainId: 1, a: 'WETH', b: 'LDO' },
  { chainId: 1, a: 'WETH', b: 'SNX' },
  { chainId: 1, a: 'WETH', b: 'PENDLE' },
  { chainId: 1, a: 'ETH', b: 'USDC' },
  { chainId: 1, a: 'ETH', b: 'USDT' },
  // BSC
  { chainId: 56, a: 'BNB', b: 'USDT' },
  { chainId: 56, a: 'BNB', b: 'USDC' },
  { chainId: 56, a: 'WBNB', b: 'USDT' },
  { chainId: 56, a: 'WBNB', b: 'BTCB' },
  { chainId: 56, a: 'CAKE', b: 'USDT' },
  { chainId: 56, a: 'WBNB', b: 'CAKE' },
  { chainId: 56, a: 'WBNB', b: 'USDC' },
  { chainId: 56, a: 'WBNB', b: 'ETH' },
  { chainId: 56, a: 'WBNB', b: 'FDUSD' },
];

const BLOCKED = new Set(['1|WETH|PEPE', '1|PEPE|WETH']);

async function quoteEthV2(provider, wrapper, tokenIn, tokenOut, amountHuman) {
  const inAddr = swapAddress(tokenIn, 1);
  const outAddr = swapAddress(tokenOut, 1);
  const amountInWei = parseUnits(amountHuman, tokenIn.decimals);
  const c = new Contract(wrapper, V2_SINGLE_ABI, provider);
  let lastErr;
  for (const fee of FEE_TIERS) {
    try {
      const r = await c.quoteExactInputSingleERC20.staticCall(inAddr, outAddr, fee, amountInWei, 0n);
      return { provider: 'uniswap-v3-wrapper-v2', feeBps: 20, feeTier: fee, amountOutGross: r[0], feeAmount: r[1], amountOutNet: r[2] };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('no V2 pool');
}

async function quoteEthV3(provider, wrapper, pathSyms, tokens, amountHuman, tokenInSym, tokenOutSym) {
  const addrs = pathSyms.map((s) => swapAddress(tokens.get(s), 1));
  const tokenIn = tokens.get(tokenInSym);
  const tokenOut = tokens.get(tokenOutSym);
  const amountInWei = parseUnits(amountHuman, tokenIn.decimals);
  const hops = addrs.length - 1;
  const c = new Contract(wrapper, V3_MULTI_ABI, provider);
  let lastErr;
  for (const fee of FEE_TIERS) {
    if (hops !== 1 && hops !== 2) throw new Error('unsupported hop count');
    const fees = hops === 1 ? [fee] : [fee, fee];
    const pathBytes = encodeV3Path(addrs, fees);
    try {
      const r = await c.quoteExactInputERC20.staticCall(pathBytes, addrs[0], addrs[addrs.length - 1], amountInWei);
      return {
        provider: 'uniswap-v3-wrapper-v3',
        feeBps: 20,
        feeTier: fee,
        path: pathSyms.join('→'),
        amountOutGross: r[0],
        feeAmount: r[1],
        amountOutNet: r[2],
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('no V3 pool');
}

async function quoteBscV2(provider, wrapper, tokenIn, tokenOut, amountHuman) {
  const inAddr = swapAddress(tokenIn, 56);
  const outAddr = swapAddress(tokenOut, 56);
  const amountInWei = parseUnits(amountHuman, tokenIn.decimals);
  const c = new Contract(wrapper, V2_SINGLE_ABI, provider);
  let lastErr;
  for (const fee of PANCAKE_FEE_TIERS) {
    try {
      const r = await c.quoteExactInputSingleERC20.staticCall(inAddr, outAddr, fee, amountInWei, 0n);
      return { provider: 'pancakeswap-v3-wrapper-v2', feeBps: 50, feeTier: fee, amountOutGross: r[0], feeAmount: r[1], amountOutNet: r[2] };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('no BSC V2 pool');
}

async function quoteDirection({ chainId, fromSym, toSym, profile, env, ethTokens, bscTokens, ethProvider, bscProvider, v3Canary }) {
  const key = pairKey(chainId, fromSym, toSym);
  if (BLOCKED.has(key)) {
    return { chainId, pair: `${fromSym}/${toSym}`, direction: `${fromSym}→${toSym}`, quoteStatus: 'BLOCKED', error: 'policy block' };
  }

  const tokens = chainId === 1 ? ethTokens : bscTokens;
  const tokenIn = tokens.get(fromSym.toUpperCase());
  const tokenOut = tokens.get(toSym.toUpperCase());
  if (!tokenIn || !tokenOut) {
    return { chainId, pair: `${fromSym}/${toSym}`, direction: `${fromSym}→${toSym}`, quoteStatus: 'FAIL', error: 'token missing from JSON' };
  }

  const amountIn = amountFor(profile, fromSym);
  try {
    let result;
    if (chainId === 1) {
      const v3Path = resolveV3Path(fromSym, toSym, v3Canary);
      if (v3Path && !tokenIn.address.toLowerCase().includes('eeee') && !tokenOut.address.toLowerCase().includes('eeee')) {
        try {
          result = await quoteEthV3(ethProvider, env.VITE_UNISWAP_WRAPPER_V3_ADDRESS, v3Path, tokens, amountIn, fromSym, toSym);
        } catch {
          result = await quoteEthV2(ethProvider, env.VITE_UNISWAP_WRAPPER_V2_ADDRESS, tokenIn, tokenOut, amountIn);
        }
      } else {
        result = await quoteEthV2(ethProvider, env.VITE_UNISWAP_WRAPPER_V2_ADDRESS, tokenIn, tokenOut, amountIn);
      }
    } else {
      result = await quoteBscV2(bscProvider, env.VITE_PANCAKE_WRAPPER_V2_ADDRESS, tokenIn, tokenOut, amountIn);
    }

    if (result.feeAmount <= 0n) {
      return {
        chainId,
        pair: `${fromSym}/${toSym}`,
        direction: `${fromSym}→${toSym}`,
        quoteStatus: 'FAIL',
        amountIn,
        error: 'feeAmount is zero — commission not applied',
      };
    }

    return {
      chainId,
      pair: `${fromSym}/${toSym}`,
      direction: `${fromSym}→${toSym}`,
      quoteStatus: 'PASS',
      profile,
      amountIn,
      amountOut: formatUnits(result.amountOutNet, tokenOut.decimals),
      feeAmount: formatUnits(result.feeAmount, tokenOut.decimals),
      feeBps: result.feeBps,
      provider: result.provider,
      feeTier: result.feeTier,
      path: result.path || null,
      wrapper: chainId === 1
        ? result.provider.includes('v3')
          ? env.VITE_UNISWAP_WRAPPER_V3_ADDRESS
          : env.VITE_UNISWAP_WRAPPER_V2_ADDRESS
        : env.VITE_PANCAKE_WRAPPER_V2_ADDRESS,
    };
  } catch (e) {
    const msg = e?.shortMessage || e?.message || String(e);
    return {
      chainId,
      pair: `${fromSym}/${toSym}`,
      direction: `${fromSym}→${toSym}`,
      quoteStatus: 'FAIL',
      profile,
      amountIn,
      error: msg.slice(0, 280),
    };
  }
}

function printTable(rows) {
  console.log('\nchainId | pair | direction | quoteStatus | amountIn | amountOut | feeBps | provider | error');
  console.log('-'.repeat(120));
  for (const r of rows) {
    console.log(
      [
        r.chainId,
        r.pair,
        r.direction,
        r.quoteStatus,
        r.amountIn ?? '',
        r.amountOut ?? '',
        r.feeBps ?? '',
        r.provider ?? '',
        (r.error ?? '').slice(0, 40),
      ].join(' | '),
    );
  }
}

async function main() {
  const env = loadEnvProduction();
  if (env.VITE_COMMISSION_REQUIRED !== 'true') {
    console.warn('WARN: VITE_COMMISSION_REQUIRED is not true in .env.production');
  }

  const ethTokens = loadTokens('ethereum.json');
  const bscTokens = loadTokens('bsc.json');
  const v3Canary = parseV3Canary(env);

  const ethNet = Network.from(1);
  const bscNet = Network.from(56);
  const ethProvider = new JsonRpcProvider(ETH_RPC, ethNet, { staticNetwork: ethNet });
  const bscProvider = new JsonRpcProvider(BSC_RPC, bscNet, { staticNetwork: bscNet });

  const rows = [];
  const profiles = ['small', 'normal', 'large'];

  for (const { chainId, a, b } of CANDIDATES) {
    for (const fromSym of [a, b]) {
      const toSym = fromSym === a ? b : a;
      for (const profile of profiles) {
        const row = await quoteDirection({
          chainId,
          fromSym,
          toSym,
          profile,
          env,
          ethTokens,
          bscTokens,
          ethProvider,
          bscProvider,
          v3Canary,
        });
        rows.push(row);
      }
    }
  }

  printTable(rows);

  const passedKeys = new Set();
  const failedKeys = new Set();
  for (const r of rows) {
    const [from, to] = r.direction.split('→');
    const k = pairKey(r.chainId, from, to);
    if (r.quoteStatus === 'PASS') passedKeys.add(k);
    else if (r.quoteStatus === 'FAIL') failedKeys.add(k);
  }

  const undirectedPass = new Map();
  for (const { chainId, a, b } of CANDIDATES) {
    const fwd = pairKey(chainId, a, b);
    const rev = pairKey(chainId, b, a);
    const fwdOk = passedKeys.has(fwd);
    const revOk = passedKeys.has(rev);
    undirectedPass.set(`${chainId}:${a}/${b}`, { fwdOk, revOk, bidirectional: fwdOk && revOk });
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const reportDir = path.join(REPO_ROOT, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `commission-pair-audit-${stamp}.json`);
  const report = {
    auditedAt: new Date().toISOString(),
    ethRpc: ETH_RPC,
    bscRpc: BSC_RPC,
    commissionRequired: env.VITE_COMMISSION_REQUIRED === 'true',
    rows,
    summary: {
      totalDirections: rows.length,
      pass: rows.filter((r) => r.quoteStatus === 'PASS').length,
      fail: rows.filter((r) => r.quoteStatus === 'FAIL').length,
      blocked: rows.filter((r) => r.quoteStatus === 'BLOCKED').length,
      undirected: Object.fromEntries(undirectedPass),
      passedDirectionalKeys: [...passedKeys].sort(),
    },
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${reportPath}`);
  console.log(`PASS: ${report.summary.pass}  FAIL: ${report.summary.fail}  BLOCKED: ${report.summary.blocked}`);

  if (report.summary.fail > 0) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
