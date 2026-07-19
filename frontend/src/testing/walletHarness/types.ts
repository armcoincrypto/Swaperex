/**
 * P21.4 — Test-only wallet harness types.
 * Never import from production UI modules.
 */

export type KobbexWalletTestMode = 'no_broadcast' | 'simulated_receipt';

export type WalletRpcLedgerEntry = {
  method: string;
  timestamp: number;
  chainId?: number;
  from?: string;
  to?: string;
  value?: string;
  dataSelector?: string;
  dataLength?: number;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  routeFingerprint?: string;
  blocked?: boolean;
  result?: 'blocked' | 'rejected' | 'simulated' | 'ok' | 'error';
};

export type CapturedTransaction = {
  chainId: number;
  from: string;
  to: string;
  value: string;
  data: string;
  dataSelector: string;
  dataLength: number;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  timestamp: number;
  routeFingerprint?: string;
  blocked: true;
  mode: KobbexWalletTestMode;
  fakeHash?: string;
};

export type TestWalletConfig = {
  account: string;
  chainId: number;
  mode?: KobbexWalletTestMode;
  balances?: Record<number, string>;
  /** When true, eth_requestAccounts rejects with 4001 */
  rejectAccounts?: boolean;
  /** When true, wallet_switchEthereumChain rejects with 4001 */
  rejectSwitch?: boolean;
  /** When true, eth_sendTransaction rejects with 4001 (still counted as intercepted) */
  rejectSend?: boolean;
  routeFingerprint?: string;
};
