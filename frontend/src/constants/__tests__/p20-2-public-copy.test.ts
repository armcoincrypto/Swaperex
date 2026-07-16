import { describe, expect, it } from 'vitest';
import { SWAP_CTA_STATES } from '@/constants/swapCtaStates';
import {
  getTransactionLifecycleSpec,
  resolveSwapLifecycle,
} from '@/constants/transactionLifecycle';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';

describe('P20.2 public trade empty-state copy', () => {
  it('does not expose raw validation strings in CTA reasons', () => {
    expect(SWAP_CTA_STATES.enter_amount.reason).not.toMatch(/empty or zero/i);
    expect(SWAP_CTA_STATES.enter_amount.reason).toBe('Enter an amount');
    expect(SWAP_CTA_STATES.choose_token.reason).not.toMatch(/commission routing/i);
  });

  it('uses connected idle copy without Connect wallet instruction', () => {
    const idle = resolveSwapLifecycle({
      status: 'idle',
      hasQuote: false,
      isQuoteExpired: false,
      isConnected: true,
    });
    expect(idle.title).toBe('Enter an amount');
    expect(idle.description.toLowerCase()).not.toContain('connect your wallet');
  });

  it('uses disconnected idle copy only when disconnected', () => {
    const idle = getTransactionLifecycleSpec('idle', { isConnected: false });
    expect(idle.title).toBe('Connect your wallet to begin');
    expect(idle.description).toMatch(/after connecting/i);
  });

  it('keeps P20 empty-state glossary strings', () => {
    expect(SWAP_SURFACE_COPY.emptyStateConnectedNoAmountTitle).toBe('Enter an amount');
    expect(SWAP_SURFACE_COPY.unsupportedCommissionRouteTitle).not.toMatch(/commission routing/i);
  });
});
