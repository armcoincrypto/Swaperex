# Wallet Connection Flow

## Overview

This document defines the wallet connection flow for Swaperex Web Non-Custodial mode.

**CRITICAL SECURITY PRINCIPLE**: The frontend NEVER asks for, receives, or handles private keys or seed phrases. All signing happens in the user's wallet.

---

## Supported Wallet Types

| Wallet Type | Description | Connection Method |
|-------------|-------------|-------------------|
| `injected` | Browser extension wallets | `window.ethereum` (MetaMask, etc.) |
| `walletconnect` | Mobile wallets via QR | WalletConnect v2 protocol |
| `hardware` | Ledger, Trezor via extension | Via injected provider |
| `readonly` | View-only mode | Manual address entry |

---

## Wallet States

The wallet can be in one of these mutually exclusive states:

```
┌─────────────────────────────────────────────────────────────┐
│                     WALLET STATES                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐                                          │
│  │ DISCONNECTED │ ← Initial state, no wallet connected     │
│  └──────┬───────┘                                          │
│         │ User clicks "Connect"                            │
│         ▼                                                  │
│  ┌──────────────┐                                          │
│  │  CONNECTING  │ ← Waiting for wallet approval            │
│  └──────┬───────┘                                          │
│         │ User approves / rejects                          │
│         ▼                                                  │
│  ┌──────────────┐     ┌──────────────┐                     │
│  │  CONNECTED   │ ←─→ │ WRONG_CHAIN  │                     │
│  │  (correct)   │     │  (mismatch)  │                     │
│  └──────────────┘     └──────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### State Definitions

| State | `isConnected` | `isConnecting` | `isWrongChain` | Description |
|-------|---------------|----------------|----------------|-------------|
| **Disconnected** | `false` | `false` | `false` | No wallet connected |
| **Connecting** | `false` | `true` | `false` | Waiting for user approval |
| **Connected** | `true` | `false` | `false` | Wallet connected, correct chain |
| **Wrong Chain** | `true` | `false` | `true` | Connected but wrong network |

---

## Connection Flow

### 1. MetaMask / Injected Wallet

```
┌─────────────────────────────────────────────────────────────┐
│ USER                     │ FRONTEND                │ WALLET │
├──────────────────────────┼─────────────────────────┼────────┤
│                          │                         │        │
│ Click "Connect Wallet"   │                         │        │
│ ─────────────────────────>                         │        │
│                          │                         │        │
│                          │ Check window.ethereum   │        │
│                          │ ─────────────────────────>       │
│                          │                         │        │
│                          │ eth_requestAccounts     │        │
│                          │ ─────────────────────────>       │
│                          │                         │        │
│                          │        [Popup appears]  │   ◄────│
│                          │                         │        │
│ Approve connection       │                         │        │
│ ─────────────────────────────────────────────────────>      │
│                          │                         │        │
│                          │ ◄─── accounts[]        │        │
│                          │                         │        │
│                          │ eth_chainId             │        │
│                          │ ─────────────────────────>       │
│                          │                         │        │
│                          │ ◄─── chainId           │        │
│                          │                         │        │
│                          │ POST /wallet/connect    │        │
│                          │ (address, chainId)      │        │
│                          │                         │        │
│                          │ GET /balances/wallet    │        │
│                          │                         │        │
│ ◄─── Display balances    │                         │        │
│                          │                         │        │
└─────────────────────────────────────────────────────────────┘
```

### 2. WalletConnect (Mobile)

```
┌─────────────────────────────────────────────────────────────┐
│ USER                     │ FRONTEND                │ WALLET │
├──────────────────────────┼─────────────────────────┼────────┤
│                          │                         │        │
│ Click "WalletConnect"    │                         │        │
│ ─────────────────────────>                         │        │
│                          │                         │        │
│                          │ Generate QR code        │        │
│ ◄─── Display QR code     │                         │        │
│                          │                         │        │
│ Scan QR with mobile      │                         │        │
│ ───────────────────────────────────────────────────>        │
│                          │                         │        │
│ Approve in mobile app    │                         │        │
│ ─────────────────────────────────────────────────────>      │
│                          │                         │        │
│                          │ ◄─── session established│        │
│                          │                         │        │
│                          │ POST /wallet/connect    │        │
│                          │                         │        │
│ ◄─── Connected!          │                         │        │
│                          │                         │        │
└─────────────────────────────────────────────────────────────┘
```

---

## Chain/Network Detection

### Supported Chains

| Chain | Chain ID | Name |
|-------|----------|------|
| Ethereum | 1 | Mainnet |
| BSC | 56 | BNB Chain |
| Polygon | 137 | Polygon PoS |
| Arbitrum | 42161 | Arbitrum One |
| Optimism | 10 | OP Mainnet |
| Avalanche | 43114 | Avalanche C-Chain |

### Wrong Chain Handling

When the user's wallet is on an unsupported or incorrect chain:

```typescript
// State detection
const isWrongChain = isConnected && !SUPPORTED_CHAIN_IDS.includes(chainId);

// UI behavior when wrong chain
if (isWrongChain) {
  // 1. Show warning banner
  // 2. Disable swap/transaction buttons
  // 3. Show "Switch Network" button
  // 4. Allow balance viewing (read-only)
}
```

### Auto-Switch Request

```typescript
// Request chain switch via wallet
await window.ethereum.request({
  method: 'wallet_switchEthereumChain',
  params: [{ chainId: '0x1' }], // hex chain ID
});

// If chain not added (error 4902), offer to add it
await window.ethereum.request({
  method: 'wallet_addEthereumChain',
  params: [{
    chainId: '0x89',
    chainName: 'Polygon Mainnet',
    rpcUrls: ['https://polygon-rpc.com'],
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    blockExplorerUrls: ['https://polygonscan.com'],
  }],
});
```

---

## Disconnect Flow

```
┌─────────────────────────────────────────────────────────────┐
│ USER                     │ FRONTEND                │ BACKEND│
├──────────────────────────┼─────────────────────────┼────────┤
│                          │                         │        │
│ Click "Disconnect"       │                         │        │
│ ─────────────────────────>                         │        │
│                          │                         │        │
│                          │ POST /wallet/disconnect │        │
│                          │ ─────────────────────────>       │
│                          │                         │        │
│                          │ Clear local state       │        │
│                          │ - Remove from storage   │        │
│                          │ - Clear balances        │        │
│                          │                         │        │
│ ◄─── Show disconnected   │                         │        │
│                          │                         │        │
└─────────────────────────────────────────────────────────────┘
```

---

## Read-Only Operations (No Signing Required)

These operations work WITHOUT wallet signature:

| Operation | Endpoint | Notes |
|-----------|----------|-------|
| View balances | `GET /balances/wallet` | Fetches from blockchain |
| Get swap quote | `POST /quotes/` | Price estimate only |
| Compare routes | `POST /quotes/multi` | Multi-DEX comparison |
| View chains | `GET /chains/` | Supported chains list |
| View assets | `GET /chains/assets` | Token list |
| Fee estimates | `GET /withdrawals/fee-estimate` | Gas cost preview |

---

## Transaction Building (Requires Signing)

These operations return **unsigned transactions** for the user to sign:

| Operation | Endpoint | Returns |
|-----------|----------|---------|
| Swap | `POST /swaps/quote` | Unsigned swap tx |
| Token approval | `POST /transactions/approve` | Unsigned approval tx |
| Withdrawal/Send | `POST /withdrawals/template` | Unsigned transfer tx |

### Transaction Signing Flow

```typescript
// 1. Get unsigned transaction from backend
const { transaction } = await swapsApi.getQuote({
  from_asset: 'ETH',
  to_asset: 'USDC',
  amount: '1.0',
  slippage: 0.5,
});

// 2. User signs in their wallet (popup appears)
const signer = await provider.getSigner();
const tx = await signer.sendTransaction({
  to: transaction.to,
  data: transaction.data,
  value: transaction.value,
  gasLimit: transaction.gas_limit,
});

// 3. Frontend broadcasts (happens automatically with sendTransaction)
// 4. Wait for confirmation
const receipt = await tx.wait();

// 5. Show success and refresh balances
```

---

## Event Listeners

The frontend listens for wallet events:

```typescript
// Account changed (user switched accounts in wallet)
window.ethereum.on('accountsChanged', (accounts: string[]) => {
  if (accounts.length === 0) {
    // User disconnected all accounts
    disconnectWallet();
  } else {
    // User switched to different account
    reconnectWithNewAccount(accounts[0]);
  }
});

// Chain changed (user switched networks in wallet)
window.ethereum.on('chainChanged', (chainIdHex: string) => {
  const newChainId = parseInt(chainIdHex, 16);
  updateChainId(newChainId);
  checkIfWrongChain(newChainId);
});

// Disconnect (WalletConnect session ended)
walletConnect.on('disconnect', () => {
  disconnectWallet();
});
```

---

## State Management (Zustand Store)

```typescript
interface WalletState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  isWrongChain: boolean;

  // Wallet info (PUBLIC ONLY)
  address: string | null;      // Public address only
  chainId: number;             // Current chain ID
  walletType: WalletType;      // 'injected' | 'walletconnect' | etc.

  // Supported chains
  supportedChainIds: number[];

  // Actions
  connect: (address: string, chainId: number, type: WalletType) => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
}
```

---

## Security Checklist

- [x] **NEVER** ask for private keys
- [x] **NEVER** ask for seed phrases
- [x] **NEVER** store sensitive data in localStorage
- [x] Only store public address for session persistence
- [x] All transactions require wallet popup confirmation
- [x] User can disconnect at any time
- [x] Clear all state on disconnect
- [x] Validate addresses before operations

---

## Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| No wallet | "No wallet detected. Please install MetaMask." | Show install link |
| User rejected | "Connection rejected by user." | Return to disconnected |
| Wrong chain | "Please switch to a supported network." | Show switch button |
| Session expired | "Session expired. Please reconnect." | Trigger reconnect |
| Network error | "Network error. Please try again." | Retry with backoff |
