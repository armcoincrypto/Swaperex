/**
 * Browser-injectable EIP-1193 harness (serialized into Playwright addInitScript).
 * Mirrors frontend/src/testing/walletHarness/createKobbexTestWallet.ts behavior.
 */

export const WRAPPERS = {
  ethV1: '0xe07f5940487a58E30F9fa711Be358FB036B0Fc44',
  ethV2: '0x660B2E98E9eeAA4CaE21f319FbF3D6aD6909b491',
  ethV3: '0xa7702Ce9267567fd811B39C886CdABeC6eB249fc',
  bscV2: '0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6',
};

export const TREASURY = '0x509Cfd32ce279E08010C143F90Cc1782a3520196';
export const ACCOUNT_A = '0xa11ce00000000000000000000000000000000001';
export const ACCOUNT_B = '0xb0b0000000000000000000000000000000000002';

/**
 * Returns a function suitable for page.addInitScript(fn, arg).
 */
export function buildWalletInitScript() {
  return ({ account, chainId, mode, ethWei, bnbWei }) => {
    localStorage.setItem(
      'swaperex_terms_accepted_v1',
      JSON.stringify({ version: 1, acceptedAt: Date.now() }),
    );

    const listeners = {};
    let chain = Number(chainId) || 1;
    let accounts = [account];
    let testMode = mode === 'simulated_receipt' ? 'simulated_receipt' : 'no_broadcast';
    let rejectAccounts = false;
    let rejectSwitch = false;
    let rejectSend = false;
    let routeFingerprint = null;
    const ledger = [];
    const blocked = [];
    let sendInterceptCount = 0;
    const FAKE_HASH =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const emit = (ev, payload) => {
      (listeners[ev] || []).forEach((cb) => {
        try {
          cb(payload);
        } catch (_) {}
      });
    };

    const userRejected = (msg) => {
      const err = new Error(msg || 'User rejected the request');
      err.code = 4001;
      return err;
    };

    const noBroadcast = (method) => {
      const err = new Error(
        `KOBBEX_NO_BROADCAST_BLOCKED: ${method} intercepted — no network broadcast`,
      );
      err.code = 4900;
      err.data = { reason: 'NO_BROADCAST_BLOCKED' };
      return err;
    };

    const captureTx = (method, tx) => {
      const data = String(tx?.data || '0x');
      const entry = {
        chainId: chain,
        from: String(tx?.from || accounts[0] || ''),
        to: String(tx?.to || ''),
        value: String(tx?.value || '0x0'),
        data,
        dataSelector: data && data !== '0x' ? data.slice(0, 10).toLowerCase() : '',
        dataLength: !data || data === '0x' ? 0 : Math.max(0, (data.length - 2) / 2),
        gas: tx?.gas || tx?.gasLimit,
        maxFeePerGas: tx?.maxFeePerGas,
        maxPriorityFeePerGas: tx?.maxPriorityFeePerGas,
        nonce: tx?.nonce,
        timestamp: Date.now(),
        routeFingerprint,
        blocked: true,
        mode: testMode,
      };
      blocked.push(entry);
      sendInterceptCount += 1;
      ledger.push({
        method,
        timestamp: entry.timestamp,
        chainId: entry.chainId,
        from: entry.from,
        to: entry.to,
        value: entry.value,
        dataSelector: entry.dataSelector,
        dataLength: entry.dataLength,
        blocked: true,
        result: testMode === 'simulated_receipt' ? 'simulated' : rejectSend ? 'rejected' : 'blocked',
      });
      return entry;
    };

    const provider = {
      isMetaMask: false,
      isWalletConnect: true,
      request: async ({ method, params }) => {
        if (method === 'eth_accounts') return accounts;
        if (method === 'eth_requestAccounts') {
          if (rejectAccounts) throw userRejected();
          ledger.push({ method, timestamp: Date.now(), result: 'ok' });
          return accounts;
        }
        if (method === 'eth_chainId') return '0x' + chain.toString(16);
        if (method === 'net_version') return String(chain);
        if (method === 'wallet_switchEthereumChain') {
          if (rejectSwitch) throw userRejected('User rejected chain switch');
          const next = params?.[0]?.chainId;
          if (next) {
            chain = parseInt(next, 16);
            emit('chainChanged', '0x' + chain.toString(16));
          }
          ledger.push({ method, timestamp: Date.now(), chainId: chain, result: 'ok' });
          return null;
        }
        if (method === 'wallet_addEthereumChain') return null;
        if (method === 'eth_getBalance') {
          return chain === 56 ? bnbWei : ethWei;
        }
        if (
          method === 'eth_gasPrice' ||
          method === 'eth_maxPriorityFeePerGas'
        ) {
          return '0xb2d05e00';
        }
        if (method === 'eth_feeHistory') {
          return {
            baseFeePerGas: ['0xb2d05e00'],
            gasUsedRatio: [0.5],
            reward: [['0x3b9aca00']],
          };
        }
        if (method === 'eth_estimateGas') return '0x30d40';
        if (method === 'eth_getTransactionCount') return '0x1';
        if (method === 'eth_blockNumber') return '0x1000000';
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
        if (method === 'eth_call') return '0x' + '0'.repeat(64);
        if (method === 'eth_getCode') return '0x';
        if (
          method === 'personal_sign' ||
          method === 'eth_sign' ||
          method === 'eth_signTypedData' ||
          method === 'eth_signTypedData_v4'
        ) {
          throw noBroadcast(method);
        }
        if (method === 'eth_sendTransaction') {
          captureTx(method, params?.[0] || {});
          if (rejectSend) throw userRejected();
          if (testMode === 'simulated_receipt') return FAKE_HASH;
          throw noBroadcast(method);
        }
        if (method === 'eth_sendRawTransaction') {
          sendInterceptCount += 1;
          ledger.push({
            method,
            timestamp: Date.now(),
            blocked: true,
            result: 'blocked',
          });
          if (testMode === 'simulated_receipt') return FAKE_HASH;
          throw noBroadcast(method);
        }
        return null;
      },
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
    };

    window.ethereum = provider;
    window.__kobbexTestWallet = provider;
    window.__kobbexWalletDebug = {
      getSnapshot() {
        return {
          walletConnected: accounts.length > 0,
          testAccount: accounts[0] || null,
          chainId: chain,
          mode: testMode,
          walletRpcMethodsCalled: ledger.map((e) => e.method),
          broadcastBlockedCount: sendInterceptCount,
          networkBroadcasts: 0,
          lastBlockedTx: blocked[blocked.length - 1] || null,
          ledger: ledger.slice(),
          blockedTransactions: blocked.slice(),
        };
      },
      setAccounts(next) {
        accounts = next;
        emit('accountsChanged', next);
      },
      setChainId(id) {
        chain = Number(id);
        emit('chainChanged', '0x' + chain.toString(16));
      },
      setMode(m) {
        testMode = m === 'simulated_receipt' ? 'simulated_receipt' : 'no_broadcast';
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
        routeFingerprint = fp || null;
      },
    };
  };
}
