#!/usr/bin/env node
/**
 * P16.6 / P16.8 — Mobile WalletConnect connectivity certification.
 * Connectivity only — no swaps, approvals, or broadcasts.
 *
 * Usage:
 *   node scripts/audit/p16-mobile-walletconnect-cert.mjs --base-url http://127.0.0.1:4173
 *   node scripts/audit/p16-mobile-walletconnect-cert.mjs --skip-browser  # dev only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: '768x1024', width: 768, height: 1024 },
];

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.SWAPEREX_QA_URL || 'https://dex.kobbex.com',
    output: path.join(REPO_ROOT, 'reports/p16-mobile-walletconnect-cert.json'),
    skipBrowser: process.env.P16_SKIP_BROWSER === '1',
    requireBrowser: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--base-url') opts.baseUrl = argv[++i];
    else if (argv[i] === '--output') opts.output = argv[++i];
    else if (argv[i] === '--skip-browser') opts.skipBrowser = true;
    else if (argv[i] === '--require-browser') opts.requireBrowser = true;
  }
  return opts;
}

async function ensurePlaywright() {
  const playwrightPath = path.join(REPO_ROOT, 'frontend/node_modules/playwright/index.mjs');
  if (!fs.existsSync(playwrightPath)) {
    throw new Error(`Playwright package missing at ${playwrightPath}`);
  }
  const playwrightHref = pathToFileURL(playwrightPath).href;
  const { chromium } = await import(playwrightHref);
  const browser = await chromium.launch({ headless: true });
  await browser.close();
  return playwrightHref;
}

async function main() {
  const opts = parseArgs(process.argv);
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    mode: 'connectivity_certification',
    noTransactions: true,
    viewports: [],
    walletChecks: {
      walletConnectQrOpens: false,
      walletConnectDeepLinkPresent: false,
      connectWalletCtaVisible: false,
      disconnectUiReachable: false,
      networkSelectorVisible: false,
    },
    humanHandsetRequired: [
      'MetaMask Mobile pairing',
      'Trust Wallet pairing',
      'Chain switch on handset',
      'Session restore after background',
      'Session expiry handling',
    ],
    automatedVerdict: null,
    physicalHandsetVerdict: 'PHYSICAL_HANDSET_DEFERRED',
    verdict: 'P16_MOBILE_WC_CONNECTIVITY_ASSIST_PASS',
    notes: [],
  };

  if (opts.skipBrowser) {
    report.automatedVerdict = 'P16_MOBILE_WC_SKIPPED';
    report.verdict = 'P16_MOBILE_WC_SKIPPED';
    report.notes.push('Browser checks skipped (--skip-browser or P16_SKIP_BROWSER=1).');
    fs.mkdirSync(path.dirname(opts.output), { recursive: true });
    fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(opts.requireBrowser ? 1 : 0);
  }

  let playwrightHref;
  try {
    playwrightHref = await ensurePlaywright();
  } catch (err) {
    report.automatedVerdict = 'P16_MOBILE_WC_BROWSER_DEPENDENCY_FAIL';
    report.verdict = 'P16_MOBILE_WC_CONNECTIVITY_ASSIST_FAIL';
    report.notes.push(String(err));
    report.notes.push('Install browsers: npm --prefix frontend ci && npm --prefix frontend run playwright:install');
    fs.mkdirSync(path.dirname(opts.output), { recursive: true });
    fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const { chromium } = await import(playwrightHref);
  const browser = await chromium.launch({ headless: true });

  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.addInitScript(() => {
        localStorage.setItem(
          'swaperex_terms_accepted_v1',
          JSON.stringify({ version: 1, acceptedAt: Date.now() }),
        );
      });

      const vpResult = { viewport: vp.name, routes: {}, issues: [] };

      for (const route of ['/swap', '/send', '/portfolio']) {
        await page.goto(`${opts.baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 90_000 });
        await page.waitForTimeout(2500);
        const connectVisible = await page
          .getByRole('button', { name: /Connect Wallet|Wallet/i })
          .first()
          .isVisible()
          .catch(() => false);
        vpResult.routes[route] = { connectVisible };
        if (!connectVisible) vpResult.issues.push(`connect_hidden:${route}`);
      }

      await page.goto(`${opts.baseUrl}/swap`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(3000);
      const walletBtn = page.getByRole('button', { name: /Connect Wallet|^Wallet$/i }).first();
      report.walletChecks.connectWalletCtaVisible = await walletBtn
        .isVisible()
        .catch(() => false);

      if (report.walletChecks.connectWalletCtaVisible) {
        await walletBtn.click();
        await page.waitForTimeout(2000);
        const wcBtn = page.locator('button').filter({ hasText: 'WalletConnect' });
        report.walletChecks.walletConnectDeepLinkPresent = (await wcBtn.count()) > 0;
        if ((await wcBtn.count()) > 0) {
          await wcBtn.first().click();
          await page.waitForTimeout(2500);
          report.walletChecks.walletConnectQrOpens = await page
            .locator('canvas, img[alt*="QR"], [data-testid*="qr"], w3m-modal')
            .first()
            .isVisible()
            .catch(() => false);
        }
      }

      report.walletChecks.networkSelectorVisible = await page
        .locator('button')
        .filter({ hasText: /Ethereum|BNB|Polygon|Arbitrum|Avalanche|Wrong Network/i })
        .first()
        .isVisible()
        .catch(() => false);

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      if (overflow) vpResult.issues.push('horizontal_overflow');

      report.viewports.push(vpResult);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const automatedOk =
    report.walletChecks.connectWalletCtaVisible &&
    report.walletChecks.walletConnectDeepLinkPresent &&
    report.walletChecks.walletConnectQrOpens &&
    report.walletChecks.networkSelectorVisible &&
    report.viewports.every((v) => v.issues.length === 0);

  if (automatedOk) {
    report.automatedVerdict = 'AUTOMATED_BROWSER_PASS';
    report.verdict = 'P16_MOBILE_WC_CONNECTIVITY_ASSIST_PASS';
  } else {
    report.automatedVerdict = 'AUTOMATED_BROWSER_FAIL';
    report.verdict = 'P16_MOBILE_WC_CONNECTIVITY_ASSIST_FAIL';
    if (!report.walletChecks.connectWalletCtaVisible) {
      report.notes.push('Connect Wallet CTA not visible on mobile viewport.');
    }
    if (!report.walletChecks.walletConnectQrOpens) {
      report.notes.push('WalletConnect QR/modal did not become visible.');
    }
  }

  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict.includes('FAIL') ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
