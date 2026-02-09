import { describe, it, expect } from 'vitest';
import {
  SEVERITY_EXPLANATIONS,
  RISK_FACTOR_EXPLANATIONS,
  LIQUIDITY_EXPLANATIONS,
} from '../signalsHealth';

describe('signalsHealth', () => {
  describe('SEVERITY_EXPLANATIONS', () => {
    it('has explanations for all severity levels', () => {
      expect(SEVERITY_EXPLANATIONS.critical).toBeTruthy();
      expect(SEVERITY_EXPLANATIONS.danger).toBeTruthy();
      expect(SEVERITY_EXPLANATIONS.warning).toBeTruthy();
      expect(SEVERITY_EXPLANATIONS.safe).toBeTruthy();
    });

    it('explanations are human-readable (non-empty strings)', () => {
      Object.values(SEVERITY_EXPLANATIONS).forEach(explanation => {
        expect(explanation.length).toBeGreaterThan(20);
      });
    });
  });

  describe('RISK_FACTOR_EXPLANATIONS', () => {
    it('has explanations for critical risk factors', () => {
      expect(RISK_FACTOR_EXPLANATIONS.honeypot).toBeTruthy();
      expect(RISK_FACTOR_EXPLANATIONS.blacklisted).toBeTruthy();
      expect(RISK_FACTOR_EXPLANATIONS.can_selfdestruct).toBeTruthy();
      expect(RISK_FACTOR_EXPLANATIONS.hidden_owner).toBeTruthy();
    });

    it('honeypot explanation mentions fund loss', () => {
      expect(RISK_FACTOR_EXPLANATIONS.honeypot.toLowerCase()).toContain('sold');
    });

    it('all explanations are non-empty', () => {
      Object.values(RISK_FACTOR_EXPLANATIONS).forEach(explanation => {
        expect(explanation.length).toBeGreaterThan(10);
      });
    });
  });

  describe('LIQUIDITY_EXPLANATIONS', () => {
    it('has explanations for all liquidity severities', () => {
      expect(LIQUIDITY_EXPLANATIONS.critical).toBeTruthy();
      expect(LIQUIDITY_EXPLANATIONS.danger).toBeTruthy();
      expect(LIQUIDITY_EXPLANATIONS.warning).toBeTruthy();
    });

    it('critical explanation mentions rug pull', () => {
      expect(LIQUIDITY_EXPLANATIONS.critical.toLowerCase()).toContain('rug pull');
    });
  });
});
