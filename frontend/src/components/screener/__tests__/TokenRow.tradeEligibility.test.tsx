import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenRow } from '@/components/screener/TokenRow';
import type { ScreenerToken } from '@/services/screener/types';

function makeToken(overrides: Partial<ScreenerToken> = {}): ScreenerToken {
  return {
    id: 'test',
    symbol: 'TEST',
    name: 'Test Token',
    currentPrice: 1,
    priceChange24h: 0,
    volume24h: 1000,
    marketCap: 10000,
    chainId: 1,
    ...overrides,
  };
}

describe('P20.2 markets trade action eligibility', () => {
  it('shows Trade for swap-enabled Ethereum tokens', () => {
    render(
      <TokenRow
        token={makeToken({ chainId: 1 })}
        isAdvanced={false}
        isExpanded={false}
        onToggleExpand={() => undefined}
        onSwap={() => undefined}
      />,
    );
    expect(screen.getByText('Trade')).toBeTruthy();
  });

  it('shows View only for Arbitrum market-data tokens', () => {
    render(
      <TokenRow
        token={makeToken({ chainId: 42161, symbol: 'ARB', name: 'Arbitrum' })}
        isAdvanced={false}
        isExpanded={false}
        onToggleExpand={() => undefined}
        onSwap={() => undefined}
      />,
    );
    expect(screen.getByText('View only')).toBeTruthy();
    expect(screen.queryByText('Trade')).toBeNull();
  });

  it('shows View only for Polygon market-data tokens', () => {
    render(
      <TokenRow
        token={makeToken({ chainId: 137, symbol: 'MATIC', name: 'Polygon' })}
        isAdvanced={false}
        isExpanded={false}
        onToggleExpand={() => undefined}
        onSwap={() => undefined}
      />,
    );
    expect(screen.getByText('View only')).toBeTruthy();
  });
});
