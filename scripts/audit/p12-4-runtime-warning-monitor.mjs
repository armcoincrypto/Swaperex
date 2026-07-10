#!/usr/bin/env node
/**
 * P12.4 — Production runtime warning monitor (read-only).
 *
 * Usage:
 *   node scripts/audit/p12-4-runtime-warning-monitor.mjs
 *   node scripts/audit/p12-4-runtime-warning-monitor.mjs --strict
 *   node scripts/audit/p12-4-runtime-warning-monitor.mjs --output reports/p12-4-runtime-warnings.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_PATH = path.join(__dirname, 'config/p12-runtime-warning-baseline.json');

const ROUTES = ['/', '/trust', '/about', '/privacy', '/disclaimer'];
const READ_ONLY_ADDRESS = process.env.SWAPEREX_QA_ADDRESS || '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.SWAPEREX_QA_URL || 'https://dex.kobbex.com',
    output: path.join(REPO_ROOT, 'reports/p12-4-runtime-warnings.json'),
    strict: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--strict') opts.strict = true;
    else if (argv[i] === '--base-url') opts.baseUrl = argv[++i];
    else if (argv[i] === '--output') opts.output = argv[++i];
  }
  return opts;
}

function fingerprint(text) {
  return createHash('sha256').update(text.replace(/\d+/g, 'N')).digest('hex').slice(0, 16);
}

function classifyMessage(text, baseline) {
  const all = [...baseline.allowedFingerprints, ...baseline.operatorEnvironmentOnly];
  for (const fp of all) {
    if (new RegExp(fp.pattern, 'i').test(text)) {
      return { classification: fp.classification, id: fp.id, action: 'allow', reproduction: fp.reproduction || 'clean' };
    }
  }
  for (const p of baseline.fatalPatterns) {
    if (new RegExp(p, 'i').test(text)) return { classification: 'APP_FATAL', id: 'fatal-pattern', action: 'fail' };
  }
  if (/^error/i.test(text) || text.includes('Uncaught Error')) {
    return { classification: 'APP_ERROR', id: 'uncaught-error', action: 'fail' };
  }
  if (/warning/i.test(text)) return { classification: 'UNKNOWN_REQUIRES_INVESTIGATION', id: 'unknown-warning', action: 'investigate' };
  return { classification: 'INFORMATIONAL', id: 'info', action: 'log' };
}

function maskAddress(s) {
  return s.replace(/0x[a-fA-F0-9]{40}/g, (m) => `${m.slice(0, 6)}…${m.slice(-4)}`);
}

async function installModalHelpers(context) {
  await context.addInitScript(() => {
    window.__p12Deep = {
      deepAll(root) {
        const acc = [];
        if (!root) return acc;
        for (const el of root.querySelectorAll('*')) {
          acc.push(el);
          if (el.shadowRoot) acc.push(...window.__p12Deep.deepAll(el.shadowRoot));
        }
        return acc;
      },
      modalRoot() {
        return document.querySelector('w3m-modal')?.shadowRoot || null;
      },
      clickWalletConnectInModal() {
        const all = window.__p12Deep.deepAll(window.__p12Deep.modalRoot());
        const target = all.find((el) => el.tagName === 'WUI-LIST-WALLET' && /walletconnect/i.test(el.textContent || ''));
        target?.click();
      },
      clickModalBack() {
        const all = window.__p12Deep.deepAll(window.__p12Deep.modalRoot());
        all.find((el) => el.getAttribute?.('icon') === 'chevronLeft')?.click();
      },
    };
  });
}

async function runProfile(baseUrl, profileName) {
  const playwrightHref = pathToFileURL(path.join(REPO_ROOT, 'frontend/node_modules/playwright/index.mjs')).href;
  const { chromium } = await import(playwrightHref);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('swaperex_terms_accepted_v1', JSON.stringify({ version: 1, acceptedAt: Date.now() }));
  });
  await installModalHelpers(context);
  const page = await context.newPage();
  const events = [];
  const push = (level, message, route, step) => {
    events.push({ level, message: maskAddress(message), route, step, profile: profileName });
  };
  page.on('console', (msg) => push(msg.type(), msg.text(), page.url(), 'console'));
  page.on('pageerror', (err) => push('pageerror', err.message || String(err), page.url(), 'pageerror'));

  const steps = [];

  for (const route of ROUTES) {
    await page.goto(`${baseUrl}${route === '/' ? '' : route}`, { waitUntil: 'networkidle', timeout: 90_000 }).catch((e) => {
      push('navigation', e.message, route, 'navigation-fail');
    });
    await page.waitForTimeout(1500);
    steps.push({ route, blank: (await page.locator('body').innerText()).length < 100 });
  }

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.getByRole('button', { name: 'Connect Wallet' }).first().click({ force: true }).catch(() => {});
  await page.locator('button').filter({ hasText: 'WalletConnect' }).filter({ hasText: 'QR code' }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(3000);
  steps.push({ step: 'wallet_modal_open' });
  await page.evaluate(() => window.__p12Deep.clickWalletConnectInModal());
  await page.waitForTimeout(3000);
  steps.push({ step: 'wallet_connecting_view' });
  await page.evaluate(() => window.__p12Deep.clickModalBack());
  await page.waitForTimeout(1500);
  steps.push({ step: 'wallet_modal_back' });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'View address' }).first().click({ force: true });
  await page.locator('#wallet-address, input[placeholder="0x..."]').first().fill(READ_ONLY_ADDRESS);
  await page.getByRole('button', { name: 'View', exact: true }).first().click({ force: true });
  await page.waitForTimeout(1000);
  steps.push({ step: 'readonly_connect' });
  await page.locator('button').filter({ hasText: /^0x/i }).first().click({ force: true }).catch(() => {});
  await page.getByRole('button', { name: /Exit View Mode/i }).first().click({ force: true }).catch(() => {});
  steps.push({ step: 'disconnect' });
  await page.reload({ waitUntil: 'networkidle' });
  steps.push({ step: 'hard_refresh' });

  await browser.close();
  return { events, steps };
}

async function main() {
  const opts = parseArgs(process.argv);
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  let productionVersion = null;
  try {
    const v = await fetch(`${opts.baseUrl}/version.txt`, { signal: AbortSignal.timeout(15_000) });
    productionVersion = (await v.text()).match(/short=(\w+)/)?.[1] || null;
  } catch (e) {
    console.error('version.txt failed:', e.message);
    process.exit(2);
  }

  const clean = await runProfile(opts.baseUrl, 'clean_chromium');
  const inventory = new Map();

  for (const ev of clean.events) {
    const fp = fingerprint(ev.message);
    const cls = classifyMessage(ev.message, baseline);
    const key = fp;
    if (!inventory.has(key)) {
      inventory.set(key, {
        fingerprint: fp,
        messageSample: ev.message.slice(0, 240),
        level: ev.level,
        classification: cls.classification,
        baselineId: cls.id,
        action: cls.action,
        cleanProfile: true,
        operatorProfile: false,
        count: 0,
      });
    }
    inventory.get(key).count += 1;
  }

  const fatal = [...inventory.values()].filter((i) => i.action === 'fail');
  const unknown = [...inventory.values()].filter((i) => i.classification === 'UNKNOWN_REQUIRES_INVESTIGATION');
  const blank = clean.steps.some((s) => s.blank);

  let verdict = 'P12_4_RUNTIME_WARNING_MONITOR_PASS';
  if (fatal.length > 0 || blank) verdict = 'P12_4_RUNTIME_WARNING_MONITOR_BLOCKED';
  else if (unknown.length > 0 && opts.strict) verdict = 'P12_4_RUNTIME_WARNING_MONITOR_BLOCKED';
  else if (unknown.length > 0 || [...inventory.values()].some((i) => i.classification === 'COSMETIC_RESOURCE_HINT')) {
    verdict = 'P12_4_RUNTIME_WARNING_MONITOR_PASS_WITH_EXTERNAL_NOISE';
  }

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    productionVersion,
    profile: 'clean_chromium_no_extensions',
    operatorProfileNote: 'Extension warnings marked OPERATOR_ENVIRONMENT_ONLY in baseline; not reproduced in clean profile',
    strict: opts.strict,
    warningInventory: [...inventory.values()],
    fatalChecks: { p11ConnectingView: !clean.events.some((e) => e.message.includes('w3m-connecting-view: No connector provided')), blankScreen: !blank },
    verdict,
    exitCode: verdict.includes('BLOCKED') ? 1 : 0,
  };

  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
  fs.mkdirSync(path.join(REPO_ROOT, 'docs/audits/raw/p12_4_runtime_warnings'), { recursive: true });
  fs.writeFileSync(
    path.join(REPO_ROOT, 'docs/audits/raw/p12_4_runtime_warnings', `monitor-${report.timestamp.replace(/[:.]/g, '-')}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ verdict: report.verdict, fatal: fatal.length, unknown: unknown.length, output: opts.output }, null, 2));
  process.exit(report.exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
