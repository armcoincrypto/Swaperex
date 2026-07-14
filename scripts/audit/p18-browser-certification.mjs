/**
 * P18 — desktop/mobile viewport smoke + screenshot capture for dex.kobbex.com (or BASE_URL).
 * No wallet broadcast.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const BASE_URL = process.env.P18_BASE_URL || 'https://dex.kobbex.com';
const OUT_DIR = process.env.P18_EVID_DIR || path.join(REPO_ROOT, 'docs/audits/raw/p18-browser');

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-360x800', width: 360, height: 800 },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const playwrightPath = path.join(REPO_ROOT, 'frontend/node_modules/playwright/index.mjs');
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const browser = await chromium.launch({ headless: true });
  const report = { baseUrl: BASE_URL, startedAt: new Date().toISOString(), viewports: [] };

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    const res = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        overflowX: doc.scrollWidth > doc.clientWidth + 2,
      };
    });
    const bodyText = await page.locator('body').innerText();
    const shots = path.join(OUT_DIR, `browser-${vp.name}.png`);
    await page.screenshot({ path: shots, fullPage: true });

    const entry = {
      viewport: vp.name,
      status: res?.status() ?? null,
      overflowX: overflow.overflowX,
      hasCanaryPublic: /canary/i.test(bodyText) && !/admin/i.test(bodyText.slice(0, 200)),
      hasAuditedRoutesPill: /Audited Routes/i.test(bodyText),
      hasCertifiedLanguage: /Certified|Production-certified|Self-Custody/i.test(bodyText),
      consoleErrors: consoleErrors.slice(0, 20),
      screenshot: shots,
    };
    report.viewports.push(entry);
    await context.close();
  }

  // Trust Center
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const res = await page.goto(`${BASE_URL}/trust`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1000);
    const text = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(OUT_DIR, 'browser-trust-center.png'), fullPage: true });
    report.trustCenter = {
      status: res?.status() ?? null,
      hasCertificationClarification: /third-party smart-contract audit/i.test(text),
      hasProductionCertified: /Production-certified|production-readiness/i.test(text),
    };
    await context.close();
  }

  report.finishedAt = new Date().toISOString();
  report.pass = report.viewports.every(
    (v) => v.status === 200 && !v.overflowX && !v.hasCanaryPublic && v.consoleErrors.length === 0,
  ) && report.trustCenter?.status === 200;

  fs.writeFileSync(path.join(OUT_DIR, 'browser-cert.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
