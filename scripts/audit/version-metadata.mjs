#!/usr/bin/env node
/**
 * Production version.txt key-value parser and validator.
 * Safe for public metadata — no eval, no shell sourcing.
 */

const GIT_HASH_RE = /^[0-9a-f]{7,40}$/i;

/**
 * @param {string} text
 */
export function parseVersionMetadata(text) {
  /** @type {Record<string, string>} */
  const keys = {};
  /** @type {string[]} */
  const duplicates = [];
  /** @type {string[]} */
  const malformed = [];

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) {
      malformed.push(rawLine);
      continue;
    }

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    if (!key || !/^[a-z0-9_]+$/i.test(key)) {
      malformed.push(rawLine);
      continue;
    }

    const normalized = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(keys, normalized)) {
      duplicates.push(normalized);
    }
    keys[normalized] = value;
  }

  return { keys, duplicates, malformed };
}

/**
 * @param {string} commit
 */
export function isValidGitCommitHash(commit) {
  return GIT_HASH_RE.test(String(commit).trim());
}

/**
 * @param {string} a
 * @param {string} b
 */
export function commitsMatch(a, b) {
  const left = String(a).trim().toLowerCase();
  const right = String(b).trim().toLowerCase();
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  return longer.startsWith(shorter);
}

/**
 * @param {string} text
 * @param {{ expectedCommit?: string, requireEnvironment?: string }} [options]
 */
export function validateVersionMetadata(text, options = {}) {
  const requireEnvironment = options.requireEnvironment ?? 'production';
  const { keys, duplicates, malformed } = parseVersionMetadata(text);

  if (malformed.length > 0) {
    return {
      verdict: 'VERSION_METADATA_MALFORMED_LINE',
      keys,
      malformed,
      message: `Malformed line(s): ${malformed.join('; ')}`,
    };
  }

  if (duplicates.length > 0) {
    return {
      verdict: 'VERSION_METADATA_DUPLICATE_KEY',
      keys,
      duplicates,
      message: `Duplicate key(s): ${duplicates.join(', ')}`,
    };
  }

  if (!keys.commit) {
    return {
      verdict: 'VERSION_METADATA_MISSING_COMMIT',
      keys,
      message: 'Missing required key: commit',
    };
  }

  if (!isValidGitCommitHash(keys.commit)) {
    return {
      verdict: 'VERSION_METADATA_MALFORMED_COMMIT',
      keys,
      message: `Invalid commit hash: ${keys.commit}`,
    };
  }

  if (!keys.environment) {
    return {
      verdict: 'VERSION_METADATA_MISSING_ENVIRONMENT',
      keys,
      message: 'Missing required key: environment',
    };
  }

  if (keys.environment !== requireEnvironment) {
    return {
      verdict: 'VERSION_METADATA_WRONG_ENVIRONMENT',
      keys,
      message: `Expected environment=${requireEnvironment}, got environment=${keys.environment}`,
    };
  }

  if (options.expectedCommit && !commitsMatch(keys.commit, options.expectedCommit)) {
    return {
      verdict: 'VERSION_METADATA_COMMIT_MISMATCH',
      keys,
      message: `Expected commit ${options.expectedCommit}, got ${keys.commit}`,
    };
  }

  return {
    verdict: 'VERSION_METADATA_PASS',
    keys,
    message: 'version metadata valid',
  };
}

function parseCli(argv) {
  const opts = {
    command: argv[2] || 'validate',
    file: null,
    text: undefined,
    expectedCommit: process.env.EXPECTED_PRODUCTION_COMMIT || null,
    requireEnvironment: 'production',
    json: false,
  };

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file') opts.file = argv[++i];
    else if (arg === '--text') opts.text = argv[++i];
    else if (arg === '--expected-commit') opts.expectedCommit = argv[++i];
    else if (arg === '--require-environment') opts.requireEnvironment = argv[++i];
    else if (arg === '--json') opts.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return opts;
}

async function main() {
  const opts = parseCli(process.argv);
  if (opts.command !== 'validate') {
    throw new Error(`Unknown command: ${opts.command}`);
  }

  const text = opts.text !== undefined ? opts.text : await (async () => {
    const fs = await import('node:fs');
    if (!opts.file) throw new Error('Provide --text or --file');
    return fs.readFileSync(opts.file, 'utf8');
  })();

  const result = validateVersionMetadata(text, {
    expectedCommit: opts.expectedCommit || undefined,
    requireEnvironment: opts.requireEnvironment,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.verdict);
    if (result.message) console.log(result.message);
  }

  process.exit(result.verdict === 'VERSION_METADATA_PASS' ? 0 : 1);
}

import { fileURLToPath } from 'node:url';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(2);
  });
}
