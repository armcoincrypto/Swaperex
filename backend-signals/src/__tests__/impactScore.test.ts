import { describe, it, expect } from 'vitest';
import {
  calculateLiquidityImpact,
  calculateRiskImpact,
  getImpactLevel,
} from '../scoring/impactScore.js';

describe('impactScore', () => {
  describe('getImpactLevel', () => {
    it('returns high for scores >= 70', () => {
      expect(getImpactLevel(70)).toBe('high');
      expect(getImpactLevel(100)).toBe('high');
    });

    it('returns medium for scores 40-69', () => {
      expect(getImpactLevel(40)).toBe('medium');
      expect(getImpactLevel(69)).toBe('medium');
    });

    it('returns low for scores < 40', () => {
      expect(getImpactLevel(0)).toBe('low');
      expect(getImpactLevel(39)).toBe('low');
    });
  });

  describe('calculateLiquidityImpact', () => {
    it('scores massive drops (>=70%) as high impact', () => {
      const result = calculateLiquidityImpact(75, 'critical', 0.9, 500_000);
      expect(result.level).toBe('high');
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('scores moderate drops (30-35%) lower than massive', () => {
      const moderate = calculateLiquidityImpact(32, 'warning', 0.6);
      const massive = calculateLiquidityImpact(75, 'critical', 0.9);
      expect(moderate.score).toBeLessThan(massive.score);
      expect(moderate.score).toBeLessThan(70);
    });

    it('includes liquidity size factor', () => {
      const small = calculateLiquidityImpact(50, 'danger', 0.7, 5_000);
      const large = calculateLiquidityImpact(50, 'danger', 0.7, 1_500_000);
      expect(large.score).toBeGreaterThan(small.score);
    });

    it('caps score at 100', () => {
      const result = calculateLiquidityImpact(90, 'critical', 0.95, 2_000_000);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('never returns negative score', () => {
      const result = calculateLiquidityImpact(0, 'warning', 0);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('includes reason text', () => {
      const result = calculateLiquidityImpact(50, 'danger', 0.7);
      expect(result.reason).toContain('50%');
    });
  });

  describe('calculateRiskImpact', () => {
    it('scores honeypot as high impact', () => {
      const result = calculateRiskImpact(1, true, 'critical', 0.9, ['honeypot']);
      expect(result.level).toBe('high');
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.reason).toContain('Honeypot');
    });

    it('scores many risk factors as high', () => {
      const factors = ['blacklisted', 'proxy_contract', 'mintable', 'transfer_pausable', 'hidden_owner'];
      const result = calculateRiskImpact(5, false, 'critical', 0.8, factors);
      expect(result.level).toBe('high');
    });

    it('scores single low-risk factor as low-medium', () => {
      const result = calculateRiskImpact(1, false, 'warning', 0.5, ['is_anti_whale']);
      expect(result.score).toBeLessThan(70);
    });

    it('adds critical factor bonus', () => {
      const withCritical = calculateRiskImpact(1, false, 'warning', 0.5, ['can_selfdestruct']);
      const withNormal = calculateRiskImpact(1, false, 'warning', 0.5, ['is_anti_whale']);
      expect(withCritical.score).toBeGreaterThan(withNormal.score);
    });

    it('caps score at 100', () => {
      const result = calculateRiskImpact(10, true, 'critical', 0.95, [
        'honeypot', 'blacklisted', 'can_selfdestruct', 'owner_can_modify_balance',
        'hidden_owner', 'mintable', 'proxy_contract', 'transfer_pausable',
        'trading_cooldown', 'slippage_modifiable',
      ]);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});
