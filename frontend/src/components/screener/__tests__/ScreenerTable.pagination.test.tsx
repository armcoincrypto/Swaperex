import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScreenerTable } from '@/components/screener/ScreenerTable';
import type { ScreenerToken } from '@/services/screener/types';

function makeToken(i: number): ScreenerToken {
  return {
    id: `t-${i}`,
    symbol: `T${i}`,
    name: `Token ${i}`,
    currentPrice: 1,
    priceChange24h: 0,
    volume24h: 1000,
    marketCap: 10000 + i,
    chainId: 1,
  };
}

describe('P20.2 markets bounded table', () => {
  it('renders at most 40 rows initially with Show more', () => {
    const tokens = Array.from({ length: 80 }, (_, i) => makeToken(i));
    render(
      <ScreenerTable
        tokens={tokens}
        isAdvanced={false}
        sortField="marketCap"
        sortDir="desc"
        expandedTokenId={null}
        onSort={() => undefined}
        onToggleExpand={() => undefined}
        onSwap={() => undefined}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/Showing 1–40 of 80/)).toBeTruthy();
    expect(screen.getByText('Show more')).toBeTruthy();
  });
});
