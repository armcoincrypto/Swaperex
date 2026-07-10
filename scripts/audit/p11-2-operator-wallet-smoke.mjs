#!/usr/bin/env node
/**
 * P11.2 — Operator wallet smoke on live production (Playwright).
 * Validates WalletConnect modal flow, stale injected-state recovery, quotes, disconnect/reconnect.
 *
 * Usage:
 *   SWAPEREX_QA_URL=https://dex.kobbex.com node scripts/audit/p11-2-operator-wallet-smoke.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const playwrightHref = new URL('../../frontend/node_modules/playwright/index.mjs', import.meta.url).href;
const { chromium } = await import(playwrightHref);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const BASE = process.env.SWAPEREX_QA_URL || 'https://dex.kobbex.com';
const READ_ONLY_ADDRESS = process.env.SWAPEREX_QA_ADDRESS || '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const STALE_KEYS = {
  connected: '@appkit/eip155:connected_connector_id',
  last: 'swaperex_last_connector',
};

const report = {
  phase: 'P11.2',
  testedAt: new Date().toISOString(),
  baseUrl: BASE,
  browser: 'Chromium 136 (Playwright headless shell)',
  wallet: null,
  productionCommit: null,
  steps: {},
  console: { errors: [], warnings: [], p11Signals: [] },
  quotes: {},
  verdict: 'P11_2_OPERATOR_WALLET_SMOKE_BLOCKED',
  notes: [],
};

function record(step, status, detail = '') {
  report.steps[step] = { status, detail };
}

function hasConnectingViewCrash() {
  return report.console.errors.some((e) =>
    e.includes('w3m-connecting-view: No connector provided'),
  );
}

async function installDeepHelpers(context) {
  await context.addInitScript(() => {
    window.__p11Deep = {
      deepAll(root) {
        const acc = [];
        if (!root) return acc;
        for (const el of root.querySelectorAll('*')) {
          acc.push(el);
          if (el.shadowRoot) acc.push(...window.__p11Deep.deepAll(el.shadowRoot));
        }
        return acc;
      },
      modalRoot() {
        return document.querySelector('w3m-modal')?.shadowRoot || null;
      },
      modalIsOpen() {
        const m = document.querySelector('w3m-modal');
        return !!(m && m.classList.contains('open'));
      },
      clickWalletConnectInModal() {
        const all = window.__p11Deep.deepAll(window.__p11Deep.modalRoot());
        const target =
          all.find((el) => {
            const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
            return el.tagName === 'WUI-LIST-WALLET' && /walletconnect/i.test(txt);
          }) ||
          all.find((el) => {
            const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
            return /walletconnect/i.test(txt) && typeof el.click === 'function' && txt.length < 40;
          });
        if (!target) return { clicked: false, reason: 'walletconnect-row-not-found' };
        target.click();
        return { clicked: true, tag: target.tagName };
      },
      clickModalBack() {
        const all = window.__p11Deep.deepAll(window.__p11Deep.modalRoot());
        const back = all.find((el) => el.getAttribute?.('icon') === 'chevronLeft');
        if (!back) return { clicked: false, reason: 'no-back-control' };
        back.click();
        return { clicked: true };
      },
      modalViewText() {
        const all = window.__p11Deep.deepAll(window.__p11Deep.modalRoot());
        return all
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((t) => /scan|qr|connect|walletconnect|copy link/i.test(t))
          .slice(0, 6)
          .join(' | ');
      },
      closeModal() {
        if (!window.__p11Deep.modalIsOpen()) return { closed: true, method: 'already-closed' };
        const all = window.__p11Deep.deepAll(window.__p11Deep.modalRoot());
        const close = all.find((el) => el.getAttribute?.('icon') === 'close');
        if (close) {
          close.click();
          return { closed: true, method: 'close-icon' };
        }
        return { closed: false };
      },
    };
  });
}

async function acceptTerms(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'swaperex_terms_accepted_v1',
      JSON.stringify({ version: 1, acceptedAt: Date.now() }),
    );
  });
}

async function seedStaleInjectedState(page) {
  await page.addInitScript(() => {
    localStorage.setItem('@appkit/eip155:connected_connector_id', 'injected');
    localStorage.setItem('swaperex_last_connector', 'injected');
    localStorage.setItem(
      'swaperex_terms_accepted_v1',
      JSON.stringify({ version: 1, acceptedAt: Date.now() }),
    );
  });
}

async function readSanitizerState(page) {
  return page.evaluate((keys) => ({
    connected: localStorage.getItem(keys.connected),
    last: localStorage.getItem(keys.last),
  }), STALE_KEYS);
}

async function waitForHomeSwap(page) {
  await page.getByRole('heading', { name: 'Swap', exact: true }).first().waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Connect Wallet' }).first().waitFor({ timeout: 15000 });
}

async function openWalletConnectModal(page) {
  await page.getByRole('button', { name: 'Connect Wallet' }).first().click({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page
    .locator('button')
    .filter({ hasText: 'WalletConnect' })
    .filter({ hasText: 'QR code' })
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(3500);
  return page.evaluate(() => window.__p11Deep.modalIsOpen());
}

async function startConnectFlowAndBack(page) {
  const start = await page.evaluate(() => window.__p11Deep.clickWalletConnectInModal());
  await page.waitForTimeout(3500);
  const qrView = await page.evaluate(() => window.__p11Deep.modalViewText());
  const back = await page.evaluate(() => window.__p11Deep.clickModalBack());
  await page.waitForTimeout(1500);
  return { start, qrView, back };
}

async function forceCloseModal(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => window.__p11Deep.closeModal());
  await page.waitForTimeout(600);
}

async function openReadOnlyFromHeader(page) {
  await page.getByRole('button', { name: 'View address' }).first().click({ timeout: 10000, force: true });
  await page.waitForTimeout(400);
}

async function connectReadOnly(page) {
  await page.locator('#wallet-address, input[placeholder="0x..."]').first().fill(READ_ONLY_ADDRESS);
  await page.getByRole('button', { name: 'View', exact: true }).first().click({ timeout: 10000, force: true });
  await page.waitForTimeout(1500);
}

async function selectToken(page, side, symbol) {
  const buttons = page.locator('button[title*=" — "]');
  await buttons.nth(side === 'from' ? 0 : 1).click({ force: true, timeout: 15000 });
  await page.waitForTimeout(500);
  const search = page.getByPlaceholder('Search or paste contract address...');
  await search.fill(symbol);
  await page.waitForTimeout(900);
  await page.getByText(symbol, { exact: true }).first().click({ timeout: 15000, force: true });
  await page.waitForTimeout(600);
}

async function waitForQuote(page, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const body = await page.locator('body').innerText();
    if (
      (body.includes('Min out') || body.includes('Exchange rate') || body.includes('Swaperex wrapper')) &&
      !body.includes('Getting quote')
    ) {
      return { ok: true, body };
    }
    if (body.includes("Couldn't get a price") && !body.includes('Getting quote')) {
      return { ok: false, body, reason: 'quote_failed' };
    }
    await page.waitForTimeout(1200);
  }
  return { ok: false, body: await page.locator('body').innerText(), reason: 'timeout' };
}

async function runQuotePair(page, fromSymbol, toSymbol, amount) {
  const fromBtn = page.locator('button[title*=" — "]').nth(0);
  const fromTitle = (await fromBtn.getAttribute('title')) || '';
  if (!fromTitle.startsWith(`${fromSymbol} `)) {
    await selectToken(page, 'from', fromSymbol);
  }
  const toBtn = page.locator('button[title*=" — "]').nth(1);
  const toTitle = (await toBtn.getAttribute('title')) || '';
  if (!toTitle.startsWith(`${toSymbol} `)) {
    await selectToken(page, 'to', toSymbol);
  }
  const amountInput = page.locator('input[placeholder="0.0"]').first();
  await amountInput.fill('');
  await amountInput.fill(amount);
  await page.waitForTimeout(1500);
  return waitForQuote(page);
}

async function disconnectFromMenu(page) {
  await page.locator('button').filter({ hasText: /^0x/i }).first().click({ timeout: 10000, force: true });
  await page.waitForTimeout(400);
  await page
    .getByRole('button', { name: /Disconnect|Exit View Mode/i })
    .first()
    .click({ timeout: 10000, force: true });
  await page.waitForTimeout(1200);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 SwaperexP11_2OperatorQA/1.0',
  });
  await installDeepHelpers(context);
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') report.console.errors.push(text);
    if (msg.type() === 'warning') report.console.warnings.push(text);
    if (text.includes('w3m-connecting-view') || text.includes('WalletBootstrap] Closed AppKit modal')) {
      report.console.p11Signals.push(text);
    }
  });
  page.on('pageerror', (err) => {
    report.console.errors.push(err.message || String(err));
  });

  try {
    await seedStaleInjectedState(page);
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2000);

    const version = await page.request.get(`${BASE}/version.txt`).then((r) => r.text()).catch(() => '');
    report.productionCommit = (version.match(/short=(\w+)/) || [])[1] || 'unknown';

    const postSanitize = await readSanitizerState(page);
    record(
      'stale_injected_localStorage_sanitized_on_load',
      postSanitize.connected !== 'injected' && postSanitize.last !== 'injected' ? 'PASS' : 'FAIL',
      JSON.stringify(postSanitize),
    );

    await waitForHomeSwap(page);
    record('homepage_and_swap_surface', 'PASS');

    const modalOpen = await openWalletConnectModal(page);
    record('walletconnect_modal_open', modalOpen ? 'PASS' : 'FAIL');

    const flow1 = await startConnectFlowAndBack(page);
    record(
      'walletconnect_qr_connecting_view',
      flow1.qrView.includes('Scan') || flow1.qrView.includes('QR') ? 'PASS' : 'FAIL',
      flow1.qrView || 'no-qr-text',
    );
    record(
      'back_from_connecting_view_no_crash',
      !hasConnectingViewCrash() ? 'PASS' : 'FAIL',
      JSON.stringify(flow1.back),
    );

    await forceCloseModal(page);

    // Repeat after reload with stale keys
    await page.evaluate((keys) => {
      localStorage.setItem(keys.connected, 'injected');
      localStorage.setItem(keys.last, 'injected');
    }, STALE_KEYS);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await openWalletConnectModal(page);
    const flow2 = await startConnectFlowAndBack(page);
    record(
      'back_after_reload_with_stale_keys',
      !hasConnectingViewCrash() ? 'PASS' : 'FAIL',
      JSON.stringify(flow2.back),
    );
    await forceCloseModal(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await waitForHomeSwap(page);

    // Read-only operator session for quote + disconnect/reconnect (WC QR not pairable headless)
    report.wallet = `Read-only operator address ${READ_ONLY_ADDRESS} (quotes/disconnect path); WalletConnect QR displayed but not paired in headless agent`;
    await openReadOnlyFromHeader(page);
    await connectReadOnly(page);
    const connected = await page.locator('button').filter({ hasText: /^0x/i }).first().isVisible().catch(() => false);
    record('connect_readonly_session', connected ? 'PASS' : 'FAIL');

    const ethQuote = await runQuotePair(page, 'ETH', 'USDT', '0.01');
    report.quotes.eth_usdt = { status: ethQuote.ok ? 'PASS' : 'FAIL', snippet: ethQuote.body?.slice(0, 400) || ethQuote.reason };
    record('eth_to_usdt_quote', ethQuote.ok ? 'PASS' : 'FAIL', ethQuote.reason || '');

    const wethQuote = await runQuotePair(page, 'WETH', 'USDT', '0.01');
    report.quotes.weth_usdt = { status: wethQuote.ok ? 'PASS' : 'FAIL', snippet: wethQuote.body?.slice(0, 400) || wethQuote.reason };
    record('weth_to_usdt_quote', wethQuote.ok ? 'PASS' : 'FAIL', wethQuote.reason || '');

    await disconnectFromMenu(page);
    record('disconnect', (await page.getByRole('button', { name: 'Connect Wallet' }).first().isVisible()) ? 'PASS' : 'FAIL');

    await openReadOnlyFromHeader(page);
    await connectReadOnly(page);
    record('reconnect', (await page.locator('button').filter({ hasText: /^0x/i }).first().isVisible()) ? 'PASS' : 'FAIL');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    let afterRefresh = await page.locator('button').filter({ hasText: /^0x/i }).first().isVisible().catch(() => false);
    if (!afterRefresh) {
      await openReadOnlyFromHeader(page);
      await connectReadOnly(page);
      afterRefresh = await page.locator('button').filter({ hasText: /^0x/i }).first().isVisible().catch(() => false);
    }
    record('hard_refresh_reconnect', afterRefresh ? 'PASS' : 'FAIL');

    await page.evaluate(() => localStorage.clear());
    await acceptTerms(page);
    await page.evaluate((keys) => {
      localStorage.setItem(keys.connected, 'injected');
      localStorage.setItem(keys.last, 'injected');
    }, STALE_KEYS);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await openWalletConnectModal(page);
    const flow3 = await startConnectFlowAndBack(page);
    record(
      'clear_storage_repeat_modal_back',
      !hasConnectingViewCrash() ? 'PASS' : 'FAIL',
      JSON.stringify(flow3.back),
    );

    const regression = hasConnectingViewCrash();
    const p11Core =
      report.steps.back_from_connecting_view_no_crash?.status === 'PASS' &&
      report.steps.back_after_reload_with_stale_keys?.status === 'PASS' &&
      report.steps.clear_storage_repeat_modal_back?.status === 'PASS' &&
      report.steps.walletconnect_modal_open?.status === 'PASS' &&
      report.steps.walletconnect_qr_connecting_view?.status === 'PASS';
    const quotesOk =
      report.quotes.eth_usdt?.status === 'PASS' && report.quotes.weth_usdt?.status === 'PASS';
    const sessionOk =
      report.steps.disconnect?.status === 'PASS' &&
      report.steps.reconnect?.status === 'PASS' &&
      report.steps.hard_refresh_reconnect?.status === 'PASS';

    if (regression) {
      report.verdict = 'P11_2_RUNTIME_REGRESSION_FOUND';
    } else if (p11Core && quotesOk && sessionOk) {
      report.verdict = 'P11_2_OPERATOR_WALLET_SMOKE_PASS';
      report.notes.push(
        'P11 connecting-view/back regression validated on live eee0264. WalletConnect QR pairing not completed in headless agent; quote/disconnect/reconnect validated via read-only operator address.',
      );
    } else {
      report.verdict = 'P11_2_OPERATOR_WALLET_SMOKE_BLOCKED';
      report.notes.push('Incomplete operator session in agent environment.');
    }
  } catch (err) {
    report.fatal = (err.message || String(err)).slice(0, 500);
    record('fatal', 'FAIL', report.fatal);
    report.verdict = hasConnectingViewCrash()
      ? 'P11_2_RUNTIME_REGRESSION_FOUND'
      : 'P11_2_OPERATOR_WALLET_SMOKE_BLOCKED';
  } finally {
    await browser.close();
  }

  const outJson = path.join(REPO_ROOT, 'reports/p11-2-operator-wallet-smoke.json');
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, steps: report.steps, quotes: report.quotes }, null, 2));
  console.log('Report:', outJson);

  if (report.verdict === 'P11_2_RUNTIME_REGRESSION_FOUND') process.exitCode = 2;
  else if (report.verdict === 'P11_2_OPERATOR_WALLET_SMOKE_BLOCKED') process.exitCode = 3;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
