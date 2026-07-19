import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KOBBEX_FEE_BPS,
  KOBBEX_TREASURY,
  KOBBEX_WRAPPERS,
} from '@/testing/walletHarness';

function loadEnvProduction(): Record<string, string> {
  const p = path.resolve(process.cwd(), '.env.production');
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

describe('P21.4 fee and treasury assertions vs .env.production', () => {
  it('matches verified wrapper fee bps and treasury', () => {
    const env = loadEnvProduction();
    expect(env.VITE_FEE_RECIPIENT?.toLowerCase()).toBe(KOBBEX_TREASURY.toLowerCase());
    expect(Number(env.VITE_UNISWAP_WRAPPER_V2_FEE_BPS)).toBe(KOBBEX_FEE_BPS.ethereum);
    expect(Number(env.VITE_PANCAKE_WRAPPER_V2_FEE_BPS)).toBe(KOBBEX_FEE_BPS.bsc);
    expect(env.VITE_UNISWAP_WRAPPER_V2_ADDRESS?.toLowerCase()).toBe(
      KOBBEX_WRAPPERS.ethV2.toLowerCase(),
    );
    expect(env.VITE_UNISWAP_WRAPPER_V3_ADDRESS?.toLowerCase()).toBe(
      KOBBEX_WRAPPERS.ethV3.toLowerCase(),
    );
    expect(env.VITE_PANCAKE_WRAPPER_V2_ADDRESS?.toLowerCase()).toBe(
      KOBBEX_WRAPPERS.bscV2.toLowerCase(),
    );
  });
});
