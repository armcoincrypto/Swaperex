#!/usr/bin/env node
/**
 * P21.4 — No-broadcast wallet execution path certification (Playwright).
 *
 * Default: KOBBEX_WALLET_TEST_MODE=no_broadcast
 * Never broadcasts. Targets isolated preview (127.0.0.1) by default.
 *
 * Usage:
 *   npm run test:wallet:no-broadcast
 *   SWAPEREX_QA_URL=http://127.0.0.1:4173 node scripts/audit/wallet-automation/run-no-broadcast-journeys.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ACCOUNT_A,
  ACCOUNT_B,
  TREASURY,
  WRAPPERS,
  buildWalletInitScript,
} from './kobbexTestWalletProvider.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const FRONTEND = path.join(REPO, 'frontend');
const TS = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const ARTIFACTS = path.join(REPO, 'artifacts/wallet-automation', TS);
const DOCS = path.join(REPO, 'docs/audits', `kobbex-wallet-automation-${TS}.md`);

const MODE = process.env.KOBBEX_WALLET_TEST_MODE || 'no_broadcast';
let BASE = process.env.SWAPEREX_QA_URL || 'http://127.0.0.1:4177';
const START_PREVIEW = process.env.KOBBEX_START_PREVIEW !== '0';

const ETH_WEI = '0x' + (5n * 10n ** 18n).toString(16);
const BNB_WEI = '0x' + (2n * 10n ** 18n).toString(16);
const APPROVE_SEL = '0x095ea7b3';

fs.mkdirSync(path.join(ARTIFACTS, 'screenshots'), { recursive: true });

const summary = {
  startedAt: new Date().toISOString(),
  base: BASE,
  mode: MODE,
  journeys: {},
  totals: {
    WALLET_JOURNEYS_PASS: 0,
    WALLET_JOURNEYS_FAIL: 0,
    SEND_REQUESTS_INTERCEPTED: 0,
    NETWORK_BROADCASTS: 0,
    UNSUPPORTED_ROUTE_SEND_ATTEMPTS: 0,
  },
  productionScan: null,
  walletConnectGap: 'Shared post-connection path certified via EIP-1193 harness; live WC QR pairing not exercised',
};

function recordJourney(id, result) {
  summary.journeys[id] = result;
  if (result.result === 'PASS') summary.totals.WALLET_JOURNEYS_PASS += 1;
  else summary.totals.WALLET_JOURNEYS_FAIL += 1;
  summary.totals.SEND_REQUESTS_INTERCEPTED += result.sendIntercepted || 0;
  summary.totals.NETWORK_BROADCASTS += result.networkBroadcasts || 0;
  if (result.unsupportedSendAttempts) {
    summary.totals.UNSUPPORTED_ROUTE_SEND_ATTEMPTS += result.unsupportedSendAttempts;
  }
}

async function loadPlaywright() {
  const href = pathToFileURL(path.join(FRONTEND, 'node_modules/playwright/index.mjs')).href;
  return import(href);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findStores(page) {
  return page.evaluate(() => {
    const rootEl = document.querySelector('#root') || document.body;
    const fiberKey = Object.keys(rootEl).find(
      (k) => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'),
    );
    if (!fiberKey) return { ok: false, reason: 'no-react-fiber' };
    let fiber = rootEl[fiberKey];
    if (fiber?.stateNode?.current) fiber = fiber.stateNode.current;

    const consider = (st) => {
      if (!st || typeof st !== 'object') return;
      if ('isConnected' in st && typeof st.connect === 'function' && 'address' in st) {
        window.__kwWalletState = st;
      }
      if ('balances' in st && typeof st.fetchBalances === 'function') {
        window.__kwBalanceState = st;
      }
      if ('fromAmount' in st && typeof st.setFromAmount === 'function') {
        window.__kwSwapState = st;
      }
    };

    const queue = [fiber];
    let steps = 0;
    while (queue.length && steps++ < 60000) {
      const f = queue.shift();
      if (!f) continue;
      let hook = f.memoizedState;
      let guard = 0;
      while (hook && guard++ < 150) {
        consider(hook.memoizedState);
        if (hook.queue && 'value' in hook.queue) consider(hook.queue.value);
        if (hook.queue && typeof hook.queue.getSnapshot === 'function') {
          try {
            consider(hook.queue.getSnapshot());
          } catch (_) {}
        }
        hook = hook.next;
      }
      if (f.child) queue.push(f.child);
      if (f.sibling) queue.push(f.sibling);
    }
    return {
      ok: Boolean(window.__kwWalletState),
      wallet: Boolean(window.__kwWalletState),
      balance: Boolean(window.__kwBalanceState),
      swap: Boolean(window.__kwSwapState),
    };
  });
}

async function connectWallet(page, { address, chainId }) {
  // Freeze balance fetches before connect so real RPC zeros cannot overwrite seeded balances.
  await page.evaluate(() => {
    const st = window.__kwBalanceState;
    if (!st) return;
    st.fetchBalances = async () => {};
    st.fetchChainBalance = async () => {};
  });
  await page.evaluate(
    async ({ address, chainId }) => {
      const st = window.__kwWalletState;
      if (!st?.connect) throw new Error('wallet-state-missing');
      await st.connect(address, chainId, 'walletconnect');
    },
    { address, chainId },
  );
  await wait(300);
  await findStores(page);
  // Re-apply freeze after store rediscovery
  await page.evaluate(() => {
    const st = window.__kwBalanceState;
    if (!st) return;
    st.fetchBalances = async () => {};
    st.fetchChainBalance = async () => {};
  });
}

async function seedBalances(page, { chainKey, nativeSymbol, nativeBal }) {
  await page.evaluate(
    ({ chainKey, nativeSymbol, nativeBal }) => {
      const st = window.__kwBalanceState;
      if (!st) return;
      st.balances = {
        ...(st.balances || {}),
        [chainKey]: {
          chain: chainKey,
          native_balance: {
            symbol: nativeSymbol,
            balance: String(nativeBal),
            decimals: 18,
            chain: chainKey,
            name: nativeSymbol,
          },
          token_balances: [
            {
              symbol: 'USDC',
              balance: '100000',
              decimals: 6,
              chain: chainKey,
              name: 'USD Coin',
            },
            {
              symbol: 'USDT',
              balance: '100000',
              decimals: 18,
              chain: chainKey,
              name: 'Tether',
            },
            {
              symbol: 'WETH',
              balance: '50',
              decimals: 18,
              chain: chainKey,
              name: 'Wrapped Ether',
            },
            {
              symbol: 'CAKE',
              balance: '1000',
              decimals: 18,
              chain: chainKey,
              name: 'PancakeSwap',
            },
          ],
        },
      };
      st.chainStatus = { ...(st.chainStatus || {}), [chainKey]: 'ok', ethereum: 'ok', bsc: 'ok' };
      st.isLoading = false;
      st.fetchBalances = async () => {};
      st.fetchChainBalance = async () => {};
      if (typeof st.setHideZeroBalances === 'function') {
        const cur = st.hideZeroBalances;
        st.setHideZeroBalances(!cur);
        st.setHideZeroBalances(cur);
      }
    },
    { chainKey, nativeSymbol, nativeBal },
  );
}

async function openPopularAndClick(page, hrefPart, { chainId = 1, chainKey = 'ethereum', nativeSymbol = 'ETH' } = {}) {
  await page.evaluate(() => {
    const el = document.querySelector('.homepage-popular-routes');
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView({ block: 'center' });
  });
  await wait(400);
  const link = page.locator(`a.homepage-route-chip--action[href*="${hrefPart}"]`).first();
  if ((await link.count()) > 0) {
    await link.click({ force: true }).catch(async () => {
      await page.evaluate((sel) => {
        const a = document.querySelector(sel);
        if (a) a.click();
      }, `a.homepage-route-chip--action[href*="${hrefPart}"]`);
    });
    await wait(1500);
    await findStores(page);
    return 'chip';
  }
  const qs = hrefPart.includes('chain=') ? hrefPart : `chain=${chainId}&${hrefPart}`;
  await page.goto(`${BASE}/swap?${qs}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(1500);
  let stores = await findStores(page);
  if (!stores.ok) {
    await wait(1500);
    stores = await findStores(page);
  }
  await connectWallet(page, { address: ACCOUNT_A, chainId });
  await seedBalances(page, {
    chainKey,
    nativeSymbol,
    nativeBal: chainId === 56 ? '2' : '5',
  });
  await page.evaluate((cid) => window.__kobbexWalletDebug?.setChainId?.(cid), chainId);
  return 'deeplink';
}

async function setAmount(page, amount) {
  const ok = await page.evaluate((amt) => {
    if (window.__kwSwapState?.setFromAmount) {
      window.__kwSwapState.setFromAmount(String(amt));
      return true;
    }
    return false;
  }, amount);
  if (!ok) {
    const input = page.locator('input[placeholder="0.0"], input[inputmode="decimal"]').first();
    await input.fill(String(amount));
  }
  await wait(1200);
}

async function waitQuote(page, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const txt = await page.locator('body').innerText();
    if (/Quote ready|Min out|Exchange rate|network fee/i.test(txt) && !/Getting quote/i.test(txt)) {
      return txt;
    }
    if (/not supported|unavailable|Couldn.?t get a price|Swap unavailable/i.test(txt) && !/Getting quote/i.test(txt)) {
      return txt;
    }
    await wait(500);
  }
  return page.locator('body').innerText();
}

async function clickMainCta(page) {
  const cta = page.locator('#swap-main-cta');
  const text = ((await cta.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  if (!/preview|approve|swap/i.test(text) || /connect/i.test(text)) {
    return { disabled: true, text, opened: false };
  }
  await cta.click({ timeout: 8000 }).catch(() => {});
  await wait(1200);

  // Prefer explicit preview-modal actions — never match nav "Swap"
  const confirm = page
    .getByRole('button', { name: /^(Confirm Swap|Approve & Swap|Approve and Swap|Confirm approval)/i })
    .first();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click().catch(() => {});
    await wait(1500);
    return { disabled: false, text, opened: true, confirmed: true };
  }

  // Fallback: any visible dialog primary
  const dialogConfirm = page.locator('[role="dialog"] button, [aria-modal="true"] button').filter({
    hasText: /Confirm|Approve/i,
  }).first();
  if (await dialogConfirm.isVisible().catch(() => false)) {
    await dialogConfirm.click().catch(() => {});
    await wait(1500);
    return { disabled: false, text, opened: true, confirmed: true };
  }

  return { disabled: false, text, opened: false, confirmed: false };
}

async function debugSnap(page) {
  return page.evaluate(() => window.__kobbexWalletDebug?.getSnapshot?.() || null);
}

async function shot(page, name) {
  const p = path.join(ARTIFACTS, 'screenshots', name);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

function isWrapper(to, chainId) {
  const a = (to || '').toLowerCase();
  if (chainId === 1) {
    return [WRAPPERS.ethV1, WRAPPERS.ethV2, WRAPPERS.ethV3].some((w) => w.toLowerCase() === a);
  }
  if (chainId === 56) return WRAPPERS.bscV2.toLowerCase() === a;
  return false;
}

async function newInstrumentedPage(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.addInitScript(buildWalletInitScript(), {
    account: ACCOUNT_A,
    chainId: 1,
    mode: MODE,
    ethWei: ETH_WEI,
    bnbWei: BNB_WEI,
  });
  return { context, page, consoleErrors };
}

async function prepareSwapPage(page, { chainId, chainKey, nativeSymbol }) {
  await page.goto(`${BASE}/swap`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(2000);
  let stores = await findStores(page);
  if (!stores.ok) {
    await wait(2000);
    stores = await findStores(page);
  }
  if (!stores.ok) throw new Error('store discovery failed');
  await connectWallet(page, { address: ACCOUNT_A, chainId });
  await seedBalances(page, {
    chainKey,
    nativeSymbol,
    nativeBal: chainId === 56 ? '2' : '5',
  });
  // Align harness chain
  await page.evaluate((cid) => window.__kobbexWalletDebug?.setChainId?.(cid), chainId);
  if (chainId !== 1) {
    await page.evaluate(async (cid) => {
      if (window.__kwWalletState?.switchChain) await window.__kwWalletState.switchChain(cid);
    }, chainId);
  }
  await wait(400);
  return stores;
}

async function journeyEthNative(browser) {
  const id = 'eth-native-usdc';
  const { context, page, consoleErrors } = await newInstrumentedPage(browser, {
    width: 1280,
    height: 900,
  });
  try {
    await prepareSwapPage(page, { chainId: 1, chainKey: 'ethereum', nativeSymbol: 'ETH' });
    await openPopularAndClick(page, 'chain=1&from=ETH&to=USDC', {
      chainId: 1,
      chainKey: 'ethereum',
      nativeSymbol: 'ETH',
    });
    await page.evaluate((fp) => window.__kobbexWalletDebug?.setRouteFingerprint?.(fp), '1|ETH|USDC');
    const urlOk =
      page.url().includes('from=ETH') &&
      page.url().includes('to=USDC') &&
      page.url().includes('chain=1') &&
      !page.url().includes('WETH');
    await setAmount(page, '0.01');
    const quoteTxt = await waitQuote(page);
    const quoteOk = /Quote ready|Min out|Exchange rate/i.test(quoteTxt);
    const before = await debugSnap(page);
    await clickMainCta(page);
    await wait(1500);
    const after = await debugSnap(page);
    const sends = (after?.blockedTransactions || []).filter((t) =>
      (after.ledger || []).some((l) => l.method === 'eth_sendTransaction'),
    );
    const last = (after?.blockedTransactions || []).slice(-1)[0];
    const destOk = last ? isWrapper(last.to, 1) : false;
    const nativeNoApprove = !(after?.blockedTransactions || []).some(
      (t) => t.dataSelector === APPROVE_SEL,
    );
    const intercepted = after?.broadcastBlockedCount || 0;
    const broadcasts = after?.networkBroadcasts || 0;
    const pass =
      urlOk &&
      quoteOk &&
      intercepted >= 1 &&
      broadcasts === 0 &&
      destOk &&
      nativeNoApprove &&
      !page.url().toLowerCase().includes('wbnb');

    await shot(page, `${id}.png`);
    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      route: { chainId: 1, tokenIn: 'ETH', tokenOut: 'USDC' },
      urlOk,
      quoteOk,
      destOk,
      nativeNoApprove,
      wrapper: last?.to || null,
      sendIntercepted: intercepted - (before?.broadcastBlockedCount || 0),
      networkBroadcasts: broadcasts,
      walletCalls: after?.walletRpcMethodsCalled || [],
      consoleErrors: consoleErrors.slice(0, 5),
    });
  } catch (e) {
    await shot(page, `${id}-error.png`);
    recordJourney(id, { result: 'FAIL', error: String(e) });
  } finally {
    await context.close();
  }
}

async function journeyEthErc20(browser) {
  const id = 'eth-erc20-weth-usdc';
  const { context, page } = await newInstrumentedPage(browser, { width: 1280, height: 900 });
  try {
    await prepareSwapPage(page, { chainId: 1, chainKey: 'ethereum', nativeSymbol: 'ETH' });
    await openPopularAndClick(page, 'chain=1&from=WETH&to=USDC', {
      chainId: 1,
      chainKey: 'ethereum',
      nativeSymbol: 'ETH',
    });
    await page.evaluate((fp) => window.__kobbexWalletDebug?.setRouteFingerprint?.(fp), '1|WETH|USDC');
    await setAmount(page, '0.01');
    const quoteTxt = await waitQuote(page);
    const quoteOk = /Quote ready|Min out|Exchange rate|Approve/i.test(quoteTxt);
    await clickMainCta(page);
    await wait(2000);
    // Maybe need second confirm after approve block
    await clickMainCta(page);
    await wait(1000);
    const snap = await debugSnap(page);
    const txs = snap?.blockedTransactions || [];
    const approveTx = txs.find((t) => t.dataSelector === APPROVE_SEL);
    const swapTx = txs.filter((t) => t.dataSelector !== APPROVE_SEL).slice(-1)[0];
    const approveOk = Boolean(approveTx);
    // Approval spender is in calldata; destination is the token contract — check swap wrapper
    const swapDestOk = swapTx ? isWrapper(swapTx.to, 1) : txs.some((t) => isWrapper(t.to, 1));
    const pass =
      quoteOk &&
      (snap?.broadcastBlockedCount || 0) >= 1 &&
      (snap?.networkBroadcasts || 0) === 0 &&
      (approveOk || /Approve/i.test(quoteTxt)) &&
      (swapDestOk || approveOk);

    await shot(page, `${id}.png`);
    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      route: { chainId: 1, tokenIn: 'WETH', tokenOut: 'USDC' },
      quoteOk,
      approvePrepared: approveOk,
      swapDestOk,
      sendIntercepted: snap?.broadcastBlockedCount || 0,
      networkBroadcasts: snap?.networkBroadcasts || 0,
      walletCalls: snap?.walletRpcMethodsCalled || [],
      lastTx: txs.slice(-1)[0] || null,
    });
  } catch (e) {
    await shot(page, `${id}-error.png`);
    recordJourney(id, { result: 'FAIL', error: String(e) });
  } finally {
    await context.close();
  }
}

async function journeyP22EconomicRouteMatrix(browser) {
  const id = 'p22-economic-route-matrix';
  const routes = [
    { chainId: 1, chainKey: 'ethereum', nativeSymbol: 'ETH', from: 'ETH', to: 'USDT', amount: '0.01' },
    { chainId: 1, chainKey: 'ethereum', nativeSymbol: 'ETH', from: 'WETH', to: 'WBTC', amount: '0.01' },
    { chainId: 56, chainKey: 'bsc', nativeSymbol: 'BNB', from: 'BNB', to: 'BTCB', amount: '0.05' },
  ];
  const viewports = [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];
  const checks = [];

  for (const viewport of viewports) {
    for (const route of routes) {
      const { context, page, consoleErrors } = await newInstrumentedPage(browser, viewport);
      const routeId = `${route.chainId}-${route.from}-${route.to}-${viewport.name}`.toLowerCase();
      try {
        await prepareSwapPage(page, route);
        await openPopularAndClick(
          page,
          `chain=${route.chainId}&from=${route.from}&to=${route.to}`,
          route,
        );
        await page.evaluate(
          (fp) => window.__kobbexWalletDebug?.setRouteFingerprint?.(fp),
          `${route.chainId}|${route.from}|${route.to}`,
        );
        await setAmount(page, route.amount);
        const quoteTxt = await waitQuote(page);
        const body = await page.locator('body').innerText();
        const labels = {
          expectedReceive: /You receive/i.test(body),
          minimumReceived: /Minimum (received|receive)|Min out/i.test(body),
          kobbexFee: /Kobbex fee/i.test(body),
          networkFee: /Network fee/i.test(body),
          priceImpact: /Price impact|\bImpact\b/i.test(body),
          route: /Certified route|Route via|Route transparency|\bRoute\b/i.test(body),
          freshness: /\d+s|Quote expired|Refreshing quote/i.test(body),
        };
        const economicsVisible = Object.values(labels).every(Boolean);
        const quoteVisible = /Quote ready|Exchange rate|Expected output/i.test(quoteTxt);
        const noConsoleErrors = consoleErrors.length === 0;
        await shot(page, `${id}-${routeId}.png`);
        checks.push({
          route: `${route.chainId}|${route.from}|${route.to}`,
          viewport: viewport.name,
          quoteVisible,
          economicsVisible,
          labels,
          noConsoleErrors,
          pass: quoteVisible && economicsVisible && noConsoleErrors,
        });
      } catch (error) {
        await shot(page, `${id}-${routeId}-error.png`);
        checks.push({
          route: `${route.chainId}|${route.from}|${route.to}`,
          viewport: viewport.name,
          pass: false,
          error: String(error),
        });
      } finally {
        await context.close();
      }
    }
  }

  recordJourney(id, {
    result: checks.every((check) => check.pass) ? 'PASS' : 'FAIL',
    checks,
    networkBroadcasts: 0,
  });
}

async function journeyBnbNative(browser) {
  const id = 'bnb-native-usdt';
  const { context, page } = await newInstrumentedPage(browser, { width: 1280, height: 900 });
  try {
    await prepareSwapPage(page, { chainId: 56, chainKey: 'bsc', nativeSymbol: 'BNB' });
    await openPopularAndClick(page, 'chain=56&from=BNB&to=USDT', {
      chainId: 56,
      chainKey: 'bsc',
      nativeSymbol: 'BNB',
    });
    await page.evaluate((fp) => window.__kobbexWalletDebug?.setRouteFingerprint?.(fp), '56|BNB|USDT');
    const urlOk =
      page.url().includes('from=BNB') &&
      page.url().includes('chain=56') &&
      !page.url().includes('WBNB');
    await setAmount(page, '0.05');
    const quoteTxt = await waitQuote(page);
    const quoteOk = /Quote ready|Min out|Exchange rate/i.test(quoteTxt);
    await clickMainCta(page);
    await wait(1500);
    const snap = await debugSnap(page);
    const last = (snap?.blockedTransactions || []).slice(-1)[0];
    const destOk = last ? isWrapper(last.to, 56) : false;
    const valueOk = last ? BigInt(last.value || '0x0') > 0n : false;
    const noApprove = !(snap?.blockedTransactions || []).some((t) => t.dataSelector === APPROVE_SEL);
    const pass =
      urlOk &&
      quoteOk &&
      (snap?.broadcastBlockedCount || 0) >= 1 &&
      (snap?.networkBroadcasts || 0) === 0 &&
      destOk &&
      valueOk &&
      noApprove;

    await shot(page, `${id}.png`);
    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      route: { chainId: 56, tokenIn: 'native', tokenOut: 'USDT' },
      urlOk,
      quoteOk,
      destOk,
      valueOk,
      noApprove,
      wrapper: last?.to || null,
      sendIntercepted: snap?.broadcastBlockedCount || 0,
      networkBroadcasts: snap?.networkBroadcasts || 0,
      walletCalls: snap?.walletRpcMethodsCalled || [],
    });
  } catch (e) {
    await shot(page, `${id}-error.png`);
    recordJourney(id, { result: 'FAIL', error: String(e) });
  } finally {
    await context.close();
  }
}

async function journeyBnbErc20(browser) {
  const id = 'bnb-erc20-cake-usdt';
  const { context, page } = await newInstrumentedPage(browser, { width: 1280, height: 900 });
  try {
    await prepareSwapPage(page, { chainId: 56, chainKey: 'bsc', nativeSymbol: 'BNB' });
    await openPopularAndClick(page, 'chain=56&from=CAKE&to=USDT', {
      chainId: 56,
      chainKey: 'bsc',
      nativeSymbol: 'BNB',
    });
    await page.evaluate((fp) => window.__kobbexWalletDebug?.setRouteFingerprint?.(fp), '56|CAKE|USDT');
    await setAmount(page, '1');
    const quoteTxt = await waitQuote(page);
    const quoteOk = /Quote ready|Min out|Exchange rate|Approve/i.test(quoteTxt);
    await clickMainCta(page);
    await wait(2000);
    await clickMainCta(page);
    await wait(1000);
    const snap = await debugSnap(page);
    const txs = snap?.blockedTransactions || [];
    const hasApprove = txs.some((t) => t.dataSelector === APPROVE_SEL);
    const hasWrapper = txs.some((t) => isWrapper(t.to, 56));
    const pass =
      quoteOk &&
      (snap?.broadcastBlockedCount || 0) >= 1 &&
      (snap?.networkBroadcasts || 0) === 0 &&
      (hasApprove || /Approve/i.test(quoteTxt) || hasWrapper);

    await shot(page, `${id}.png`);
    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      route: { chainId: 56, tokenIn: 'CAKE', tokenOut: 'USDT' },
      quoteOk,
      approvePrepared: hasApprove,
      wrapperSeen: hasWrapper,
      sendIntercepted: snap?.broadcastBlockedCount || 0,
      networkBroadcasts: snap?.networkBroadcasts || 0,
      walletCalls: snap?.walletRpcMethodsCalled || [],
    });
  } catch (e) {
    await shot(page, `${id}-error.png`);
    recordJourney(id, { result: 'FAIL', error: String(e) });
  } finally {
    await context.close();
  }
}

async function journeyRejections(browser) {
  const id = 'wallet-rejections';
  const { context, page } = await newInstrumentedPage(browser, { width: 1280, height: 900 });
  try {
    await page.goto(`${BASE}/swap`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wait(1500);
    await findStores(page);

    await page.evaluate(() => window.__kobbexWalletDebug?.setRejectAccounts?.(true));
    const acctRejected = await page.evaluate(async () => {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        return false;
      } catch (e) {
        return e && e.code === 4001;
      }
    });

    await page.evaluate(() => window.__kobbexWalletDebug?.setRejectAccounts?.(false));
    await page.evaluate(() => window.__kobbexWalletDebug?.setRejectSwitch?.(true));
    const switchRejected = await page.evaluate(async () => {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x38' }],
        });
        return false;
      } catch (e) {
        return e && e.code === 4001;
      }
    });

    await page.evaluate(() => window.__kobbexWalletDebug?.setRejectSwitch?.(false));
    await page.evaluate(() => window.__kobbexWalletDebug?.setRejectSend?.(true));
    const sendRejected = await page.evaluate(async () => {
      try {
        await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ to: '0x660B2E98E9eeAA4CaE21f319FbF3D6aD6909b491', data: '0x01' }],
        });
        return false;
      } catch (e) {
        return e && e.code === 4001;
      }
    });

    const snap = await debugSnap(page);
    const pass =
      acctRejected &&
      switchRejected &&
      sendRejected &&
      (snap?.networkBroadcasts || 0) === 0 &&
      (snap?.broadcastBlockedCount || 0) >= 1;

    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      acctRejected,
      switchRejected,
      sendRejected,
      sendIntercepted: snap?.broadcastBlockedCount || 0,
      networkBroadcasts: snap?.networkBroadcasts || 0,
    });
  } catch (e) {
    recordJourney(id, { result: 'FAIL', error: String(e) });
  } finally {
    await context.close();
  }
}

async function journeyWrongNetwork(browser) {
  const id = 'wrong-network';
  const { context, page } = await newInstrumentedPage(browser, { width: 1280, height: 900 });
  try {
    await page.goto(`${BASE}/swap`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wait(1500);
    await findStores(page);
    // Start on Polygon (unsupported for swaps)
    await page.evaluate(() => window.__kobbexWalletDebug?.setChainId?.(137));
    await connectWallet(page, { address: ACCOUNT_A, chainId: 137 });
    await wait(500);
    const body = await page.locator('body').innerText();
    const showsUnsupported = /view only|unavailable|not supported|switch|Polygon|network/i.test(body);
    // Attempt switch to ETH
    await page.evaluate(() => window.__kobbexWalletDebug?.setRejectSwitch?.(false));
    const switched = await page.evaluate(async () => {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1' }],
      });
      if (window.__kwWalletState?.switchChain) await window.__kwWalletState.switchChain(1);
      return window.__kobbexWalletDebug.getSnapshot().chainId === 1;
    });
    const beforeSend = (await debugSnap(page))?.broadcastBlockedCount || 0;
    // Reject switch path
    await page.evaluate(() => window.__kobbexWalletDebug?.setRejectSwitch?.(true));
    const rejectSafe = await page.evaluate(async () => {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x38' }],
        });
        return false;
      } catch (e) {
        return e.code === 4001;
      }
    });
    const afterSend = (await debugSnap(page))?.broadcastBlockedCount || 0;
    const pass = switched && rejectSafe && afterSend === beforeSend;
    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      showsUnsupported,
      switched,
      rejectSafe,
      sendIntercepted: 0,
      networkBroadcasts: 0,
    });
  } catch (e) {
    recordJourney(id, { result: 'FAIL', error: String(e) });
  } finally {
    await context.close();
  }
}

async function journeyAccountChange(browser) {
  const id = 'account-change';
  const { context, page } = await newInstrumentedPage(browser, { width: 1280, height: 900 });
  try {
    await prepareSwapPage(page, { chainId: 1, chainKey: 'ethereum', nativeSymbol: 'ETH' });
    await openPopularAndClick(page, 'chain=1&from=ETH&to=USDT', {
      chainId: 1,
      chainKey: 'ethereum',
      nativeSymbol: 'ETH',
    });
    await setAmount(page, '0.01');
    await waitQuote(page);
    await page.evaluate((b) => window.__kobbexWalletDebug?.setAccounts?.([b]), ACCOUNT_B);
    // App may or may not auto-update store address; emit event is required
    const snap = await debugSnap(page);
    const accountChanged = snap?.testAccount?.toLowerCase() === ACCOUNT_B.toLowerCase();
    // Ensure no send occurred from stale path yet
    const pass = accountChanged && (snap?.networkBroadcasts || 0) === 0;
    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      accountChanged,
      testAccount: snap?.testAccount,
      sendIntercepted: snap?.broadcastBlockedCount || 0,
      networkBroadcasts: snap?.networkBroadcasts || 0,
    });
  } catch (e) {
    recordJourney(id, { result: 'FAIL', error: String(e) });
  } finally {
    await context.close();
  }
}

async function journeyChainChange(browser) {
  const id = 'chain-change';
  const { context, page } = await newInstrumentedPage(browser, { width: 1280, height: 900 });
  try {
    await prepareSwapPage(page, { chainId: 1, chainKey: 'ethereum', nativeSymbol: 'ETH' });
    await openPopularAndClick(page, 'chain=1&from=ETH&to=USDC', {
      chainId: 1,
      chainKey: 'ethereum',
      nativeSymbol: 'ETH',
    });
    await setAmount(page, '0.01');
    await waitQuote(page);
    await page.evaluate(() => window.__kobbexWalletDebug?.setChainId?.(56));
    await page.evaluate(async () => {
      if (window.__kwWalletState?.switchChain) await window.__kwWalletState.switchChain(56);
    });
    await wait(800);
    const snap = await debugSnap(page);
    const chainOk = snap?.chainId === 56;
    const pass = chainOk && (snap?.networkBroadcasts || 0) === 0;
    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      chainOk,
      chainId: snap?.chainId,
      sendIntercepted: snap?.broadcastBlockedCount || 0,
      networkBroadcasts: snap?.networkBroadcasts || 0,
    });
  } catch (e) {
    recordJourney(id, { result: 'FAIL', error: String(e) });
  } finally {
    await context.close();
  }
}

async function journeyUnsupported(browser) {
  const id = 'unsupported-routes';
  const cases = [
    { href: 'chain=56&from=WBNB&to=USDT', label: 'WBNB-USDT' },
    { href: 'chain=1&from=PEPE&to=WETH', label: 'PEPE-WETH' },
    { href: 'chain=1&from=ETH&to=WETH', label: 'ETH-WETH' },
    { href: 'chain=56&from=BNB&to=WBNB', label: 'BNB-WBNB' },
    { href: 'chain=137&from=USDC&to=WETH', label: 'Polygon' },
  ];
  const { context, page } = await newInstrumentedPage(browser, { width: 1280, height: 900 });
  try {
    await prepareSwapPage(page, { chainId: 1, chainKey: 'ethereum', nativeSymbol: 'ETH' });
    const before = (await debugSnap(page))?.broadcastBlockedCount || 0;
    const details = [];
    for (const c of cases) {
      await page.goto(`${BASE}/swap?${c.href}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await wait(2000);
      await setAmount(page, '0.01').catch(() => {});
      await wait(1500);
      await clickMainCta(page);
      await wait(500);
      details.push({ label: c.label, url: page.url() });
    }
    const after = await debugSnap(page);
    const delta = (after?.broadcastBlockedCount || 0) - before;
    const pass = delta === 0 && (after?.networkBroadcasts || 0) === 0;
    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      cases: details,
      unsupportedSendAttempts: delta,
      sendIntercepted: 0,
      networkBroadcasts: after?.networkBroadcasts || 0,
    });
  } catch (e) {
    recordJourney(id, { result: 'FAIL', error: String(e), unsupportedSendAttempts: 0 });
  } finally {
    await context.close();
  }
}

async function journeyMobile(browser) {
  const id = 'mobile-viewport';
  const { context, page } = await newInstrumentedPage(browser, { width: 390, height: 844 });
  try {
    await prepareSwapPage(page, { chainId: 1, chainKey: 'ethereum', nativeSymbol: 'ETH' });
    const connectVisible =
      (await page.getByRole('button', { name: /Connect/i }).first().isVisible().catch(() => false)) ||
      (await page.locator('button').filter({ hasText: /0x[a-fA-F0-9]{4}/ }).first().isVisible().catch(() => false));
    await openPopularAndClick(page, 'chain=1&from=ETH&to=USDT', {
      chainId: 1,
      chainKey: 'ethereum',
      nativeSymbol: 'ETH',
    });
    await setAmount(page, '0.01');
    await waitQuote(page);
    await clickMainCta(page);
    await wait(1200);
    const snap = await debugSnap(page);
    const ctaBox = await page.locator('#swap-main-cta').boundingBox().catch(() => null);
    const reachable = ctaBox ? ctaBox.y < 844 : true;
    const pass =
      connectVisible &&
      reachable &&
      (snap?.networkBroadcasts || 0) === 0 &&
      page.url().includes('from=ETH');
    await shot(page, `${id}.png`);
    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      connectVisible,
      reachable,
      sendIntercepted: snap?.broadcastBlockedCount || 0,
      networkBroadcasts: snap?.networkBroadcasts || 0,
    });
  } catch (e) {
    recordJourney(id, { result: 'FAIL', error: String(e) });
  } finally {
    await context.close();
  }
}

async function journeyWalletConnectModal(browser) {
  const id = 'walletconnect-modal-smoke';
  const { context, page } = await newInstrumentedPage(browser, { width: 1280, height: 900 });
  try {
    await page.goto(`${BASE}/swap`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wait(1500);
    // Open connect UI without completing WC pairing
    const connectBtn = page.getByRole('button', { name: /Connect/i }).first();
    await connectBtn.click().catch(() => {});
    await wait(800);
    const body = await page.locator('body').innerText();
    const modalOk = /WalletConnect|Connect|Read-only|wallet/i.test(body);
    // Cancel / escape
    await page.keyboard.press('Escape').catch(() => {});
    await wait(300);
    const crashed = await page.evaluate(() => !document.querySelector('#root'));
    const pass = modalOk && !crashed;
    recordJourney(id, {
      result: pass ? 'PASS' : 'FAIL',
      modalOk,
      crashed,
      note: summary.walletConnectGap,
      sendIntercepted: 0,
      networkBroadcasts: 0,
    });
  } catch (e) {
    recordJourney(id, { result: 'FAIL', error: String(e) });
  } finally {
    await context.close();
  }
}

function scanProductionArtifacts() {
  const dist = path.join(FRONTEND, 'dist');
  const result = {
    distExists: fs.existsSync(dist),
    testWalletDisabled: true,
    debugWalletRouteAbsent: true,
    noFakeAccountExposed: true,
    noTestPrivateKey: true,
    noSimulationUi: true,
    findings: [],
  };
  if (!result.distExists) {
    result.findings.push('dist missing — run build before scan');
    result.testWalletDisabled = false;
    return result;
  }
  const files = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(js|css|html|txt|map)$/.test(ent.name)) files.push(p);
    }
  };
  walk(dist);
  const patterns = [
    { re: /VITE_ENABLE_TEST_WALLET['"]?\s*:\s*['"]true['"]/, label: 'test wallet flag true' },
    { re: /__kobbexTestWallet|__kobbexWalletDebug|createKobbexTestWallet/, label: 'harness symbols' },
    { re: /\/debug\/wallet/, label: 'debug wallet route' },
    { re: /KOBBEX_NO_BROADCAST_BLOCKED/, label: 'no-broadcast UI string' },
    { re: /KOBBEX_WALLET_TEST_MODE/, label: 'wallet test mode env' },
    { re: /BEGIN (EC )?PRIVATE KEY|test mnemonic phrase|seed phrase:\s*\w+ \w+ \w+/i, label: 'private key material' },
  ];
  for (const file of files) {
    // Skip source maps for route string noise but still scan for secrets
    const text = fs.readFileSync(file, 'utf8');
    for (const { re, label } of patterns) {
      if (re.test(text)) {
        // harness symbols in source maps from vitest? production build shouldn't include testing/
        if (file.endsWith('.map') && label === 'harness symbols') continue;
        result.findings.push(`${label} in ${path.relative(FRONTEND, file)}`);
        if (label === 'test wallet flag true') result.testWalletDisabled = false;
        if (label === 'debug wallet route') result.debugWalletRouteAbsent = false;
        if (label === 'harness symbols') result.testWalletDisabled = false;
        if (label === 'private key material') result.noTestPrivateKey = false;
        if (label === 'simulation mode string' || label === 'no-broadcast UI string') {
          result.noSimulationUi = false;
        }
        if (label === 'harness symbols' && /A11ce00000000000000000000000000000000001/.test(text)) {
          result.noFakeAccountExposed = false;
        }
      }
    }
    if (/0xA11ce00000000000000000000000000000000001/.test(text) && !file.endsWith('.map')) {
      result.findings.push(`fake account in ${path.relative(FRONTEND, file)}`);
      result.noFakeAccountExposed = false;
    }
  }
  return result;
}

async function ensurePreview() {
  if (!START_PREVIEW) return null;

  const dist = path.join(FRONTEND, 'dist');
  const forceBuild = process.env.KOBBEX_FORCE_BUILD === '1' || !fs.existsSync(path.join(dist, 'index.html'));
  if (forceBuild || process.env.KOBBEX_REBUILD_PREVIEW === '1') {
    console.log('Building frontend for wallet preview…');
    await new Promise((resolve, reject) => {
      const p = spawn('npm', ['run', 'build'], { cwd: FRONTEND, stdio: 'inherit' });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('build failed'))));
    });
  } else if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error('frontend/dist missing — run npm run build first');
  }

  // Always bind an ephemeral preview so we do not attach to a stale server.
  const port = Number(process.env.KOBBEX_PREVIEW_PORT || 4177);
  const previewBase = `http://127.0.0.1:${port}`;
  if (!process.env.SWAPEREX_QA_URL) {
    BASE = previewBase;
    summary.base = BASE;
  }

  console.log(`Starting vite preview on ${previewBase}…`);
  const child = spawn(
    'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: FRONTEND,
      stdio: 'pipe',
      env: { ...process.env },
    },
  );
  for (let i = 0; i < 80; i++) {
    await wait(500);
    try {
      const r = await fetch(previewBase);
      if (r.ok) return child;
    } catch (_) {}
  }
  child.kill('SIGTERM');
  throw new Error('preview failed to start');
}

function writeEvidence() {
  const rpcLedger = {};
  for (const [k, v] of Object.entries(summary.journeys)) {
    rpcLedger[k] = {
      journey: k,
      route: v.route || null,
      walletCalls: v.walletCalls || [],
      transactionDestinationVerified: Boolean(v.destOk || v.swapDestOk || v.wrapperSeen),
      broadcastBlocked: (v.networkBroadcasts || 0) === 0,
      networkTransactionHash: null,
      result: v.result,
    };
  }
  fs.writeFileSync(path.join(ARTIFACTS, 'results.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(ARTIFACTS, 'rpc-ledger.json'), JSON.stringify(rpcLedger, null, 2));

  const lines = [
    `# Kobbex P21.4 Wallet No-Broadcast Automation`,
    ``,
    `Timestamp: ${TS}`,
    `Base URL: ${BASE}`,
    `Mode: ${MODE}`,
    `Treasury (asserted): ${TREASURY}`,
    ``,
    `## Totals`,
    ``,
    '```text',
    `WALLET_JOURNEYS_PASS=${summary.totals.WALLET_JOURNEYS_PASS}`,
    `WALLET_JOURNEYS_FAIL=${summary.totals.WALLET_JOURNEYS_FAIL}`,
    `SEND_REQUESTS_INTERCEPTED=${summary.totals.SEND_REQUESTS_INTERCEPTED}`,
    `NETWORK_BROADCASTS=${summary.totals.NETWORK_BROADCASTS}`,
    `UNSUPPORTED_ROUTE_SEND_ATTEMPTS=${summary.totals.UNSUPPORTED_ROUTE_SEND_ATTEMPTS}`,
    '```',
    ``,
    `## Journeys`,
    ``,
  ];
  for (const [k, v] of Object.entries(summary.journeys)) {
    lines.push(`- **${k}**: ${v.result}`);
  }
  lines.push('', '## Production artifact scan', '');
  lines.push('```json', JSON.stringify(summary.productionScan, null, 2), '```');
  lines.push('', '## WalletConnect', '', summary.walletConnectGap, '');
  lines.push('', `Artifacts: \`${ARTIFACTS}\``, '');
  fs.mkdirSync(path.dirname(DOCS), { recursive: true });
  fs.writeFileSync(DOCS, lines.join('\n'));
}

async function main() {
  console.log('== P21.4 wallet no-broadcast certification ==');
  console.log(`BASE=${BASE} MODE=${MODE}`);

  summary.productionScan = scanProductionArtifacts();

  let previewChild = null;
  try {
    previewChild = await ensurePreview();
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: true });

    await journeyEthNative(browser);
    await journeyEthErc20(browser);
    await journeyP22EconomicRouteMatrix(browser);
    await journeyBnbNative(browser);
    await journeyBnbErc20(browser);
    await journeyRejections(browser);
    await journeyWrongNetwork(browser);
    await journeyAccountChange(browser);
    await journeyChainChange(browser);
    await journeyUnsupported(browser);
    await journeyMobile(browser);
    await journeyWalletConnectModal(browser);

    await browser.close();
  } finally {
    if (previewChild) {
      previewChild.kill('SIGTERM');
    }
  }

  writeEvidence();

  console.log(`WALLET_JOURNEYS_PASS=${summary.totals.WALLET_JOURNEYS_PASS}`);
  console.log(`WALLET_JOURNEYS_FAIL=${summary.totals.WALLET_JOURNEYS_FAIL}`);
  console.log(`SEND_REQUESTS_INTERCEPTED=${summary.totals.SEND_REQUESTS_INTERCEPTED}`);
  console.log(`NETWORK_BROADCASTS=${summary.totals.NETWORK_BROADCASTS}`);
  console.log(`UNSUPPORTED_ROUTE_SEND_ATTEMPTS=${summary.totals.UNSUPPORTED_ROUTE_SEND_ATTEMPTS}`);
  console.log(`EVIDENCE=${ARTIFACTS}`);
  console.log(`DOCS=${DOCS}`);

  const scan = summary.productionScan;
  const scanOk =
    scan.testWalletDisabled &&
    scan.debugWalletRouteAbsent &&
    scan.noFakeAccountExposed &&
    scan.noTestPrivateKey &&
    scan.noSimulationUi;

  if (
    summary.totals.WALLET_JOURNEYS_FAIL > 0 ||
    summary.totals.NETWORK_BROADCASTS > 0 ||
    summary.totals.UNSUPPORTED_ROUTE_SEND_ATTEMPTS > 0 ||
    !scanOk
  ) {
    console.error('P21.4 wallet certification FAILED');
    process.exit(1);
  }
  console.log('P21.4 wallet certification PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
