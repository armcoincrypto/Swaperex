import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { HomepagePopularRoutes } from '@/components/homepage/HomepagePopularRoutes';
import {
  listExecutableHomepageRouteChips,
  listHomepagePopularRouteChips,
  resolveHomepageRouteChip,
} from '@/utils/homepageRouteChips';
import { buildCertifiedDirectionalSwapNavigation } from '@/utils/swapAvailability';
import { isCommissionRouteCertified } from '@/utils/commissionRoutePolicy';
import { parseSwapSearchParams } from '@/utils/swapUrlState';
import type { PopularCommissionRoute } from '@/constants/popularCommissionRoutes';
import type { ReactElement } from 'react';

function wrap(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('homepage popular route chips', () => {
  it('resolves every verified popular route as executable with certified navigation', () => {
    const chips = listHomepagePopularRouteChips();
    expect(chips.length).toBeGreaterThan(0);
    const executable = listExecutableHomepageRouteChips();
    expect(executable.length).toBe(chips.length);

    for (const chip of executable) {
      expect(chip.mode).toBe('executable');
      expect(chip.search).toBeTruthy();
      expect(
        isCommissionRouteCertified({
          chainId: chip.chainId,
          tokenIn: chip.tokenIn,
          tokenOut: chip.tokenOut,
        }),
      ).toBe(true);
      expect(chip.tokenIn === 'WBNB' || chip.tokenOut === 'WBNB').toBe(false);
      expect([1, 56]).toContain(chip.chainId);

      const parsed = parseSwapSearchParams(`?${chip.search}`);
      expect(parsed.params.chain).toBe(chip.chainId);
      expect(parsed.params.from).toBe(chip.tokenIn);
      expect(parsed.params.to).toBe(chip.tokenOut);
      expect(parsed.rejected).toHaveLength(0);
    }
  });

  it('builds certified Ethereum and BNB directional URLs', () => {
    const eth = buildCertifiedDirectionalSwapNavigation({
      chainId: 1,
      tokenIn: 'ETH',
      tokenOut: 'USDT',
    });
    expect(eth).toEqual({
      chainId: 1,
      fromSymbol: 'ETH',
      toSymbol: 'USDT',
      search: expect.stringContaining('chain=1'),
    });
    expect(eth!.search).toContain('from=ETH');
    expect(eth!.search).toContain('to=USDT');

    const bnb = buildCertifiedDirectionalSwapNavigation({
      chainId: 56,
      tokenIn: 'BNB',
      tokenOut: 'USDT',
    });
    expect(bnb?.fromSymbol).toBe('BNB');
    expect(bnb?.toSymbol).toBe('USDT');
    expect(bnb?.search).toContain('from=BNB');
    expect(bnb?.search).not.toContain('WBNB');
  });

  it('does not build navigation for WBNB, PEPE, wrap, or view-only chains', () => {
    expect(
      buildCertifiedDirectionalSwapNavigation({
        chainId: 56,
        tokenIn: 'WBNB',
        tokenOut: 'USDT',
      }),
    ).toBeNull();
    expect(
      buildCertifiedDirectionalSwapNavigation({
        chainId: 1,
        tokenIn: 'PEPE',
        tokenOut: 'WETH',
      }),
    ).toBeNull();
    expect(
      buildCertifiedDirectionalSwapNavigation({
        chainId: 1,
        tokenIn: 'ETH',
        tokenOut: 'WETH',
      }),
    ).toBeNull();
    expect(
      buildCertifiedDirectionalSwapNavigation({
        chainId: 137,
        tokenIn: 'MATIC',
        tokenOut: 'USDC',
      }),
    ).toBeNull();
  });

  it('renders certified chips as links and informational chips as spans', () => {
    wrap(<HomepagePopularRoutes activeChainId={1} />);

    const ethUsdt = screen.getByRole('link', { name: /Swap ETH to USDT on Ethereum/i });
    expect(ethUsdt.getAttribute('href')).toContain('/swap?');
    expect(ethUsdt.getAttribute('href')).toContain('from=ETH');
    expect(ethUsdt.getAttribute('href')).toContain('to=USDT');
    expect(ethUsdt.getAttribute('href')).toContain('chain=1');

    const bnbUsdt = screen.getByRole('link', { name: /Swap BNB to USDT on BNB Chain/i });
    expect(bnbUsdt.getAttribute('href')).toContain('from=BNB');
    expect(bnbUsdt.getAttribute('href')).not.toContain('WBNB');

    expect(document.querySelectorAll('a.homepage-route-chip--action').length).toBeGreaterThan(0);
    // No interactive styling on informational spans when present
    document.querySelectorAll('span.homepage-route-chip--info').forEach((el) => {
      expect(el.getAttribute('role')).toBeNull();
      expect(el.getAttribute('tabindex')).toBeNull();
    });
  });

  it('marks uncertified catalog entries informational', () => {
    const fake: PopularCommissionRoute = {
      chainId: 1,
      chainLabel: 'Ethereum',
      fromSymbol: 'PEPE',
      toSymbol: 'WETH',
      label: 'PEPE ⇄ WETH',
      bidirectional: true,
    };
    const chip = resolveHomepageRouteChip(fake);
    expect(chip.mode).toBe('informational');
    expect(chip.search).toBeUndefined();
  });
});
