#!/usr/bin/env node
/**
 * P12.2 — Reown/AppKit dependency monitor (read-only).
 *
 * Usage:
 *   node scripts/audit/p12-2-reown-dependency-monitor.mjs
 *   node scripts/audit/p12-2-reown-dependency-monitor.mjs --check
 *   node scripts/audit/p12-2-reown-dependency-monitor.mjs --output reports/p12-2-reown-dependencies.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.join(REPO_ROOT, 'frontend');

const MONITORED = [
  '@reown/appkit',
  '@reown/appkit-adapter-ethers',
  '@walletconnect/ethereum-provider',
  '@walletconnect/sign-client',
  '@walletconnect/universal-provider',
  'ethers',
  'react',
  'react-dom',
  'vite',
  '@vitejs/plugin-react',
];

const LOCAL_MITIGATIONS = [
  { file: 'frontend/src/services/wallet/sanitizeAppKitPersistedState.ts', id: 'p11-sanitizer' },
  { file: 'frontend/src/components/wallet/WalletBootstrap.tsx', id: 'p11-modal-error-guard' },
  { file: 'frontend/vite/plugins/patchReownWuiIconPhosphorSize.ts', id: 'p10-svg-phosphor-patch' },
  { file: 'frontend/vite.config.ts', id: 'vite-patch-wiring', mustContain: 'patchReownWuiIconPhosphorSize' },
  { file: 'frontend/src/services/wallet/appkit.ts', id: 'appkit-init', mustContain: 'enableInjected: false' },
];

function parseArgs(argv) {
  const opts = { output: path.join(REPO_ROOT, 'reports/p12-2-reown-dependencies.json'), check: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--check') opts.check = true;
    else if (argv[i] === '--output') opts.output = argv[++i];
  }
  return opts;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function lockVersions(lock) {
  const map = new Map();
  const walk = (node) => {
    if (!node) return;
    if (node.name && node.version) map.set(node.name, node.version);
    for (const dep of node.dependencies ? Object.values(node.dependencies) : []) walk(dep);
  };
  walk(lock.packages?.[''] ? { ...lock.packages[''], dependencies: lock.packages[''].dependencies } : null);
  for (const [k, pkg] of Object.entries(lock.packages || {})) {
    if (k && pkg.version) map.set(k.replace('node_modules/', ''), pkg.version);
  }
  return map;
}

function findInstalled(name, lockMap) {
  if (lockMap.has(name)) return lockMap.get(name);
  for (const [k, v] of lockMap) {
    if (k === name || k.endsWith(`/${name}`)) return v;
  }
  return null;
}

function scanReownPackages(lockMap) {
  const out = [];
  for (const [name, version] of lockMap) {
    if (name.startsWith('@reown/') || name.startsWith('@walletconnect/')) {
      out.push({ name, version });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function verifyMitigations() {
  const results = [];
  for (const m of LOCAL_MITIGATIONS) {
    const p = path.join(REPO_ROOT, m.file);
    const exists = fs.existsSync(p);
    let contentOk = exists;
    if (exists && m.mustContain) {
      contentOk = fs.readFileSync(p, 'utf8').includes(m.mustContain);
    }
    results.push({ ...m, exists, contentOk, status: exists && contentOk ? 'PASS' : 'FAIL' });
  }
  return results;
}

async function fetchNpmLatest(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { name, latest: null, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { name, latest: data.version };
  } catch (e) {
    return { name, latest: null, error: e.message };
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const pkg = readJson(path.join(FRONTEND, 'package.json'));
  const lockPath = path.join(FRONTEND, 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    console.error('package-lock.json missing');
    process.exit(2);
  }
  const lock = readJson(lockPath);
  const lockMap = lockVersions(lock);
  const mitigations = verifyMitigations();
  const reownTree = scanReownPackages(lockMap);

  const inventory = MONITORED.map((name) => ({
    name,
    declared: pkg.dependencies?.[name] || pkg.devDependencies?.[name] || pkg.overrides?.[name] || null,
    installed: findInstalled(name, lockMap),
    role: name.startsWith('@reown') ? 'wallet-ui' : name.startsWith('@walletconnect') ? 'walletconnect' : 'platform',
    recommendedAction: 'HOLD',
  }));

  for (const item of inventory) {
    if (item.name === '@reown/appkit' || item.name.startsWith('@walletconnect/')) {
      item.localPatchDependency = 'patchReownWuiIconPhosphorSize.ts; P11 sanitizer';
      item.potentialBreakingSurface = 'w3m-connecting-view, wui-icon phosphor size, font preload, modal router';
      item.recommendedAction = 'MONITOR';
    }
    if (item.name === 'vite' || item.name.startsWith('@vitejs')) {
      item.recommendedAction = 'MONITOR';
    }
  }

  const upstream = [];
  for (const name of ['@reown/appkit', '@walletconnect/ethereum-provider']) {
    upstream.push(await fetchNpmLatest(name));
  }

  const policyViolations = [];
  if (mitigations.some((m) => m.status === 'FAIL')) policyViolations.push('local_mitigation_missing_or_unwired');
  if (!findInstalled('@reown/appkit', lockMap)) policyViolations.push('missing_@reown/appkit');

  const report = {
    timestamp: new Date().toISOString(),
    lockfile: 'frontend/package-lock.json',
    inventory,
    reownWalletConnectTree: reownTree,
    localMitigations: mitigations,
    upstreamLatest: upstream,
    upgradePlan: {
      workflow: 'isolated branch; one family at a time; full gates + P12.5 + P12.4 + P11.2 before prod',
      productionUpgradeInP12: false,
    },
    policyViolations,
    verdict: policyViolations.length ? 'P12_2_DEPENDENCY_MONITOR_BLOCKED' : 'P12_2_DEPENDENCY_MONITOR_PASS',
    exitCode: policyViolations.length ? 1 : 0,
  };

  const drift = upstream.filter((u) => u.latest && inventory.find((i) => i.name === u.name && i.installed && u.latest !== i.installed));
  if (drift.length > 0) report.upstreamDrift = drift;

  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
  fs.mkdirSync(path.join(REPO_ROOT, 'docs/audits/raw/p12_2_dependencies'), { recursive: true });
  fs.writeFileSync(
    path.join(REPO_ROOT, 'docs/audits/raw/p12_2_dependencies', `deps-${report.timestamp.replace(/[:.]/g, '-')}.json`),
    JSON.stringify(report, null, 2),
  );

  console.log(JSON.stringify({ verdict: report.verdict, violations: policyViolations, output: opts.output }, null, 2));
  if (opts.check && policyViolations.length) process.exit(1);
  process.exit(report.exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
