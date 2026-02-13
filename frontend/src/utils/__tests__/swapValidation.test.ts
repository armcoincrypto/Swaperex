import { describe, it, expect } from 'vitest';
import {
  validateSwapInputs,
  getButtonValidationState,
  isValidTokenAddress,
  isSameToken,
  parseAmount,
  isInsufficientBalance,
  isSlippageWarning,
  isSlippageDangerous,
  isSlippageTooLow,
} from '../swapValidation';
import { SUPPORTED_CHAIN_IDS, CHAIN_IDS } from '@/config/chains';

// ── Helpers ──────────────────────────────────────────────────────

function makeValidInput(overrides: Partial<Parameters<typeof validateSwapInputs>[0]> = {}) {
  return {
    isConnected: true,
    address: '0x0000000000000000000000000000000000000001',
    fromToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    toToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    fromAmount: '100',
    fromBalance: '1000',
    slippage: 0.5,
    chainId: 1,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('swapValidation', () => {
  // ─── Chain support: all declared chains must pass ──────────
  describe('multi-chain support', () => {
    const allChainIds = Object.values(CHAIN_IDS);

    it('SUPPORTED_CHAIN_IDS includes all declared CHAIN_IDS', () => {
      for (const id of allChainIds) {
        expect(SUPPORTED_CHAIN_IDS).toContain(id);
      }
    });

    it.each([
      ['Ethereum', 1],
      ['BSC', 56],
      ['Polygon', 137],
      ['Arbitrum', 42161],
      ['Optimism', 10],
      ['Avalanche', 43114],
      ['Gnosis', 100],
      ['Fantom', 250],
      ['Base', 8453],
    ] as const)('validates %s (chainId %d) as supported', (_name, chainId) => {
      const result = validateSwapInputs(makeValidInput({ chainId }));
      expect(result.errors).not.toContain('chain_not_supported');
    });

    it('rejects unsupported chain ID', () => {
      const result = validateSwapInputs(makeValidInput({ chainId: 999 }));
      expect(result.errors).toContain('chain_not_supported');
      expect(result.isValid).toBe(false);
    });

    it('error message lists supported network names dynamically', () => {
      const result = validateSwapInputs(makeValidInput({ chainId: 999 }));
      const chainMsg = result.messages.find(m => m.includes('supported network'));
      expect(chainMsg).toBeDefined();
      // Should contain at least Ethereum and BNB Chain
      expect(chainMsg).toContain('Ethereum');
      expect(chainMsg).toContain('BNB Chain');
    });

    it('null chainId skips chain validation', () => {
      const result = validateSwapInputs(makeValidInput({ chainId: null }));
      expect(result.errors).not.toContain('chain_not_supported');
    });
  });

  // ─── Button state also respects all chains ─────────────────
  describe('getButtonValidationState multi-chain', () => {
    it('returns enabled for all supported chains', () => {
      for (const chainId of Object.values(CHAIN_IDS)) {
        const state = getButtonValidationState(makeValidInput({ chainId }));
        expect(state.disabled).toBe(false);
        expect(state.text).toBe('Preview Swap');
      }
    });

    it('returns "Switch Network" for unsupported chain', () => {
      const state = getButtonValidationState(makeValidInput({ chainId: 31337 }));
      expect(state.disabled).toBe(true);
      expect(state.text).toBe('Switch Network');
    });
  });

  // ─── Core validation logic ─────────────────────────────────
  describe('validateSwapInputs', () => {
    it('passes with valid input', () => {
      const result = validateSwapInputs(makeValidInput());
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when wallet not connected', () => {
      const result = validateSwapInputs(makeValidInput({ isConnected: false, address: null }));
      expect(result.errors).toContain('wallet_not_connected');
    });

    it('fails for same token swap', () => {
      const sameAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      const result = validateSwapInputs(makeValidInput({ fromToken: sameAddr, toToken: sameAddr }));
      expect(result.errors).toContain('same_token');
    });

    it('fails for empty amount', () => {
      const result = validateSwapInputs(makeValidInput({ fromAmount: '' }));
      expect(result.errors).toContain('invalid_amount');
    });

    it('fails for zero amount', () => {
      const result = validateSwapInputs(makeValidInput({ fromAmount: '0' }));
      expect(result.errors).toContain('amount_zero');
    });

    it('fails for insufficient balance', () => {
      const result = validateSwapInputs(makeValidInput({ fromAmount: '2000', fromBalance: '1000' }));
      expect(result.errors).toContain('insufficient_balance');
    });

    it('fails for slippage too low', () => {
      const result = validateSwapInputs(makeValidInput({ slippage: 0.001 }));
      expect(result.errors).toContain('slippage_too_low');
    });

    it('fails for slippage too high', () => {
      const result = validateSwapInputs(makeValidInput({ slippage: 60 }));
      expect(result.errors).toContain('slippage_too_high');
    });
  });

  // ─── Helper functions ──────────────────────────────────────
  describe('isValidTokenAddress', () => {
    it('accepts native ETH address', () => {
      expect(isValidTokenAddress('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')).toBe(true);
    });

    it('accepts valid ERC20 address', () => {
      expect(isValidTokenAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')).toBe(true);
    });

    it('rejects empty string', () => {
      expect(isValidTokenAddress('')).toBe(false);
    });
  });

  describe('isSameToken', () => {
    it('detects same token case-insensitive', () => {
      expect(isSameToken('0xabc', '0xABC')).toBe(true);
    });

    it('returns false for null inputs', () => {
      expect(isSameToken(null, '0xabc')).toBe(false);
    });
  });

  describe('parseAmount', () => {
    it('parses valid amount', () => {
      expect(parseAmount('1.5')).toBe(1.5);
    });

    it('returns null for empty string', () => {
      expect(parseAmount('')).toBeNull();
    });

    it('returns null for negative', () => {
      expect(parseAmount('-1')).toBeNull();
    });
  });

  describe('isInsufficientBalance', () => {
    it('returns true when amount exceeds balance', () => {
      expect(isInsufficientBalance('100', '50')).toBe(true);
    });

    it('returns false when balance is sufficient', () => {
      expect(isInsufficientBalance('50', '100')).toBe(false);
    });
  });

  describe('slippage helpers', () => {
    it('isSlippageWarning is true for 5-50%', () => {
      expect(isSlippageWarning(5)).toBe(true);
      expect(isSlippageWarning(3)).toBe(false);
    });

    it('isSlippageDangerous is true above 10%', () => {
      expect(isSlippageDangerous(11)).toBe(true);
      expect(isSlippageDangerous(9)).toBe(false);
    });

    it('isSlippageTooLow is true below 0.1%', () => {
      expect(isSlippageTooLow(0.05)).toBe(true);
      expect(isSlippageTooLow(0.5)).toBe(false);
    });
  });
});
