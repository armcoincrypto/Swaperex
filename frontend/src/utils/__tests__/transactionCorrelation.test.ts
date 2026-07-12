import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitSwapLifecycleStage } from '@/utils/swapLifecycleTelemetry';
import { lifecycleCorrelationWireFields } from '@/utils/transactionCorrelation';
import { logProductionEvent } from '@/utils/productionMonitoring';

vi.mock('@/utils/productionMonitoring', () => ({
  logProductionEvent: vi.fn(),
}));

describe('transaction correlation', () => {
  it('lifecycle wire fields alias flowId and swapFlowId', () => {
    const id = 'flow-test-123';
    expect(lifecycleCorrelationWireFields(id)).toEqual({
      flowId: id,
      swapFlowId: id,
    });
  });
});

describe('swapLifecycleTelemetry', () => {
  beforeEach(() => {
    vi.mocked(logProductionEvent).mockClear();
  });

  it('emits flowId and swapFlowId for backward compatibility', () => {
    const correlationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    emitSwapLifecycleStage({
      swapFlowId: correlationId,
      stage: 'quote_requested',
      chainId: 1,
    });

    expect(logProductionEvent).toHaveBeenCalledWith('swap_lifecycle', {
      flowId: correlationId,
      swapFlowId: correlationId,
      stage: 'quote_requested',
      chainId: 1,
    });
  });
});
