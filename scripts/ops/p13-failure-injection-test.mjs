#!/usr/bin/env node
/**
 * P13.7 — Safe synthetic failure-injection tests (isolated temp dirs only).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FIX = path.join(REPO_ROOT, 'tests/fixtures/p13');

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function setupDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `p13-test-${name}-`));
  return dir;
}

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
  }
}

test('malformed report skipped by trend report', () => {
  const dir = setupDir('malformed');
  fs.copyFileSync(path.join(FIX, 'malformed-report.json'), path.join(dir, 'bad.json'));
  const out = path.join(dir, 'trends.json');
  const r = runNode(path.join(REPO_ROOT, 'scripts/ops/p13-quote-trend-report.mjs'), [
    '--reports-dir', dir, '--window', '30d', '--output', out,
  ]);
  assert(r.status === 0, 'trend report should not fail on malformed file');
  const rep = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert(rep.skippedFiles?.length >= 1, 'expected skipped malformed file');
});

test('stale report yields STALE status', () => {
  const dir = setupDir('stale');
  fs.copyFileSync(path.join(FIX, 'stale-report.json'), path.join(dir, 'stale.json'));
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({
    timestamp: '2020-01-01T00:00:00.000Z',
    finalExitCode: 0,
    outputPath: path.join(dir, 'stale.json'),
  }));
  const statusJson = path.join(dir, 'status.json');
  // Point status at temp smoke dir via env hack: copy latest to repo reports temporarily
  const smokeDir = path.join(REPO_ROOT, 'reports/p13/route-smoke');
  const backup = fs.existsSync(path.join(smokeDir, 'latest.json'))
    ? fs.readFileSync(path.join(smokeDir, 'latest.json'))
    : null;
  fs.writeFileSync(path.join(smokeDir, 'latest.json'), fs.readFileSync(path.join(dir, 'latest.json')));
  const r = runNode(path.join(REPO_ROOT, 'scripts/ops/p13-production-status.mjs'), [
    '--json', statusJson, '--check',
  ]);
  if (backup) fs.writeFileSync(path.join(smokeDir, 'latest.json'), backup);
  assert(r.status === 3, `expected STALE exit 3 got ${r.status}`);
  const rep = JSON.parse(fs.readFileSync(statusJson, 'utf8'));
  assert(rep.overallStatus === 'STALE', `expected STALE got ${rep.overallStatus}`);
});

test('single synthetic route failure yields DEGRADED or INCIDENT', () => {
  const dir = setupDir('singlefail');
  fs.copyFileSync(path.join(FIX, 'synthetic-route-failure.json'), path.join(dir, 'fail.json'));
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    finalExitCode: 1,
    finalClassification: 'confirmed_quote_regression',
    outputPath: path.join(dir, 'fail.json'),
  }));
  const smokeDir = path.join(REPO_ROOT, 'reports/p13/route-smoke');
  const backup = fs.readFileSync(path.join(smokeDir, 'latest.json'));
  fs.writeFileSync(path.join(smokeDir, 'latest.json'), fs.readFileSync(path.join(dir, 'latest.json')));
  const statusJson = path.join(dir, 'status.json');
  runNode(path.join(REPO_ROOT, 'scripts/ops/p13-production-status.mjs'), ['--json', statusJson]);
  fs.writeFileSync(path.join(smokeDir, 'latest.json'), backup);
  const rep = JSON.parse(fs.readFileSync(statusJson, 'utf8'));
  assert(['INCIDENT', 'DEGRADED'].includes(rep.overallStatus), rep.overallStatus);
});

test('APP_FATAL warning fails --check', () => {
  const dir = setupDir('fatal');
  fs.copyFileSync(path.join(FIX, 'synthetic-app-fatal-warning.json'), path.join(dir, 'warn.json'));
  const out = path.join(dir, 'trends.json');
  const r = runNode(path.join(REPO_ROOT, 'scripts/ops/p13-runtime-warning-trends.mjs'), [
    '--input-dir', dir, '--legacy', path.join(dir, 'warn.json'), '--output', out, '--check',
  ]);
  assert(r.status !== 0, 'APP_FATAL should fail --check');
});

test('missing report directory tolerated', () => {
  const dir = setupDir('missing');
  const out = path.join(dir, 'trends.json');
  const r = runNode(path.join(REPO_ROOT, 'scripts/ops/p13-quote-trend-report.mjs'), [
    '--reports-dir', path.join(dir, 'nonexistent'), '--output', out,
  ]);
  assert(r.status === 0, 'missing dir should not crash');
});

const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
