import { describe, it, expect } from 'vitest';
import { parseUnits } from 'ethers';

/**
 * Allowance Precision Tests
 *
 * Verifies that the parseUnits approach (used in useSwap.ts) correctly handles
 * large wei amounts without float rounding errors that parseFloat would cause.
 */
describe('allowance precision (parseUnits vs parseFloat)', () => {
  // ─── Demonstrate the parseFloat bug ───────────────────────
  describe('parseFloat precision loss (the bug we fixed)', () => {
    it('parseFloat loses precision on large 18-decimal values', () => {
      // 123456789.123456789012345678 USDT (18 decimals)
      const humanAmount = '123456789.123456789012345678';
      const decimals = 18;

      // OLD (buggy): parseFloat * 10^18
      const buggyWei = (parseFloat(humanAmount) * 10 ** decimals).toString();

      // NEW (correct): parseUnits
      const correctWei = parseUnits(humanAmount, decimals).toString();

      // parseFloat produces a rounded/inaccurate value
      // parseUnits produces the exact value
      // These will NOT be equal because parseFloat loses precision
      expect(buggyWei).not.toBe(correctWei);
    });

    it('parseFloat is fine for small amounts (but we use parseUnits everywhere now)', () => {
      const smallAmount = '1.5';
      const decimals = 18;

      const buggyWei = BigInt(Math.round(parseFloat(smallAmount) * 10 ** decimals)).toString();
      const correctWei = parseUnits(smallAmount, decimals).toString();

      // For small amounts both work, but we use parseUnits for consistency
      expect(correctWei).toBe('1500000000000000000');
      // Note: buggyWei may or may not match depending on float representation
    });
  });

  // ─── parseUnits correctness ───────────────────────────────
  describe('parseUnits handles all cases correctly', () => {
    it('handles standard 18-decimal token amount', () => {
      const wei = parseUnits('1.0', 18);
      expect(wei.toString()).toBe('1000000000000000000');
    });

    it('handles 6-decimal token amount (USDT/USDC)', () => {
      const wei = parseUnits('1000000.123456', 6);
      expect(wei.toString()).toBe('1000000123456');
    });

    it('handles very large amounts without precision loss', () => {
      const wei = parseUnits('999999999.999999999999999999', 18);
      expect(wei.toString()).toBe('999999999999999999999999999');
    });

    it('handles whole number (no decimal point)', () => {
      const amount = '1000';
      // When amountIn has no decimal, we use BigInt directly
      const wei = amount.includes('.') ? parseUnits(amount, 18) : BigInt(amount);
      expect(wei.toString()).toBe('1000');
    });

    it('handles amountIn already in wei (no dot)', () => {
      // When quote.amountIn is already in wei (e.g., from 1inch)
      const amountInWei = '1500000000000000000';
      const result = amountInWei.includes('.')
        ? parseUnits(amountInWei, 18)
        : BigInt(amountInWei);
      expect(result.toString()).toBe('1500000000000000000');
    });

    it('BigInt comparison works correctly for allowance checks', () => {
      const allowance = BigInt('1000000000000000000'); // 1 token
      const required = parseUnits('0.5', 18);          // 0.5 tokens

      expect(allowance >= required).toBe(true);
    });

    it('BigInt comparison detects insufficient allowance', () => {
      const allowance = BigInt('500000000000000000');   // 0.5 tokens
      const required = parseUnits('1.0', 18);           // 1.0 tokens

      expect(allowance >= required).toBe(false);
    });
  });
});
