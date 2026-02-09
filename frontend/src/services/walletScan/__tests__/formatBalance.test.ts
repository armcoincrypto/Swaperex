import { describe, it, expect } from 'vitest';

// The formatTokenBalance function is defined in WalletScan.tsx
// We extract it here for testing
function formatTokenBalance(balance: string): string {
  const num = parseFloat(balance);
  if (num === 0) return '0';
  if (num < 0.001) return '<0.001';
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  if (num < 1_000_000) return `${(num / 1000).toFixed(1)}K`;
  return `${(num / 1_000_000).toFixed(1)}M`;
}

describe('formatTokenBalance', () => {
  it('formats zero', () => {
    expect(formatTokenBalance('0')).toBe('0');
    expect(formatTokenBalance('0.0')).toBe('0');
  });

  it('formats dust amounts', () => {
    expect(formatTokenBalance('0.0000001')).toBe('<0.001');
    expect(formatTokenBalance('0.0009')).toBe('<0.001');
  });

  it('formats small amounts with 4 decimals', () => {
    expect(formatTokenBalance('0.001')).toBe('0.0010');
    expect(formatTokenBalance('0.5')).toBe('0.5000');
    expect(formatTokenBalance('0.9999')).toBe('0.9999');
  });

  it('formats medium amounts with 2 decimals', () => {
    expect(formatTokenBalance('1')).toBe('1.00');
    expect(formatTokenBalance('100.5')).toBe('100.50');
    expect(formatTokenBalance('999.99')).toBe('999.99');
  });

  it('formats thousands with K suffix', () => {
    expect(formatTokenBalance('1000')).toBe('1.0K');
    expect(formatTokenBalance('5500')).toBe('5.5K');
    expect(formatTokenBalance('999999')).toBe('1000.0K');
  });

  it('formats millions with M suffix', () => {
    expect(formatTokenBalance('1000000')).toBe('1.0M');
    expect(formatTokenBalance('2500000')).toBe('2.5M');
  });
});
