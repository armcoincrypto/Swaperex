import { describe, it, expect } from 'vitest';
import { shouldShowSignal } from '../signalFilterStore';

describe('signalFilterStore', () => {
  describe('shouldShowSignal', () => {
    const defaultFilters = {
      impactFilter: 'high+medium' as const,
      minConfidence: 60,
      showLiquidity: true,
      showRisk: true,
    };

    it('shows high-impact risk signal with default filters', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8, impact: { level: 'high', score: 85 } },
        defaultFilters
      )).toBe(true);
    });

    it('shows medium-impact liquidity signal with default filters', () => {
      expect(shouldShowSignal(
        { type: 'liquidity', confidence: 0.7, impact: { level: 'medium', score: 55 } },
        defaultFilters
      )).toBe(true);
    });

    it('hides low-impact signal with default filters (high+medium)', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8, impact: { level: 'low', score: 20 } },
        defaultFilters
      )).toBe(false);
    });

    it('hides signal below confidence threshold', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.5, impact: { level: 'high', score: 85 } },
        defaultFilters
      )).toBe(false);
    });

    it('hides liquidity signal when showLiquidity is false', () => {
      expect(shouldShowSignal(
        { type: 'liquidity', confidence: 0.9, impact: { level: 'high', score: 90 } },
        { ...defaultFilters, showLiquidity: false }
      )).toBe(false);
    });

    it('hides risk signal when showRisk is false', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.9, impact: { level: 'high', score: 90 } },
        { ...defaultFilters, showRisk: false }
      )).toBe(false);
    });

    it('shows all impacts when filter is set to all', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8, impact: { level: 'low', score: 20 } },
        { ...defaultFilters, impactFilter: 'all' }
      )).toBe(true);
    });

    it('shows only high when filter is set to high', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8, impact: { level: 'medium', score: 50 } },
        { ...defaultFilters, impactFilter: 'high' }
      )).toBe(false);

      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8, impact: { level: 'high', score: 80 } },
        { ...defaultFilters, impactFilter: 'high' }
      )).toBe(true);
    });

    it('handles signal without impact gracefully', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8 },
        defaultFilters
      )).toBe(true);
    });
  });
});
