#!/usr/bin/env node
/**
 * P12.1 — Mobile WalletConnect validation assist (optional human pairing).
 * Opens QR modal and waits for operator; does NOT claim PASS without human approval.
 *
 * Usage:
 *   SWAPEREX_QA_URL=https://dex.kobbex.com node scripts/audit/p12-1-mobile-walletconnect-assist.mjs
 *   PAIRING_TIMEOUT_MS=120000 node scripts/audit/p12-1-mobile-walletconnect-assist.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TIMEOUT_MS = Number(process.env.PAIRING_TIMEOUT_MS || 30_000);

function maskAddress(s) {
  return s?.replace(/0x[a-fA-F0-9]{40}/g, (m) => `${m.slice(0, 6)}…${m.slice(-4)}`) || s;
}

async function main() {
  const baseUrl = process.env.SWAPEREX_QA_URL || 'https://dex.kobbex.com';
  const playwrightHref = pathToFileURL(path.join(REPO_ROOT, 'frontend/node_modules/playwright/index.mjs')).href;
  const { chromium } = await import(playwrightHref);

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    mode: 'assist',
    humanPairingRequired: true,
    pairingTimeoutMs: TIMEOUT_MS,
    pairingCompleted: false,
    verdict: 'P12_1_HUMAN_MOBILE_WALLETCONNECT_DEFERRED',
    notes: ['No human mobile wallet scanned within timeout; defer to operator handset session.'],
  };

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('swaperex_terms_accepted_v1', JSON.stringify({ version: 1, acceptedAt: Date.now() }));
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.getByRole('button', { name: 'Connect Wallet' }).first().click();
    await page.locator('button').filter({ hasText: 'WalletConnect' }).filter({ hasText: 'QR code' }).first().click();
    await page.waitForTimeout(3000);

    const start = Date.now();
    while (Date.now() - start < TIMEOUT_MS) {
      const connected = await page.locator('button').filter({ hasText: /^0x/i }).first().isVisible().catch(() => false);
      if (connected) {
        report.pairingCompleted = true;
        report.verdict = 'P12_1_HUMAN_MOBILE_WALLETCONNECT_PASS';
        report.notes = ['Human pairing detected via connected address in header.'];
        const txt = await page.locator('button').filter({ hasText: /^0x/i }).first().innerText();
        report.maskedWalletAddress = maskAddress(txt);
        break;
      }
      await page.waitForTimeout(2000);
    }
  } finally {
    await browser.close();
  }

  const out = path.join(REPO_ROOT, 'reports/p12-1-mobile-walletconnect-assist.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pairingCompleted ? 0 : 3);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
