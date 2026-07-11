import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UnsupportedSwapNetworkExperience } from '../UnsupportedSwapNetworkExperience';

describe('UnsupportedSwapNetworkExperience', () => {
  it('renders Polygon unsupported swap state without execution controls', () => {
    render(
      <MemoryRouter>
        <UnsupportedSwapNetworkExperience chainId={137} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByText(/Swap unavailable on this network/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Polygon — balances, send & portfolio only/i })).toBeInTheDocument();
    expect(screen.getByText(/^Unavailable$/)).toBeInTheDocument();
    expect(screen.getByText(/Switch to Ethereum and BNB Chain to swap/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Swap$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Why only some networks support swaps/i })).toHaveAttribute(
      'href',
      '/trust',
    );
  });

  it('offers swap-enabled network recovery actions when handler provided', () => {
    const onSwitch = vi.fn();
    render(
      <MemoryRouter>
        <UnsupportedSwapNetworkExperience chainId={137} onSwitchToSwapChain={onSwitch} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Ethereum' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BNB Chain' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Swap$/i })).not.toBeInTheDocument();
  });
});
