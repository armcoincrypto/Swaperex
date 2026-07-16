import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BalanceCard } from '@/components/balances/BalanceCard';
import type { TokenBalance } from '@/types/api';

describe('P20.2 token row spacing', () => {
  it('separates balance and unit for accessible reading', () => {
    const balance: TokenBalance = {
      symbol: 'USDC',
      name: 'USD Coin',
      balance: '1.1307',
      decimals: 6,
      chain: 'ethereum',
    };
    render(<BalanceCard balance={balance} />);
    const labeled = screen.getByLabelText('1.1307 USDC');
    expect(labeled).toBeTruthy();
    expect(labeled.className).toMatch(/gap-1/);
  });
});
