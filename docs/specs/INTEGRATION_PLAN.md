# Frontend Integration Plan

## Step 3: Hook-to-Endpoint Mapping

### Overview

All hooks respect WEB_NON_CUSTODIAL rules:
- ❌ No private keys ever handled
- ✅ Client-side signing only (via wallet popup)
- ✅ Clear error handling for blocked operations

---

## `useWallet` → `/wallet/*` + Chain Detection

### Endpoints Used

| Action | Endpoint | Method |
|--------|----------|--------|
| Connect wallet | `/wallet/connect` | POST |
| Disconnect | `/wallet/disconnect` | POST |
| Get session | `/wallet/session/{address}` | GET |
| Switch chain | `/wallet/switch-chain` | POST |
| Get capabilities | `/wallet/capabilities/{type}` | GET |

### Integration Flow

```typescript
// useWallet.ts integration
const connectInjected = async () => {
  // 1. Request accounts from wallet (MetaMask)
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

  // 2. Get current chain from wallet
  const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
  const chainId = parseInt(chainIdHex, 16);

  // 3. Register session with backend (PUBLIC address only)
  await walletApi.connectWallet({
    address: accounts[0],      // ✅ Public address only
    chain_id: chainId,
    wallet_type: 'injected',
    // ❌ NEVER: private_key, seed_phrase
  });

  // 4. Create ethers provider for signing
  const provider = new BrowserProvider(window.ethereum);

  // 5. Fetch initial balances
  await fetchBalances(accounts[0], ['ethereum', 'bsc', 'polygon']);
};
```

### Chain Detection

```typescript
// Listen for chain changes from wallet
window.ethereum.on('chainChanged', (chainIdHex) => {
  const newChainId = parseInt(chainIdHex, 16);

  // Update local state
  updateChainId(newChainId);

  // Check if supported
  const isWrongChain = !SUPPORTED_CHAIN_IDS.includes(newChainId);
  // → Show ChainWarning component if wrong chain
});
```

### Security Rules

| Rule | Implementation |
|------|----------------|
| No private keys | `connectWallet()` only accepts public address |
| No seed phrases | Input validation blocks mnemonic patterns |
| Session = address only | Backend stores `{address, chain_id, wallet_type}` |

---

## `useBalances` → `/balances/*`

### Endpoints Used

| Action | Endpoint | Method |
|--------|----------|--------|
| Single chain | `/balances/wallet` | POST |
| Multi-chain | `/balances/multi-chain` | POST |
| Quick lookup | `/balances/address/{addr}/chain/{chain}` | GET |

### Integration Flow

```typescript
// useBalances.ts integration
const fetchBalances = async (address: string, chains: string[]) => {
  // Uses /balances/multi-chain for efficiency
  const response = await balancesApi.getMultiChainBalance({
    address,           // ✅ Public address
    chains,            // ['ethereum', 'bsc', 'polygon']
    include_tokens: true,
  });

  // Update store with balances
  // No signing required - read-only operation
};

// Auto-refresh every 30 seconds
useEffect(() => {
  const interval = setInterval(() => {
    if (address) fetchBalances(address, DEFAULT_CHAINS);
  }, 30000);
  return () => clearInterval(interval);
}, [address]);
```

### Request/Response

```typescript
// Request
POST /balances/multi-chain
{
  "address": "0x1234...",
  "chains": ["ethereum", "bsc", "polygon"],
  "include_tokens": true
}

// Response
{
  "success": true,
  "address": "0x1234...",
  "chains": {
    "ethereum": {
      "native_balance": { "symbol": "ETH", "balance": "1.5" },
      "token_balances": [...]
    },
    ...
  },
  "total_usd_value": "5000.00"
}
```

### Security Rules

| Rule | Implementation |
|------|----------------|
| Read-only | No signing required |
| Public data | Queries blockchain via RPC |
| No auth | Address is public information |

---

## `useQuote` → `/quotes/` + `/swaps/quote`

### Endpoints Used

| Action | Endpoint | Method | Returns |
|--------|----------|--------|---------|
| Get rate | `/quotes/` | POST | Rate only |
| Get with tx | `/swaps/quote` | POST | Rate + unsigned tx |
| Compare | `/quotes/multi` | POST | Multiple providers |

### Integration Flow

```typescript
// useQuote.ts integration
const fetchQuote = async (address: string) => {
  // Step 1: Get quick quote for preview (no tx data)
  const quickQuote = await quotesApi.getQuote({
    from_asset: fromAsset,
    to_asset: toAsset,
    amount: fromAmount,
  });

  // Step 2: When user wants to swap, get full quote with unsigned tx
  const fullQuote = await swapsApi.getSwapQuote({
    from_asset: fromAsset,
    to_asset: toAsset,
    amount: fromAmount,
    from_address: address,  // ✅ Public address only
    slippage: 0.5,
  });

  // Response includes unsigned transaction
  // {
  //   quote: {...},
  //   transaction: {
  //     to: "0xRouter...",
  //     data: "0x...",      // Calldata for DEX
  //     value: "0x...",     // ETH value
  //     gas_limit: "..."
  //   },
  //   approval_needed: true/false
  // }
};
```

### Debouncing & Polling

```typescript
// Debounce quote requests (500ms)
const debouncedFetch = useCallback(() => {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => fetchQuote(address), 500);
}, [address, fromAsset, toAsset, fromAmount]);

// Poll for fresh quotes (15 seconds)
useEffect(() => {
  if (quote) {
    const interval = setInterval(() => fetchQuote(address), 15000);
    return () => clearInterval(interval);
  }
}, [quote]);
```

### Security Rules

| Rule | Implementation |
|------|----------------|
| Quote = read-only | No signing for quote fetch |
| Unsigned tx | Backend returns calldata, NOT signed |
| Expiration | Quotes expire in 5 minutes |

---

## `useTransaction` → `/transactions/build` + `/swaps/quote`

### Endpoints Used

| Action | Endpoint | Method |
|--------|----------|--------|
| Build approval | `/transactions/approve` | POST |
| Build transfer | `/transactions/build` | POST |
| Get swap tx | `/swaps/quote` | POST |
| Get withdrawal tx | `/withdrawals/template` | POST |

### Integration Flow

```typescript
// useTransaction.ts - ALL SIGNING IS CLIENT-SIDE
const executeTransaction = async (unsignedTx: UnsignedTransaction) => {
  // 1. Get signer from connected wallet
  const signer = await getSigner();  // From ethers.js BrowserProvider

  // 2. Build transaction request
  const txRequest = {
    to: unsignedTx.to,
    value: BigInt(unsignedTx.value),
    data: unsignedTx.data,
    chainId: unsignedTx.chain_id,
    gasLimit: BigInt(unsignedTx.gas_limit),
  };

  // 3. SIGN & BROADCAST via wallet popup
  //    This is the ONLY place signing happens
  //    Wallet shows popup → User approves → Tx sent
  const tx = await signer.sendTransaction(txRequest);

  // 4. Wait for confirmation
  const receipt = await tx.wait();

  return tx.hash;
};
```

### Complete Swap Flow

```typescript
const executeSwap = async () => {
  // 1. Get swap quote with unsigned tx from backend
  const { transaction, approval_needed } = await swapsApi.getSwapQuote({...});

  // 2. If approval needed, execute approval first
  if (approval_needed) {
    const approvalTx = await transactionsApi.buildApproval({
      chain: 'ethereum',
      token_address: tokenAddress,
      spender: routerAddress,
    });

    // User signs approval in wallet
    await executeTransaction(approvalTx);
  }

  // 3. Execute swap (user signs in wallet)
  const txHash = await executeTransaction(transaction);

  // 4. Refresh balances
  await fetchBalances(address, ['ethereum']);
};
```

### Security Rules

| Rule | Implementation |
|------|----------------|
| Client-side only | `signer.sendTransaction()` opens wallet popup |
| No backend signing | Backend returns unsigned `{to, data, value}` |
| User approval | Wallet requires explicit confirm |
| Cancellable | User can reject in wallet |

---

## Error Handling for Blocked Operations

### Backend Returns 403

```typescript
// API client error handling
try {
  const response = await api.post('/withdrawals/execute', data);
} catch (error) {
  if (error.response?.status === 403) {
    // Backend blocked this operation
    showError({
      type: 'forbidden',
      title: 'Operation Not Allowed',
      message: 'This operation is disabled in web mode. ' +
               'Please sign transactions in your wallet.',
    });
  }
}
```

### Blocked Operations List

| Endpoint | Status | Frontend Handling |
|----------|--------|-------------------|
| `POST /withdrawals/execute` | 403 | Show "Use wallet to send" |
| Any signing request | N/A | Never sent (no endpoint) |
| Private key submission | N/A | Blocked in frontend |

### Error Component

```typescript
function BlockedOperationError({ operation }: { operation: string }) {
  return (
    <div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
      <h4 className="text-red-400 font-bold">Operation Blocked</h4>
      <p className="text-sm mt-1">
        "{operation}" is not available in web mode.
        All transactions must be signed in your wallet.
      </p>
    </div>
  );
}
```

---

## Step 4: UX Flow Verification

### Flow 1: Wallet Connect → Detect Chain → Fetch Balances

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WALLET CONNECTION FLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User clicks "Connect Wallet"                                          │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ useWallet.connectInjected()                                     │   │
│  │   → window.ethereum.request({ method: 'eth_requestAccounts' })  │   │
│  │   → [WALLET POPUP: "Connect to Swaperex?"]                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼ User approves                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Detect chain                                                    │   │
│  │   → window.ethereum.request({ method: 'eth_chainId' })         │   │
│  │   → chainId = 1 (Ethereum)                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Check if supported chain                                        │   │
│  │   → SUPPORTED_CHAIN_IDS.includes(chainId)                       │   │
│  │   → If NO: Show ChainWarning with "Switch Network" button       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Register session with backend                                   │   │
│  │   → POST /wallet/connect                                        │   │
│  │   → { address: "0x...", chain_id: 1, wallet_type: "injected" } │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Fetch balances                                                  │   │
│  │   → POST /balances/multi-chain                                  │   │
│  │   → Display in TokenList component                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ✅ Connected! Show wallet address and balances                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flow 2: Swap → Quote → Sign → Broadcast

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SWAP FLOW                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User enters: 1 ETH → USDC                                             │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Debounced quote fetch (500ms)                                   │   │
│  │   → POST /quotes/                                               │   │
│  │   → Display: "~2,000 USDC"                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼ User clicks "Swap"                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Get full quote with unsigned transaction                        │   │
│  │   → POST /swaps/quote                                           │   │
│  │   → Returns: { quote, transaction, approval_needed }            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Show TransactionPreview modal                                   │   │
│  │   • From: 1 ETH                                                 │   │
│  │   • To: ~2,000 USDC                                             │   │
│  │   • Rate: 1 ETH = 2,000 USDC                                    │   │
│  │   • Min received: 1,990 USDC (0.5% slippage)                    │   │
│  │   • Network fee: ~$5                                            │   │
│  │   • [Cancel] [Confirm]                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼ User clicks "Confirm"                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ If approval_needed:                                             │   │
│  │   → Build approval tx: POST /transactions/approve               │   │
│  │   → signer.sendTransaction(approvalTx)                          │   │
│  │   → [WALLET POPUP: "Approve USDC spending?"]                   │   │
│  │   → Wait for confirmation                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Execute swap (CLIENT-SIDE SIGNING)                              │   │
│  │   → signer.sendTransaction(swapTx)                              │   │
│  │   → [WALLET POPUP: "Confirm swap 1 ETH → USDC"]                │   │
│  │   → User reviews and confirms                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Wait for confirmation                                           │   │
│  │   → tx.wait()                                                   │   │
│  │   → Show "Confirming..." spinner                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ✅ Success! Show tx hash, refresh balances                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flow 3: Withdrawal → Template → Sign → Broadcast

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       WITHDRAWAL FLOW                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User enters: Send 100 USDC to 0xRecipient...                          │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Get withdrawal template (unsigned tx)                           │   │
│  │   → POST /withdrawals/template                                  │   │
│  │   → Returns: { transaction, fee_estimate }                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Show TransactionPreview modal                                   │   │
│  │   • Sending: 100 USDC                                           │   │
│  │   • To: 0xRecipient...                                          │   │
│  │   • Network fee: ~$2                                            │   │
│  │   • [Cancel] [Send]                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼ User clicks "Send"                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Execute transfer (CLIENT-SIDE SIGNING)                          │   │
│  │   → signer.sendTransaction(withdrawalTx)                        │   │
│  │   → [WALLET POPUP: "Send 100 USDC to 0xRecip...?"]             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ✅ Sent! Show tx hash and explorer link                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flow 4: Alerts for Wrong Chain / Blocked Operations

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ERROR HANDLING FLOWS                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  WRONG CHAIN DETECTION                                                 │
│  ─────────────────────                                                 │
│                                                                         │
│  wallet.chainId = 999 (unsupported)                                    │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ isWrongChain = !SUPPORTED_CHAIN_IDS.includes(chainId)          │   │
│  │   → isWrongChain = true                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Show ChainWarningBanner at top of page                          │   │
│  │ ┌───────────────────────────────────────────────────────────┐   │   │
│  │ │ ⚠️ You're on an unsupported network. [Switch Network]     │   │   │
│  │ └───────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Disable swap/send buttons                                       │   │
│  │   → Button shows "Switch Network First"                         │   │
│  │   → onClick → wallet_switchEthereumChain                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════   │
│                                                                         │
│  BLOCKED OPERATION (403 from backend)                                  │
│  ────────────────────────────────────                                  │
│                                                                         │
│  Attempt: POST /withdrawals/execute (if somehow reached)               │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Backend returns 403:                                            │   │
│  │ {                                                               │   │
│  │   "error": "Backend withdrawal execution DISABLED in WEB mode", │   │
│  │   "message": "Use /template endpoint..."                        │   │
│  │ }                                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Show SecurityWarning component                                  │   │
│  │ ┌───────────────────────────────────────────────────────────┐   │   │
│  │ │ 🔒 This operation requires wallet signing.                │   │   │
│  │ │ All transactions are signed locally in your wallet.       │   │   │
│  │ └───────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════   │
│                                                                         │
│  USER REJECTS IN WALLET                                                │
│  ──────────────────────                                                │
│                                                                         │
│  signer.sendTransaction() → User clicks "Reject"                       │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Catch error code 4001 (user rejected)                          │   │
│  │   → parseTransactionError(error) → 'user_rejected'              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Show TransactionError component                                 │   │
│  │ ┌───────────────────────────────────────────────────────────┐   │   │
│  │ │ Transaction Cancelled                                      │   │   │
│  │ │ You cancelled the transaction in your wallet.             │   │   │
│  │ │ [Try Again]                                               │   │   │
│  │ └───────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Security Checklist

### ✅ Verified in All Hooks

- [x] `useWallet`: Only sends public address to backend
- [x] `useBalances`: Read-only blockchain queries
- [x] `useQuote`: Read-only quote fetching
- [x] `useTransaction`: ALL signing via `signer.sendTransaction()`

### ✅ Never Implemented

- [x] No private key fields in any form
- [x] No seed phrase inputs
- [x] No server-side signing calls
- [x] No auto-transaction execution

### ✅ Error Handling

- [x] 403 responses show clear explanation
- [x] Wrong chain disables transaction buttons
- [x] User rejection handled gracefully
- [x] Network errors trigger retry UI
