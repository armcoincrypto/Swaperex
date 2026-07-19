import { describe, expect, it } from 'vitest';
import {
  assertHarnessCannotActivateInProduction,
  createKobbexTestWallet,
  ERC20_APPROVE_SELECTOR,
  isForbiddenDirectRouter,
  isKobbexWrapper,
  isWalletHarnessActivationAllowed,
  KOBBEX_WRAPPERS,
  resolveWalletTestMode,
  TEST_WALLET_FAKE_ACCOUNTS,
} from '@/testing/walletHarness';

describe('P21.4 wallet harness activation guards', () => {
  it('cannot activate in production even with all other flags set', () => {
    expect(
      isWalletHarnessActivationAllowed({
        mode: 'production',
        viteEnableTestWallet: 'true',
        hostname: '127.0.0.1',
        isTestRunner: true,
        prod: true,
      }),
    ).toBe(false);
    expect(() => assertHarnessCannotActivateInProduction()).not.toThrow();
  });

  it('requires non-production mode, explicit flag, test runner, and localhost', () => {
    expect(
      isWalletHarnessActivationAllowed({
        mode: 'test',
        viteEnableTestWallet: 'true',
        hostname: '127.0.0.1',
        isTestRunner: true,
      }),
    ).toBe(true);
    expect(
      isWalletHarnessActivationAllowed({
        mode: 'test',
        viteEnableTestWallet: 'true',
        hostname: 'dex.kobbex.com',
        isTestRunner: true,
      }),
    ).toBe(false);
    expect(
      isWalletHarnessActivationAllowed({
        mode: 'test',
        viteEnableTestWallet: 'false',
        hostname: '127.0.0.1',
        isTestRunner: true,
      }),
    ).toBe(false);
    expect(
      isWalletHarnessActivationAllowed({
        mode: 'test',
        viteEnableTestWallet: 'true',
        hostname: '127.0.0.1',
        isTestRunner: false,
      }),
    ).toBe(false);
  });

  it('defaults wallet test mode to no_broadcast', () => {
    expect(resolveWalletTestMode(undefined)).toBe('no_broadcast');
    expect(resolveWalletTestMode('')).toBe('no_broadcast');
    expect(resolveWalletTestMode('no_broadcast')).toBe('no_broadcast');
    expect(resolveWalletTestMode('simulated_receipt')).toBe('simulated_receipt');
  });
});

describe('P21.4 no-broadcast EIP-1193 harness', () => {
  it('intercepts eth_sendTransaction and never broadcasts by default', async () => {
    const wallet = createKobbexTestWallet({
      account: TEST_WALLET_FAKE_ACCOUNTS[0],
      chainId: 1,
    });
    await expect(
      wallet.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: TEST_WALLET_FAKE_ACCOUNTS[0],
            to: KOBBEX_WRAPPERS.ethV2,
            value: '0x1',
            data: '0x1234',
          },
        ],
      }),
    ).rejects.toThrow(/NO_BROADCAST_BLOCKED/);

    expect(wallet.__kobbex.getBroadcastCount()).toBe(0);
    expect(wallet.__kobbex.getSendInterceptCount()).toBe(1);
    const blocked = wallet.__kobbex.getBlockedTransactions()[0];
    expect(blocked.to.toLowerCase()).toBe(KOBBEX_WRAPPERS.ethV2.toLowerCase());
    expect(blocked.blocked).toBe(true);
    expect(blocked.fakeHash).toBeUndefined();
  });

  it('intercepts eth_sendRawTransaction', async () => {
    const wallet = createKobbexTestWallet({
      account: TEST_WALLET_FAKE_ACCOUNTS[0],
      chainId: 56,
    });
    await expect(
      wallet.request({ method: 'eth_sendRawTransaction', params: ['0xdead'] }),
    ).rejects.toThrow(/NO_BROADCAST_BLOCKED/);
    expect(wallet.__kobbex.getBroadcastCount()).toBe(0);
    expect(wallet.__kobbex.getSendInterceptCount()).toBe(1);
  });

  it('returns fake hash only in explicit simulated_receipt mode', async () => {
    const wallet = createKobbexTestWallet({
      account: TEST_WALLET_FAKE_ACCOUNTS[0],
      chainId: 1,
      mode: 'simulated_receipt',
    });
    const hash = await wallet.request({
      method: 'eth_sendTransaction',
      params: [{ to: KOBBEX_WRAPPERS.ethV3, data: '0xabc', value: '0x0' }],
    });
    expect(hash).toMatch(/^0x[bB]+/);
    expect(wallet.__kobbex.getBroadcastCount()).toBe(0);
  });

  it('records RPC calls safely without secrets', async () => {
    const wallet = createKobbexTestWallet({
      account: TEST_WALLET_FAKE_ACCOUNTS[0],
      chainId: 56,
    });
    await wallet.request({ method: 'eth_requestAccounts' });
    await wallet.request({ method: 'eth_chainId' });
    const snap = wallet.__kobbex.getDebugSnapshot();
    const json = JSON.stringify(snap);
    expect(json).not.toMatch(/private|seed|mnemonic|secret|project.?id/i);
    expect(snap.networkBroadcasts).toBe(0);
  });

  it('emits accountsChanged and chainChanged', async () => {
    const wallet = createKobbexTestWallet({
      account: TEST_WALLET_FAKE_ACCOUNTS[0],
      chainId: 1,
    });
    const accounts: string[][] = [];
    const chains: string[] = [];
    wallet.on('accountsChanged', (a) => accounts.push(a as string[]));
    wallet.on('chainChanged', (c) => chains.push(String(c)));
    wallet.__kobbex.setAccounts([TEST_WALLET_FAKE_ACCOUNTS[1]]);
    wallet.__kobbex.setChainId(56);
    expect(accounts[0][0]).toBe(TEST_WALLET_FAKE_ACCOUNTS[1]);
    expect(chains[0]).toBe('0x38');
  });

  it('supports rejection scenarios with code 4001', async () => {
    const wallet = createKobbexTestWallet({
      account: TEST_WALLET_FAKE_ACCOUNTS[0],
      chainId: 1,
      rejectAccounts: true,
      rejectSwitch: true,
      rejectSend: true,
    });
    await expect(wallet.request({ method: 'eth_requestAccounts' })).rejects.toMatchObject({
      code: 4001,
    });
    await expect(
      wallet.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x38' }],
      }),
    ).rejects.toMatchObject({ code: 4001 });
    await expect(
      wallet.request({
        method: 'eth_sendTransaction',
        params: [{ to: KOBBEX_WRAPPERS.ethV2, data: '0x01' }],
      }),
    ).rejects.toMatchObject({ code: 4001 });
    expect(wallet.__kobbex.getSendInterceptCount()).toBe(1);
  });

  it('implements eth_blockNumber so ethers can prepare transactions', async () => {
    const wallet = createKobbexTestWallet({
      account: TEST_WALLET_FAKE_ACCOUNTS[0],
      chainId: 1,
    });
    const block = await wallet.request({ method: 'eth_blockNumber' });
    expect(block).toMatch(/^0x/);
  });

  it('identifies wrappers and forbids direct routers', () => {
    expect(isKobbexWrapper(KOBBEX_WRAPPERS.ethV2, 1)).toBe(true);
    expect(isKobbexWrapper(KOBBEX_WRAPPERS.bscV2, 56)).toBe(true);
    expect(isForbiddenDirectRouter('0xE592427A0AEce92De3Edee1F18E0157C05861564')).toBe(true);
    expect(ERC20_APPROVE_SELECTOR).toBe('0x095ea7b3');
  });
});
