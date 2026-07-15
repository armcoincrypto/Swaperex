/**
 * P19 — Layout contract: primary wallet action must not share the top bar with
 * the mobile command nav (which previously pushed Connect off-screen).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const shellPath = path.resolve(__dirname, '../TradeShell.tsx');
const walletPath = path.resolve(__dirname, '../../wallet/WalletConnect.tsx');

describe('TradeShell mobile wallet layout contract (P19)', () => {
  const shell = fs.readFileSync(shellPath, 'utf8');
  const wallet = fs.readFileSync(walletPath, 'utf8');

  it('does not render inline mobile page nav in the sticky header', () => {
    expect(shell).not.toMatch(/Mobile nav — compact command center/);
    expect(shell).toMatch(/Primary mobile/);
    expect(shell).toMatch(/sm:hidden fixed bottom-0/);
  });

  it('keeps wallet cluster shrink-0 in the header', () => {
    expect(shell).toMatch(/shrink-0[\s\S]{0,120}NetworkSelector/);
    expect(shell).toMatch(/LazyWalletConnect/);
  });

  it('uses compact Connect label and mobile-safe WalletConnect copy', () => {
    expect(wallet).toMatch(/sm:hidden">Connect</);
    expect(wallet).toMatch(/Open your wallet app or use QR on another device/);
    expect(wallet).toMatch(/Approve in your wallet app/);
    expect(wallet).toMatch(/aria-label="Connect Wallet"/);
  });
});
