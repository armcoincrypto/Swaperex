/**
 * Transaction Builder Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  formatAmount,
  buildNativeTransfer,
  buildERC20Transfer,
} from '@/utils/txBuilder';

describe('parseAmount', () => {
  it('parses integer amounts', () => {
    expect(parseAmount('1', 18)).toBe(1000000000000000000n);
    expect(parseAmount('100', 18)).toBe(100000000000000000000n);
  });

  it('parses decimal amounts', () => {
    expect(parseAmount('0.5', 18)).toBe(500000000000000000n);
    expect(parseAmount('1.5', 6)).toBe(1500000n);
    expect(parseAmount('0.000001', 6)).toBe(1n);
  });

  it('handles USDT/USDC 6 decimals', () => {
    expect(parseAmount('100', 6)).toBe(100000000n);
    expect(parseAmount('0.01', 6)).toBe(10000n);
  });

  it('rejects scientific notation', () => {
    expect(() => parseAmount('1e18', 18)).toThrow('Scientific notation');
    expect(() => parseAmount('1.5E6', 6)).toThrow('Scientific notation');
  });

  it('rejects too many decimal places', () => {
    expect(() => parseAmount('0.0000001', 6)).toThrow('Too many decimal places');
    expect(() => parseAmount('0.123456789', 8)).toThrow('Too many decimal places');
  });

  it('rejects invalid amounts', () => {
    expect(() => parseAmount('', 18)).toThrow('Invalid amount');
    expect(() => parseAmount('.', 18)).toThrow('Invalid amount');
  });

  it('handles 8-decimal tokens (WBTC)', () => {
    expect(parseAmount('1', 8)).toBe(100000000n);
    expect(parseAmount('0.00000001', 8)).toBe(1n);
  });
});

describe('formatAmount', () => {
  it('formats wei to ETH', () => {
    expect(formatAmount(1000000000000000000n, 18)).toBe('1.0');
    expect(formatAmount(500000000000000000n, 18)).toBe('0.5');
  });

  it('formats USDC amounts', () => {
    expect(formatAmount(1000000n, 6)).toBe('1.0');
    expect(formatAmount(100000000n, 6)).toBe('100.0');
  });
});

describe('buildNativeTransfer', () => {
  it('builds correct transaction', () => {
    const tx = buildNativeTransfer(
      '0x1234567890123456789012345678901234567890',
      1000000000000000000n,
    );

    expect(tx.to).toBe('0x1234567890123456789012345678901234567890');
    expect(tx.value).toBe(1000000000000000000n);
    expect(tx.data).toBe('0x');
  });
});

describe('buildERC20Transfer', () => {
  it('builds correct ERC-20 transfer calldata', () => {
    const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    const to = '0x1234567890123456789012345678901234567890';
    const amount = 1000000n; // 1 USDT

    const tx = buildERC20Transfer(tokenAddr, to, amount);

    expect(tx.to).toBe(tokenAddr);
    expect(tx.value).toBe(0n);
    // Should start with transfer(address,uint256) selector = 0xa9059cbb
    expect(tx.data?.toString().startsWith('0xa9059cbb')).toBe(true);
    // Should contain the recipient address
    expect(tx.data?.toString().toLowerCase()).toContain(
      to.slice(2).toLowerCase(),
    );
  });
});
