/**
 * P21.4 — Deterministic EIP-1193 test wallet (no private keys).
 * Default: NO_BROADCAST_BLOCKED for eth_sendTransaction / eth_sendRawTransaction.
 */

import { resolveWalletTestMode } from './activation';
import { dataSelector } from './wrappers';
import type {
  CapturedTransaction,
  KobbexWalletTestMode,
  TestWalletConfig,
  WalletRpcLedgerEntry,
} from './types';

export type KobbexTestWallet = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
  removeAllListeners: (event?: string) => void;
  isMetaMask: false;
  isWalletConnect: true;
  /** Test control surface */
  __kobbex: {
    getLedger: () => WalletRpcLedgerEntry[];
    getBlockedTransactions: () => CapturedTransaction[];
    getBroadcastCount: () => number;
    getSendInterceptCount: () => number;
    setAccounts: (accounts: string[]) => void;
    setChainId: (chainId: number) => void;
    setMode: (mode: KobbexWalletTestMode) => void;
    setRejectAccounts: (v: boolean) => void;
    setRejectSwitch: (v: boolean) => void;
    setRejectSend: (v: boolean) => void;
    setRouteFingerprint: (fp: string | undefined) => void;
    getDebugSnapshot: () => Record<string, unknown>;
  };
};

const FAKE_HASH =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function userRejected(message = 'User rejected the request'): Error & { code: number } {
  const err = new Error(message) as Error & { code: number };
  err.code = 4001;
  return err;
}

function noBroadcastError(method: string): Error & { code: number; data: { reason: string } } {
  const err = new Error(
    `KOBBEX_NO_BROADCAST_BLOCKED: ${method} intercepted — no network broadcast`,
  ) as Error & { code: number; data: { reason: string } };
  err.code = 4900;
  err.data = { reason: 'NO_BROADCAST_BLOCKED' };
  return err;
}

export function createKobbexTestWallet(config: TestWalletConfig): KobbexTestWallet {
  let accounts = [config.account];
  let chainId = config.chainId;
  let mode: KobbexWalletTestMode = resolveWalletTestMode(config.mode);
  let rejectAccounts = Boolean(config.rejectAccounts);
  let rejectSwitch = Boolean(config.rejectSwitch);
  let rejectSend = Boolean(config.rejectSend);
  let routeFingerprint = config.routeFingerprint;
  const balances: Record<number, string> = {
    1: '0x' + (15n * 10n ** 16n).toString(16), // 0.15 ETH
    56: '0x' + (2n * 10n ** 17n).toString(16), // 0.2 BNB
    ...(config.balances || {}),
  };

  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const ledger: WalletRpcLedgerEntry[] = [];
  const blocked: CapturedTransaction[] = [];
  let broadcastCount = 0;
  let sendInterceptCount = 0;

  const emit = (event: string, payload: unknown) => {
    for (const cb of listeners[event] || []) {
      try {
        cb(payload);
      } catch {
        /* ignore listener errors */
      }
    }
  };

  const record = (entry: WalletRpcLedgerEntry) => {
    ledger.push(entry);
  };

  const captureTx = (method: string, tx: Record<string, string | undefined>): CapturedTransaction => {
    const data = String(tx.data || '0x');
    const captured: CapturedTransaction = {
      chainId,
      from: String(tx.from || accounts[0] || ''),
      to: String(tx.to || ''),
      value: String(tx.value || '0x0'),
      data,
      dataSelector: dataSelector(data),
      dataLength: data === '0x' ? 0 : Math.max(0, (data.length - 2) / 2),
      gas: tx.gas || tx.gasLimit,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      nonce: tx.nonce,
      timestamp: Date.now(),
      routeFingerprint,
      blocked: true,
      mode,
      fakeHash: mode === 'simulated_receipt' ? FAKE_HASH : undefined,
    };
    blocked.push(captured);
    sendInterceptCount += 1;
    record({
      method,
      timestamp: captured.timestamp,
      chainId: captured.chainId,
      from: captured.from,
      to: captured.to,
      value: captured.value,
      dataSelector: captured.dataSelector,
      dataLength: captured.dataLength,
      gas: captured.gas,
      maxFeePerGas: captured.maxFeePerGas,
      maxPriorityFeePerGas: captured.maxPriorityFeePerGas,
      nonce: captured.nonce,
      routeFingerprint,
      blocked: true,
      result: mode === 'simulated_receipt' ? 'simulated' : rejectSend ? 'rejected' : 'blocked',
    });
    return captured;
  };

  const provider: KobbexTestWallet = {
    isMetaMask: false,
    isWalletConnect: true,
    on(event, cb) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    },
    removeListener(event, cb) {
      listeners[event] = (listeners[event] || []).filter((x) => x !== cb);
    },
    removeAllListeners(event) {
      if (event) delete listeners[event];
      else Object.keys(listeners).forEach((k) => delete listeners[k]);
    },
    async request({ method, params = [] }) {
      if (method === 'eth_accounts') {
        record({ method, timestamp: Date.now(), result: 'ok' });
        return accounts;
      }
      if (method === 'eth_requestAccounts') {
        if (rejectAccounts) {
          record({ method, timestamp: Date.now(), result: 'rejected' });
          throw userRejected();
        }
        record({ method, timestamp: Date.now(), result: 'ok' });
        return accounts;
      }
      if (method === 'eth_chainId') {
        record({ method, timestamp: Date.now(), chainId, result: 'ok' });
        return '0x' + chainId.toString(16);
      }
      if (method === 'net_version') {
        return String(chainId);
      }
      if (method === 'wallet_switchEthereumChain') {
        const next = params[0] as { chainId?: string } | undefined;
        if (rejectSwitch) {
          record({ method, timestamp: Date.now(), result: 'rejected' });
          throw userRejected('User rejected chain switch');
        }
        if (next?.chainId) {
          chainId = Number.parseInt(next.chainId, 16);
          emit('chainChanged', '0x' + chainId.toString(16));
        }
        record({ method, timestamp: Date.now(), chainId, result: 'ok' });
        return null;
      }
      if (method === 'wallet_addEthereumChain') {
        record({ method, timestamp: Date.now(), result: 'ok' });
        return null;
      }
      if (method === 'eth_getBalance') {
        record({ method, timestamp: Date.now(), chainId, result: 'ok' });
        return balances[chainId] || '0x0';
      }
      if (
        method === 'eth_gasPrice' ||
        method === 'eth_maxPriorityFeePerGas'
      ) {
        return '0xb2d05e00'; // 3 gwei
      }
      if (method === 'eth_feeHistory') {
        return {
          baseFeePerGas: ['0xb2d05e00'],
          gasUsedRatio: [0.5],
          reward: [['0x3b9aca00']],
        };
      }
      if (method === 'eth_estimateGas') {
        return '0x30d40'; // 200000
      }
      if (method === 'eth_getTransactionCount') {
        return '0x1';
      }
      if (method === 'eth_blockNumber') {
        return '0x1000000';
      }
      if (method === 'eth_getBlockByNumber' || method === 'eth_getBlockByHash') {
        return {
          number: '0x1000000',
          hash: '0x' + '11'.repeat(32),
          parentHash: '0x' + '22'.repeat(32),
          timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16),
          transactions: [],
          gasLimit: '0x1c9c380',
          gasUsed: '0x5208',
          baseFeePerGas: '0xb2d05e00',
        };
      }
      if (method === 'eth_getTransactionByHash' || method === 'eth_getTransactionReceipt') {
        return null;
      }
      if (method === 'eth_call') {
        // Default: zero allowance / empty return for read probes via wallet provider
        return '0x' + '0'.repeat(64);
      }
      if (method === 'eth_getCode') {
        return '0x';
      }
      if (method === 'personal_sign' || method === 'eth_sign' || method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
        record({ method, timestamp: Date.now(), result: 'blocked' });
        throw noBroadcastError(method);
      }
      if (method === 'eth_sendTransaction') {
        const tx = (params[0] || {}) as Record<string, string | undefined>;
        const captured = captureTx(method, tx);
        if (rejectSend) {
          throw userRejected();
        }
        if (mode === 'simulated_receipt') {
          return captured.fakeHash;
        }
        throw noBroadcastError(method);
      }
      if (method === 'eth_sendRawTransaction') {
        sendInterceptCount += 1;
        broadcastCount += 0; // never increment — blocked
        record({
          method,
          timestamp: Date.now(),
          chainId,
          blocked: true,
          result: 'blocked',
        });
        if (mode === 'simulated_receipt') {
          return FAKE_HASH;
        }
        throw noBroadcastError(method);
      }
      record({ method, timestamp: Date.now(), result: 'ok' });
      return null;
    },
    __kobbex: {
      getLedger: () => [...ledger],
      getBlockedTransactions: () => [...blocked],
      getBroadcastCount: () => broadcastCount,
      getSendInterceptCount: () => sendInterceptCount,
      setAccounts(next) {
        accounts = next;
        emit('accountsChanged', next);
      },
      setChainId(id) {
        chainId = id;
        emit('chainChanged', '0x' + id.toString(16));
      },
      setMode(next) {
        mode = resolveWalletTestMode(next);
      },
      setRejectAccounts(v) {
        rejectAccounts = !!v;
      },
      setRejectSwitch(v) {
        rejectSwitch = !!v;
      },
      setRejectSend(v) {
        rejectSend = !!v;
      },
      setRouteFingerprint(fp) {
        routeFingerprint = fp;
      },
      getDebugSnapshot() {
        return {
          walletConnected: accounts.length > 0,
          testAccount: accounts[0] || null,
          chainId,
          mode,
          walletRpcMethodsCalled: ledger.map((e) => e.method),
          broadcastBlockedCount: sendInterceptCount,
          networkBroadcasts: broadcastCount,
          lastBlockedTx: blocked[blocked.length - 1] || null,
          // Never include secrets
        };
      },
    },
  };

  return provider;
}
