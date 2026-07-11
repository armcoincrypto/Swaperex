#!/usr/bin/env node
/**
 * Tests for scripts/audit/version-metadata.mjs
 * Run: node scripts/audit/version-metadata.test.mjs
 */

import assert from 'node:assert/strict';
import {
  parseVersionMetadata,
  validateVersionMetadata,
  commitsMatch,
} from './version-metadata.mjs';

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

const VALID_COMMIT = 'b6024e3f21700e52ba26516bbb14edc49ce29568';

test('valid minimal commit + production environment', () => {
  const body = `commit=${VALID_COMMIT}\nenvironment=production\n`;
  const result = validateVersionMetadata(body);
  assert.equal(result.verdict, 'VERSION_METADATA_PASS');
});

test('valid with optional deployed timestamp', () => {
  const body = `commit=${VALID_COMMIT}\nenvironment=production\ndeployed=2026-07-11T15:20:32Z\nshort=b6024e3\nbranch=main\n`;
  const result = validateVersionMetadata(body);
  assert.equal(result.verdict, 'VERSION_METADATA_PASS');
  assert.equal(result.keys.short, 'b6024e3');
});

test('fields in different order pass', () => {
  const body = `environment=production\nbranch=main\ncommit=${VALID_COMMIT}\n`;
  const result = validateVersionMetadata(body);
  assert.equal(result.verdict, 'VERSION_METADATA_PASS');
});

test('blank lines pass', () => {
  const body = `\ncommit=${VALID_COMMIT}\n\nenvironment=production\n\n`;
  const result = validateVersionMetadata(body);
  assert.equal(result.verdict, 'VERSION_METADATA_PASS');
});

test('missing commit fails', () => {
  const result = validateVersionMetadata('environment=production\n');
  assert.equal(result.verdict, 'VERSION_METADATA_MISSING_COMMIT');
});

test('missing environment fails', () => {
  const result = validateVersionMetadata(`commit=${VALID_COMMIT}\n`);
  assert.equal(result.verdict, 'VERSION_METADATA_MISSING_ENVIRONMENT');
});

test('environment=staging fails', () => {
  const result = validateVersionMetadata(`commit=${VALID_COMMIT}\nenvironment=staging\n`);
  assert.equal(result.verdict, 'VERSION_METADATA_WRONG_ENVIRONMENT');
});

test('malformed commit fails', () => {
  const result = validateVersionMetadata('commit=not-a-hash\nenvironment=production\n');
  assert.equal(result.verdict, 'VERSION_METADATA_MALFORMED_COMMIT');
});

test('expected/live commit mismatch fails', () => {
  const result = validateVersionMetadata(`commit=${VALID_COMMIT}\nenvironment=production\n`, {
    expectedCommit: 'eee0264',
  });
  assert.equal(result.verdict, 'VERSION_METADATA_COMMIT_MISMATCH');
});

test('expected commit matches short prefix', () => {
  const result = validateVersionMetadata(`commit=${VALID_COMMIT}\nenvironment=production\n`, {
    expectedCommit: 'b6024e3',
  });
  assert.equal(result.verdict, 'VERSION_METADATA_PASS');
});

test('duplicate commit fails', () => {
  const parsed = parseVersionMetadata(`commit=${VALID_COMMIT}\ncommit=eee0264\nenvironment=production\n`);
  assert.ok(parsed.duplicates.includes('commit'));
  const result = validateVersionMetadata(`commit=${VALID_COMMIT}\ncommit=eee0264\nenvironment=production\n`);
  assert.equal(result.verdict, 'VERSION_METADATA_DUPLICATE_KEY');
});

test('duplicate environment fails', () => {
  const result = validateVersionMetadata(
    `commit=${VALID_COMMIT}\nenvironment=production\nenvironment=production\n`,
  );
  assert.equal(result.verdict, 'VERSION_METADATA_DUPLICATE_KEY');
});

test('malformed key-value line fails', () => {
  const result = validateVersionMetadata(`commit=${VALID_COMMIT}\nenvironment=production\nbadline\n`);
  assert.equal(result.verdict, 'VERSION_METADATA_MALFORMED_LINE');
});

test('commitsMatch supports short and full hashes', () => {
  assert.equal(commitsMatch('b6024e3', VALID_COMMIT), true);
  assert.equal(commitsMatch(VALID_COMMIT, 'eee0264'), false);
});

console.log('\nAll version-metadata tests passed.');
