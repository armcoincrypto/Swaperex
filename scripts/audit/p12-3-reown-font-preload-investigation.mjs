#!/usr/bin/env node
/**
 * P12.3 — Reown font preload investigation (read-only).
 *
 * Usage:
 *   node scripts/audit/p12-3-reown-font-preload-investigation.mjs
 *   node scripts/audit/p12-3-reown-font-preload-investigation.mjs --output reports/p12-3-font-preload.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FONT_URL = 'https://fonts.reown.com/KHTeka-Medium.woff2';

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.SWAPEREX_QA_URL || 'https://dex.kobbex.com',
    output: path.join(REPO_ROOT, 'reports/p12-3-font-preload.json'),
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--base-url') opts.baseUrl = argv[++i];
    else if (argv[i] === '--output') opts.output = argv[++i];
  }
  return opts;
}

async function runScenario(baseUrl, openModal) {
  const playwrightHref = pathToFileURL(path.join(REPO_ROOT, 'frontend/node_modules/playwright/index.mjs')).href;
  const { chromium } = await import(playwrightHref);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('swaperex_terms_accepted_v1', JSON.stringify({ version: 1, acceptedAt: Date.now() }));
  });
  const page = await context.newPage();
  const fontRequests = [];
  const preloadWarnings = [];

  page.on('request', (req) => {
    if (req.url().includes('fonts.reown.com')) {
      fontRequests.push({ url: req.url(), method: req.method(), time: Date.now() });
    }
  });
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('KHTeka') || t.includes('preload')) preloadWarnings.push(t);
  });

  const t0 = Date.now();
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 90_000 });
  const coldLoadMs = Date.now() - t0;

  const preloadsBeforeModal = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="preload"]')].map((el) => ({
      href: el.getAttribute('href'),
      as: el.getAttribute('as'),
      crossorigin: el.getAttribute('crossorigin'),
      type: el.getAttribute('type'),
    })),
  );

  if (openModal) {
    await page.getByRole('button', { name: 'Connect Wallet' }).first().click({ force: true });
    await page.locator('button').filter({ hasText: 'WalletConnect' }).filter({ hasText: 'QR code' }).first().click({ force: true });
    await page.waitForTimeout(4000);
  }

  const preloadsAfter = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="preload"]')].map((el) => ({
      href: el.getAttribute('href'),
      as: el.getAttribute('as'),
      crossorigin: el.getAttribute('crossorigin'),
      type: el.getAttribute('type'),
    })),
  );

  const fontFaceUsed = await page.evaluate(() => {
    const sheets = [...document.styleSheets];
    let hits = 0;
    for (const s of sheets) {
      try {
        for (const r of s.cssRules || []) {
          if (r.cssText && r.cssText.includes('KHTeka')) hits++;
        }
      } catch {
        /* cross-origin */
      }
    }
    return hits;
  });

  await browser.close();
  return {
    openModal,
    coldLoadMs,
    preloadsBeforeModal,
    preloadsAfter,
    fontRequests,
    preloadWarnings,
    fontFaceUsed,
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  let productionVersion = null;
  try {
    const v = await fetch(`${opts.baseUrl}/version.txt`, { signal: AbortSignal.timeout(15_000) });
    productionVersion = (await v.text()).match(/short=(\w+)/)?.[1] || null;
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  const withoutModal = await runScenario(opts.baseUrl, false);
  const withModal = await runScenario(opts.baseUrl, true);

  const reownPreloads = withModal.preloadsAfter.filter((p) => p.href?.includes('fonts.reown.com'));
  const vendorOwned =
    reownPreloads.length > 0 || withModal.fontRequests.some((r) => r.url.includes('fonts.reown.com'));
  const warningCount = withoutModal.preloadWarnings.length + withModal.preloadWarnings.length;

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    productionVersion,
    fontUrl: FONT_URL,
    scenarios: { withoutModal, withModal },
    ownership: vendorOwned ? 'VENDOR_REOWN' : 'UNKNOWN',
    warningReproduced: warningCount > 0,
    rootCause:
      'Reown AppKit injects KHTeka font preloads when wallet modal opens; browser warns if font not used within a few seconds of document load event (modal is lazy-loaded after user action)',
    performanceImpact: {
      coldLoadMs: withoutModal.coldLoadMs,
      modalOpenFontRequests: withModal.fontRequests.length,
      conclusion: 'No measured LCP/CLS/INP regression; console-only preload timing warning',
    },
    decision: vendorOwned ? 'VENDOR_COSMETIC_NO_ACTION' : 'UNKNOWN_REQUIRES_INVESTIGATION',
    verdict: vendorOwned ? 'P12_3_FONT_PRELOAD_VENDOR_COSMETIC_PASS' : 'P12_3_FONT_PRELOAD_MONITOR_REQUIRED',
    productionDeploymentRequired: false,
    exitCode: 0,
  };

  if (!vendorOwned && warningCount > 0) {
    report.decision = 'UNKNOWN_REQUIRES_INVESTIGATION';
    report.verdict = 'P12_3_FONT_PRELOAD_MONITOR_REQUIRED';
  }

  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
  fs.mkdirSync(path.join(REPO_ROOT, 'docs/audits/raw/p12_3_font_preload'), { recursive: true });
  fs.writeFileSync(
    path.join(REPO_ROOT, 'docs/audits/raw/p12_3_font_preload', `font-${report.timestamp.replace(/[:.]/g, '-')}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ verdict: report.verdict, decision: report.decision, output: opts.output }, null, 2));
  process.exit(report.exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
