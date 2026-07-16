import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BalanceCard } from '@/components/balances/BalanceCard';
import type { TokenBalance } from '@/types/api';

describe('BalanceCard token row hierarchy', () => {
  it('shows symbol primary and distinct full name secondary', () => {
    const balance: TokenBalance = {
      symbol: 'USDC',
      name: 'USD Coin',
      balance: '12.3456',
      decimals: 6,
      chain: 'ethereum',
    };

    render(<BalanceCard balance={balance} />);
    expect(screen.getAllByText('USDC').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('USD Coin')).toBeTruthy();
  });

  it('uses chain name for native assets instead of duplicate ticker', () => {
    const balance: TokenBalance = {
      symbol: 'ETH',
      name: 'ETH',
      balance: '0.0033',
      decimals: 18,
      chain: 'ethereum',
    };

    render(<BalanceCard balance={balance} />);
    expect(screen.getAllByText('ETH').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Ethereum')).toBeTruthy();
    expect(screen.getByText(/0\.0033/)).toBeTruthy();
  });

  it('does not show duplicate ticker in secondary label', () => {
    const balance: TokenBalance = {
      symbol: 'UNI',
      name: 'UNI',
      balance: '1.25',
      decimals: 18,
      contract_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      chain: 'ethereum',
    };

    render(<BalanceCard balance={balance} />);
    expect(screen.getAllByText('UNI')).toHaveLength(2);
  });
});
