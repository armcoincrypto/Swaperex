import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the signal modules before importing api
vi.mock('../signals/liquidity.js', () => ({
  checkLiquidityDrop: vi.fn(),
}));

vi.mock('../signals/risk.js', () => ({
  checkRiskChange: vi.fn(),
}));

import { getSignals } from '../api.js';
import { checkLiquidityDrop } from '../signals/liquidity.js';
import { checkRiskChange } from '../signals/risk.js';

const mockLiquidity = vi.mocked(checkLiquidityDrop);
const mockRisk = vi.mocked(checkRiskChange);

// Helper to create a liquidity result
function makeLiquidityResult(signal: any = null, debug: any = null) {
  return {
    signal,
    debug: debug || {
      check: { passed: false, currentLiquidity: null, previousLiquidity: null, dropPct: null, threshold: 30, reason: 'test' },
      cooldown: { active: false, remainingSeconds: 0, startedAt: null, expiresAt: null, lastSeverity: null },
    },
  };
}

// Helper to create a risk result
function makeRiskResult(signal: any = null, debug: any = null) {
  return {
    signal,
    debug: debug || {
      check: { passed: false, riskFactorCount: 0, riskFactors: [], isHoneypot: false, reason: 'test' },
      cooldown: { active: false, remainingSeconds: 0, startedAt: null, expiresAt: null, lastSeverity: null },
    },
  };
}

describe('api - getSignals orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns safe when no signals detected', async () => {
    mockLiquidity.mockResolvedValue(makeLiquidityResult());
    mockRisk.mockResolvedValue(makeRiskResult());

    const result = await getSignals(1, '0xtest');

    expect(result.overallSeverity).toBe('safe');
    expect(result.liquidity).toBeUndefined();
    expect(result.risk).toBeUndefined();
    expect(result.providers.dexscreener.status).toBe('ok');
    expect(result.providers.goplus.status).toBe('ok');
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('includes liquidity signal when detected', async () => {
    const signal = {
      dropPct: 45,
      window: '10m',
      severity: 'danger' as const,
      confidence: 0.75,
      impact: { score: 65, level: 'medium' as const, reason: 'test' },
      recurrence: { occurrences24h: 1, lastSeen: null, isRepeat: false, trend: 'new' as const, previousImpact: null, timeSinceLastSeconds: null },
    };
    mockLiquidity.mockResolvedValue(makeLiquidityResult(signal));
    mockRisk.mockResolvedValue(makeRiskResult());

    const result = await getSignals(1, '0xtest');

    expect(result.overallSeverity).toBe('danger');
    expect(result.liquidity).toBeDefined();
    expect(result.liquidity!.dropPct).toBe(45);
    expect(result.risk).toBeUndefined();
  });

  it('includes risk signal when detected', async () => {
    const signal = {
      status: 'warning' as const,
      severity: 'warning' as const,
      confidence: 0.6,
      riskFactors: ['proxy_contract'],
      impact: { score: 35, level: 'low' as const, reason: 'test' },
      recurrence: { occurrences24h: 1, lastSeen: null, isRepeat: false, trend: 'new' as const, previousImpact: null, timeSinceLastSeconds: null },
    };
    mockLiquidity.mockResolvedValue(makeLiquidityResult());
    mockRisk.mockResolvedValue(makeRiskResult(signal));

    const result = await getSignals(1, '0xtest');

    expect(result.overallSeverity).toBe('warning');
    expect(result.risk).toBeDefined();
    expect(result.risk!.riskFactors).toContain('proxy_contract');
  });

  it('picks worst severity when both signals fire', async () => {
    const liqSignal = {
      dropPct: 50,
      window: '10m',
      severity: 'danger' as const,
      confidence: 0.7,
      impact: { score: 60, level: 'medium' as const, reason: 'test' },
      recurrence: { occurrences24h: 1, lastSeen: null, isRepeat: false, trend: 'new' as const, previousImpact: null, timeSinceLastSeconds: null },
    };
    const riskSignal = {
      status: 'critical' as const,
      severity: 'critical' as const,
      confidence: 0.9,
      riskFactors: ['honeypot'],
      impact: { score: 90, level: 'high' as const, reason: 'test' },
      recurrence: { occurrences24h: 1, lastSeen: null, isRepeat: false, trend: 'new' as const, previousImpact: null, timeSinceLastSeconds: null },
    };

    mockLiquidity.mockResolvedValue(makeLiquidityResult(liqSignal));
    mockRisk.mockResolvedValue(makeRiskResult(riskSignal));

    const result = await getSignals(1, '0xtest');

    expect(result.overallSeverity).toBe('critical');
    expect(result.liquidity).toBeDefined();
    expect(result.risk).toBeDefined();
  });

  it('handles DexScreener failure gracefully', async () => {
    mockLiquidity.mockRejectedValue(new Error('DexScreener API down'));
    mockRisk.mockResolvedValue(makeRiskResult());

    const result = await getSignals(1, '0xtest');

    expect(result.providers.dexscreener.status).not.toBe('ok');
    expect(result.providers.goplus.status).toBe('ok');
    // Should still return a valid response
    expect(result.overallSeverity).toBe('safe');
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('handles GoPlus failure gracefully', async () => {
    mockLiquidity.mockResolvedValue(makeLiquidityResult());
    mockRisk.mockRejectedValue(new Error('GoPlus timeout'));

    const result = await getSignals(1, '0xtest');

    expect(result.providers.dexscreener.status).toBe('ok');
    expect(result.providers.goplus.status).not.toBe('ok');
    expect(result.overallSeverity).toBe('safe');
  });

  it('handles both providers failing gracefully', async () => {
    mockLiquidity.mockRejectedValue(new Error('Network error'));
    mockRisk.mockRejectedValue(new Error('Network error'));

    const result = await getSignals(1, '0xtest');

    expect(result.providers.dexscreener.status).not.toBe('ok');
    expect(result.providers.goplus.status).not.toBe('ok');
    expect(result.overallSeverity).toBe('safe');
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('includes debug data when requested', async () => {
    mockLiquidity.mockResolvedValue(makeLiquidityResult());
    mockRisk.mockResolvedValue(makeRiskResult());

    const result = await getSignals(1, '0xtest', true);

    expect(result.debug).toBeDefined();
    expect(result.debug!.version).toBe('2.0.0');
    expect(result.debug!.evaluatedAt).toBeGreaterThan(0);
  });

  it('omits debug data when not requested', async () => {
    mockLiquidity.mockResolvedValue(makeLiquidityResult());
    mockRisk.mockResolvedValue(makeRiskResult());

    const result = await getSignals(1, '0xtest', false);

    expect(result.debug).toBeUndefined();
  });

  it('tracks provider latency', async () => {
    mockLiquidity.mockResolvedValue(makeLiquidityResult());
    mockRisk.mockResolvedValue(makeRiskResult());

    const result = await getSignals(1, '0xtest');

    expect(result.providers.dexscreener.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.providers.goplus.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
