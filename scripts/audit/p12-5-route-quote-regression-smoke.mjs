#!/usr/bin/env node
/**
 * P12.5 — Route/quote regression scheduled smoke (read-only).
 * Validates production swap surface, on-chain wrapper quotes, and browser quote UI.
 *
 * Usage:
 *   node scripts/audit/p12-5-route-quote-regression-smoke.mjs
 *   node scripts/audit/p12-5-route-quote-regression-smoke.mjs --base-url https://dex.kobbex.com
 *   node scripts/audit/p12-5-route-quote-regression-smoke.mjs --output reports/p12-5-route-quote-smoke.json
 *   node scripts/audit/p12-5-route-quote-regression-smoke.mjs --dry-run
 *
 * Exit codes: 0 = pass, 1 = regression, 2 = environment failure
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

/** Derived from scripts/audit/audit-commission-pairs.mjs CANDIDATES + manual-qa SUPPORTED */
const ROUTE_MATRIX = [
  { id: 'eth-usdt', chainId: 1, from: 'ETH', to: 'USDT', amount: '0.01', required: true, tags: ['native', 'featured', 'ethereum'] },
  { id: 'weth-usdt', chainId: 1, from: 'WETH', to: 'USDT', amount: '0.01', required: true, tags: ['erc20', 'featured', 'ethereum'] },
  { id: 'weth-usdc', chainId: 1, from: 'WETH', to: 'USDC', amount: '0.01', required: false, tags: ['featured', 'ethereum'] },
  { id: 'eth-usdc', chainId: 1, from: 'ETH', to: 'USDC', amount: '0.01', required: false, tags: ['native', 'ethereum'] },
  { id: 'bnb-usdt', chainId: 56, from: 'BNB', to: 'USDT', amount: '0.1', required: true, tags: ['native', 'bsc'] },
  { id: 'wbnb-usdt', chainId: 56, from: 'WBNB', to: 'USDT', amount: '0.1', required: true, tags: ['erc20', 'bsc'] },
  { id: 'weth-pepe-block', chainId: 1, from: 'WETH', to: 'PEPE', amount: '0.01', required: false, expectBlocked: true, tags: ['blocked'] },
];

const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const ETH_RPC = process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com';
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
const FEE_TIERS = [100, 500, 3000, 10000];
const PANCAKE_FEE_TIERS = [100, 500, 2500, 10000];
const BLOCKED = new Set(['1|WETH|PEPE', '1|PEPE|WETH']);
const READ_ONLY_ADDRESS = process.env.SWAPEREX_QA_ADDRESS || '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const QUOTE_TIMEOUT_MS = Number(process.env.P12_QUOTE_TIMEOUT_MS || 90_000);

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.SWAPEREX_QA_URL || 'https://dex.kobbex.com',
    output: path.join(REPO_ROOT, 'reports/p12-5-route-quote-smoke.json'),
    dryRun: false,
    skipBrowser: process.env.P12_SKIP_BROWSER === '1',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--skip-browser') opts.skipBrowser = true;
    else if (a === '--base-url') opts.baseUrl = argv[++i];
    else if (a === '--output') opts.output = argv[++i];
  }
  return opts;
}

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
  for (const t of raw.tokens) map.set(t.symbol.toUpperCase(), { ...t, symbol: t.symbol.toUpperCase() });
  return map;
}

function swapAddress(token, chainId, getAddressFn) {
  if (token.address.toLowerCase() === NATIVE.toLowerCase()) return chainId === 1 ? WETH : WBNB;
  return getAddressFn(token.address);
}

function pairKey(chainId, from, to) {
  return `${chainId}|${from.toUpperCase()}|${to.toUpperCase()}`;
}

const V2_ABI = [{
  inputs: [
    { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' },
    { name: 'fee', type: 'uint24' }, { name: 'amountIn', type: 'uint256' },
    { name: 'sqrtPriceLimitX96', type: 'uint160' },
  ],
  name: 'quoteExactInputSingleERC20',
  outputs: [
    { name: 'amountOutGross', type: 'uint256' }, { name: 'feeAmount', type: 'uint256' },
    { name: 'amountOutNet', type: 'uint256' }, { name: 'sqrtPriceX96After', type: 'uint160' },
    { name: 'initializedTicksCrossed', type: 'uint32' }, { name: 'gasEstimate', type: 'uint256' },
  ],
  stateMutability: 'nonpayable', type: 'function',
}];

async function quoteEthV2(provider, wrapper, tokenIn, tokenOut, amountHuman, Contract, parseUnits, getAddressFn) {
  const inAddr = swapAddress(tokenIn, 1, getAddressFn);
  const outAddr = swapAddress(tokenOut, 1, getAddressFn);
  const amountInWei = parseUnits(amountHuman, tokenIn.decimals);
  const c = new Contract(wrapper, V2_ABI, provider);
  let lastErr;
  for (const fee of FEE_TIERS) {
    try {
      const r = await c.quoteExactInputSingleERC20.staticCall(inAddr, outAddr, fee, amountInWei, 0n);
      return { provider: 'uniswap-v3-wrapper-v2', feeBps: 20, feeTier: fee, amountOutNet: r[2], feeAmount: r[1] };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('no V2 pool');
}

async function quoteBscV2(provider, wrapper, tokenIn, tokenOut, amountHuman, Contract, parseUnits, getAddressFn) {
  const inAddr = swapAddress(tokenIn, 56, getAddressFn);
  const outAddr = swapAddress(tokenOut, 56, getAddressFn);
  const amountInWei = parseUnits(amountHuman, tokenIn.decimals);
  const c = new Contract(wrapper, V2_ABI, provider);
  let lastErr;
  for (const fee of PANCAKE_FEE_TIERS) {
    try {
      const r = await c.quoteExactInputSingleERC20.staticCall(inAddr, outAddr, fee, amountInWei, 0n);
      return { provider: 'pancakeswap-v3-wrapper-v2', feeBps: 50, feeTier: fee, amountOutNet: r[2], feeAmount: r[1] };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('no BSC V2 pool');
}

async function runOnChainQuote(route, env, ethTokens, bscTokens, ethProvider, bscProvider, ethers) {
  const { Contract, formatUnits, parseUnits, getAddress } = ethers;
  const key = pairKey(route.chainId, route.from, route.to);
  const started = Date.now();
  if (BLOCKED.has(key)) {
    return {
      layer: 'onchain',
      id: route.id,
      status: route.expectBlocked ? 'PASS' : 'FAIL',
      quoteStatus: 'BLOCKED',
      latencyMs: Date.now() - started,
      assertions: { blockedAsExpected: route.expectBlocked === true },
    };
  }
  const tokens = route.chainId === 1 ? ethTokens : bscTokens;
  const tokenIn = tokens.get(route.from.toUpperCase());
  const tokenOut = tokens.get(route.to.toUpperCase());
  if (!tokenIn || !tokenOut) {
    return { layer: 'onchain', id: route.id, status: 'FAIL', error: 'token missing', latencyMs: Date.now() - started };
  }
  try {
    let result;
    if (route.chainId === 1) {
      result = await quoteEthV2(ethProvider, env.VITE_UNISWAP_WRAPPER_V2_ADDRESS, tokenIn, tokenOut, route.amount, Contract, parseUnits, getAddress);
    } else {
      result = await quoteBscV2(bscProvider, env.VITE_PANCAKE_WRAPPER_V2_ADDRESS, tokenIn, tokenOut, route.amount, Contract, parseUnits, getAddress);
    }
    const amountOut = Number(formatUnits(result.amountOutNet, tokenOut.decimals));
    const finite = Number.isFinite(amountOut) && amountOut > 0;
    const commissionApplied = result.feeAmount > 0n;
    return {
      layer: 'onchain',
      id: route.id,
      direction: `${route.from}→${route.to}`,
      chainId: route.chainId,
      status: finite && commissionApplied ? 'PASS' : 'FAIL',
      quoteStatus: 'PASS',
      amountIn: route.amount,
      amountOut,
      provider: result.provider,
      feeBps: result.feeBps,
      latencyMs: Date.now() - started,
      assertions: {
        amountOutPositive: amountOut > 0,
        amountOutFinite: Number.isFinite(amountOut),
        commissionApplied,
        providerPresent: !!result.provider,
        inputAmountUnchanged: route.amount,
      },
    };
  } catch (e) {
    return {
      layer: 'onchain',
      id: route.id,
      status: 'FAIL',
      error: (e?.shortMessage || e?.message || String(e)).slice(0, 280),
      latencyMs: Date.now() - started,
    };
  }
}

async function fetchVersion(baseUrl) {
  const res = await fetch(`${baseUrl}/version.txt`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`version.txt HTTP ${res.status}`);
  const text = await res.text();
  const short = (text.match(/short=(\w+)/) || [])[1] || null;
  return { text: text.trim(), short };
}

async function runHttpChecks(baseUrl) {
  const results = [];
  const push = (id, ok, detail = {}) => results.push({ layer: 'http', id, status: ok ? 'PASS' : 'FAIL', ...detail });

  try {
    const version = await fetchVersion(baseUrl);
    push('version_txt', !!version.short, { productionVersion: version.short });
  } catch (e) {
    push('version_txt', false, { error: e.message });
    return results;
  }

  for (const route of ['/', '/trust', '/about', '/privacy', '/disclaimer']) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${baseUrl}${route}`, { signal: AbortSignal.timeout(20_000) });
      const html = await res.text();
      const hasRoot = html.includes('id="root"') || html.includes('id=\"root\"');
      push(`route_${route.replace(/\//g, '') || 'home'}`, res.ok && hasRoot, { httpStatus: res.status, latencyMs: Date.now() - t0 });
    } catch (e) {
      push(`route_${route.replace(/\//g, '') || 'home'}`, false, { error: e.message, latencyMs: Date.now() - t0 });
    }
  }

  try {
    const indexRes = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(20_000) });
    const html = await indexRes.text();
    const jsMatch = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    if (!jsMatch) {
      push('entry_bundle', false, { error: 'index bundle not found in HTML' });
    } else {
      const assetUrl = `${baseUrl}${jsMatch[0]}`;
      const assetRes = await fetch(assetUrl, { signal: AbortSignal.timeout(20_000) });
      push('entry_bundle', assetRes.ok, { asset: jsMatch[0], httpStatus: assetRes.status });
    }
  } catch (e) {
    push('entry_bundle', false, { error: e.message });
  }

  return results;
}

async function runBrowserSmoke(baseUrl) {
  const playwrightHref = new URL('../../frontend/node_modules/playwright/index.mjs', import.meta.url).href;
  let chromium;
  try {
    ({ chromium } = await import(playwrightHref));
  } catch (e) {
    return [{ layer: 'browser', id: 'playwright', status: 'FAIL', error: `Playwright unavailable: ${e.message}` }];
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('swaperex_terms_accepted_v1', JSON.stringify({ version: 1, acceptedAt: Date.now() }));
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (msg.type() === 'error') consoleErrors.push(t);
    if (msg.type() === 'warning') consoleWarnings.push(t);
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message || String(err)));

  const results = [];
  const record = (id, ok, detail = {}) => results.push({ layer: 'browser', id, status: ok ? 'PASS' : 'FAIL', ...detail });

  try {
    const t0 = Date.now();
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    const blank = body.length < 200 || !body.includes('Swap');
    record('homepage_swap_surface', !blank, { latencyMs: Date.now() - t0 });
    record('no_fatal_console', !consoleErrors.some((e) => /Uncaught|TDZ|createAppKit|Something went wrong/i.test(e)));

    await page.getByRole('button', { name: 'View address' }).first().click({ timeout: 10_000, force: true });
    await page.locator('#wallet-address, input[placeholder="0x..."]').first().fill(READ_ONLY_ADDRESS);
    await page.getByRole('button', { name: 'View', exact: true }).first().click({ force: true });
    await page.waitForTimeout(1500);
    record('readonly_connect', await page.locator('button').filter({ hasText: /^0x/i }).first().isVisible().catch(() => false));

    for (const [from, to, amount] of [['ETH', 'USDT', '0.01'], ['WETH', 'USDT', '0.01']]) {
      const id = `ui_quote_${from.toLowerCase()}_${to.toLowerCase()}`;
      const fromBtn = page.locator('button[title*=" — "]').nth(0);
      const fromTitle = (await fromBtn.getAttribute('title')) || '';
      if (!fromTitle.startsWith(`${from} `)) {
        await fromBtn.click({ force: true });
        await page.getByPlaceholder('Search or paste contract address...').fill(from);
        await page.waitForTimeout(900);
        await page.getByText(from, { exact: true }).first().click({ force: true });
        await page.waitForTimeout(600);
      }
      await page.locator('input[placeholder="0.0"]').first().fill('');
      await page.locator('input[placeholder="0.0"]').first().fill(amount);
      await page.waitForTimeout(2000);
      const start = Date.now();
      let ok = false;
      while (Date.now() - start < QUOTE_TIMEOUT_MS) {
        const txt = await page.locator('body').innerText();
        if ((txt.includes('Min out') || txt.includes('Exchange rate') || txt.includes('Swaperex wrapper') || txt.includes('Quote ready')) && !txt.includes('Getting quote')) {
          ok = true;
          break;
        }
        await page.waitForTimeout(1200);
      }
      record(id, ok, { latencyMs: Date.now() - start, from, to, amount });
    }
  } catch (e) {
    record('browser_fatal', false, { error: (e.message || String(e)).slice(0, 300) });
  } finally {
    await browser.close();
  }

  return { results, consoleErrors, consoleWarnings };
}

function summarize(report) {
  const required = report.routeMatrix.filter((r) => r.required);
  const requiredOnchain = report.results.filter((r) => r.layer === 'onchain' && required.some((x) => x.id === r.id));
  const requiredFail = requiredOnchain.some((r) => r.status === 'FAIL');
  const httpFail = report.results.filter((r) => r.layer === 'http' && r.status === 'FAIL');
  const browserFail = report.results.filter((r) => r.layer === 'browser' && r.status === 'FAIL' && !r.id?.includes('playwright'));
  const envFail = report.results.some((r) => r.id === 'playwright' && r.status === 'FAIL');

  if (envFail) {
    report.verdict = 'P12_5_ROUTE_QUOTE_REGRESSION_SMOKE_BLOCKED';
    report.exitCode = 2;
    return;
  }
  if (requiredFail || httpFail.length > 0 || browserFail.length > 0) {
    report.verdict = 'P12_5_ROUTE_QUOTE_REGRESSION_SMOKE_BLOCKED';
    report.exitCode = 1;
    return;
  }
  const warn = report.consoleWarnings?.length > 0;
  report.verdict = warn
    ? 'P12_5_ROUTE_QUOTE_REGRESSION_SMOKE_READY_WITH_WARNINGS'
    : 'P12_5_ROUTE_QUOTE_REGRESSION_SMOKE_PASS';
  report.exitCode = 0;
}

async function main() {
  const opts = parseArgs(process.argv);
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    productionVersion: null,
    browserRuntime: opts.skipBrowser ? 'skipped' : 'Chromium Playwright headless',
    routeMatrix: ROUTE_MATRIX,
    routeSelectionSource: 'scripts/audit/audit-commission-pairs.mjs CANDIDATES + manual-qa SUPPORTED',
    dryRun: opts.dryRun,
    results: [],
    consoleErrors: [],
    consoleWarnings: [],
    fatalErrors: [],
    summary: {},
    verdict: null,
    exitCode: 2,
  };

  if (opts.dryRun) {
    console.log(JSON.stringify({ dryRun: true, baseUrl: opts.baseUrl, routeMatrix: ROUTE_MATRIX, checks: ['http', 'onchain', 'browser'] }, null, 2));
    process.exit(0);
  }

  try {
    const version = await fetchVersion(opts.baseUrl);
    report.productionVersion = version.short;
  } catch (e) {
    report.fatalErrors.push(e.message);
    report.verdict = 'P12_5_ROUTE_QUOTE_REGRESSION_SMOKE_BLOCKED';
    report.exitCode = 2;
    fs.mkdirSync(path.dirname(opts.output), { recursive: true });
    fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  report.results.push(...(await runHttpChecks(opts.baseUrl)));

  const ethersHref = new URL('../../frontend/node_modules/ethers/lib.esm/index.js', import.meta.url).href;
  const ethers = await import(ethersHref);
  const { Contract, JsonRpcProvider, Network, getAddress } = ethers;

  const env = loadEnvProduction();
  const ethTokens = loadTokens('ethereum.json');
  const bscTokens = loadTokens('bsc.json');
  const ethProvider = new JsonRpcProvider(ETH_RPC, Network.from(1), { staticNetwork: Network.from(1) });
  const bscProvider = new JsonRpcProvider(BSC_RPC, Network.from(56), { staticNetwork: Network.from(56) });

  for (const route of ROUTE_MATRIX) {
    report.results.push(await runOnChainQuote(route, env, ethTokens, bscTokens, ethProvider, bscProvider, ethers));
  }

  if (!opts.skipBrowser) {
    const browser = await runBrowserSmoke(opts.baseUrl);
    report.results.push(...browser.results);
    report.consoleErrors = browser.consoleErrors;
    report.consoleWarnings = browser.consoleWarnings;
  }

  const pass = report.results.filter((r) => r.status === 'PASS').length;
  const fail = report.results.filter((r) => r.status === 'FAIL').length;
  report.summary = { total: report.results.length, pass, fail };
  summarize(report);

  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
  fs.mkdirSync(path.join(REPO_ROOT, 'docs/audits/raw/p12_5_route_quote'), { recursive: true });
  fs.writeFileSync(
    path.join(REPO_ROOT, 'docs/audits/raw/p12_5_route_quote', `smoke-${report.timestamp.replace(/[:.]/g, '-')}.json`),
    JSON.stringify(report, null, 2),
  );

  console.log(JSON.stringify({ verdict: report.verdict, summary: report.summary, output: opts.output }, null, 2));
  process.exit(report.exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
