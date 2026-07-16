/**
 * P20 — Brand logo contract and home navigation semantics.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import fs from 'node:fs';
import path from 'node:path';

describe('BrandLogo (P20)', () => {
  it('renders accessible Kobbex home control', () => {
    render(
      <MemoryRouter>
        <BrandLogo />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Kobbex home' })).toBeTruthy();
    expect(screen.getByText('Kobbex')).toBeTruthy();
  });

  it('does not render Swaperex or the "by Kobbex" byline', () => {
    render(
      <MemoryRouter>
        <BrandLogo />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Swaperex')).toBeNull();
    expect(screen.queryByText(/by Kobbex/i)).toBeNull();
  });

  it('invokes onNavigateHome without disconnect semantics', () => {
    const onNavigateHome = vi.fn();
    render(
      <MemoryRouter>
        <BrandLogo onNavigateHome={onNavigateHome} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kobbex home' }));
    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });
});

describe('P20 copy / hierarchy contracts', () => {
  it('uses concise empty-state CTA copy', () => {
    expect(SWAP_SURFACE_COPY.emptyStateCtaEnterAmount).toBe('Enter an Amount');
    expect(SWAP_SURFACE_COPY.emptyStateDisconnectedTitle).toMatch(/Connect your wallet/i);
  });

  it('TradeShell uses BrandLogo and footer Product columns', () => {
    const shell = fs.readFileSync(
      path.resolve(__dirname, '../../layout/TradeShell.tsx'),
      'utf8',
    );
    const footer = fs.readFileSync(
      path.resolve(__dirname, '../../layout/DexSiteFooter.tsx'),
      'utf8',
    );
    expect(shell).toMatch(/BrandLogo/);
    expect(shell).toMatch(/goBrandHome/);
    expect(footer).toMatch(/BrandLogo/);
    expect(footer).toMatch(/title="Product"/);
    expect(footer).not.toMatch(/Balance view:/);
  });

  it('SwapExecutionRail does not use dash as step number', () => {
    const rail = fs.readFileSync(
      path.resolve(__dirname, '../../swap/SwapExecutionRail.tsx'),
      'utf8',
    );
    expect(rail).toMatch(/Not required/);
    expect(rail).not.toMatch(/skipped' \? '—'/);
  });
});
