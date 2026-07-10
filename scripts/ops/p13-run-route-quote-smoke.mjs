#!/usr/bin/env node
/**
 * P13.1 — Scheduled route/quote smoke runner (wraps P12.5 with retries + timestamped reports).
 * Read-only. No wallet, no transactions, no secrets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SMOKE_SCRIPT = path.join(REPO_ROOT, 'scripts/audit/p12-5-route-quote-regression-smoke.mjs');
const OUT_DIR = path.join(REPO_ROOT, 'reports/p13/route-smoke');
const MAX_RETRIES = 2;
const BACKOFF_MS = [5000, 15000];

function tsSlug(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-');
}

function classifyFailure(report, exitCode) {
  if (exitCode === 0) return 'success';
  if (!report) {
    if (exitCode === 2) return 'local_environment_failure';
    return 'script_configuration_failure';
  }
  const failed = (report.results || []).filter((r) => r.status === 'FAIL');
  const requiredFail = failed.filter(
    (r) => report.routeMatrix?.find((x) => x.id === r.id)?.required !== false,
  );
  const httpFail = requiredFail.some((r) => r.layer === 'http');
  const onchainFail = requiredFail.some((r) => r.layer === 'onchain');
  const browserFail = requiredFail.some((r) => r.layer === 'browser');
  if (httpFail && requiredFail.every((r) => r.layer === 'http')) return 'production_unavailable';
  if (onchainFail) return 'confirmed_quote_regression';
  if (browserFail) return 'confirmed_route_regression';
  if (exitCode === 2) return 'browser_startup_failure';
  if (requiredFail.length === 0) return 'rpc_provider_transient_failure';
  return 'confirmed_route_regression';
}

function runOnce(outputPath, baseUrl) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [SMOKE_SCRIPT, '--base-url', baseUrl, '--output', outputPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 840_000,
  });
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch {
    /* malformed */
  }
  return {
    exitCode: res.status ?? 2,
    signal: res.signal,
    stdout: (res.stdout || '').slice(-2000),
    stderr: (res.stderr || '').slice(-2000),
    durationMs: Date.now() - started,
    report,
    classification: classifyFailure(report, res.status ?? 2),
  };
}

async function main() {
  const baseUrl = process.env.SWAPEREX_QA_URL || 'https://dex.kobbex.com';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = tsSlug();
  const outputPath = path.join(OUT_DIR, `${stamp}.json`);
  const attempts = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1] || 5000));
    const result = runOnce(outputPath, baseUrl);
    attempts.push({ attempt: attempt + 1, ...result, outputPath });
    if (result.exitCode === 0) break;
    const transient = ['production_unavailable', 'browser_startup_failure', 'local_environment_failure'].includes(
      result.classification,
    );
    if (!transient || attempt === MAX_RETRIES) break;
  }

  const final = attempts[attempts.length - 1];
  const envelope = {
    schemaVersion: 1,
    runner: 'p13-run-route-quote-smoke',
    timestamp: new Date().toISOString(),
    baseUrl,
    attempts: attempts.map(({ report, stdout, stderr, ...rest }) => ({
      ...rest,
      verdict: report?.verdict || null,
      summary: report?.summary || null,
    })),
    finalClassification: final.classification,
    finalExitCode: final.exitCode,
    finalVerdict: final.report?.verdict || 'UNKNOWN',
    outputPath,
  };

  fs.writeFileSync(outputPath, JSON.stringify({ ...final.report, p13Envelope: envelope }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify(envelope, null, 2));

  console.log(JSON.stringify({ finalExitCode: final.exitCode, classification: final.classification, outputPath }, null, 2));
  process.exit(final.exitCode === 0 ? 0 : final.exitCode === 2 ? 2 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
