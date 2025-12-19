# Frontend Security Audit & Component Mapping

## Step 5: Component to Endpoint Mapping

### Component Overview

| Component | Location | Endpoints Used | Signing |
|-----------|----------|----------------|---------|
| `BalanceCard` | `components/balances/BalanceCard.tsx` | None (display only) | ❌ |
| `TokenList` | `components/balances/TokenList.tsx` | `/balances/*` via `useBalances` | ❌ |
| `SwapInterface` | `components/swap/SwapInterface.tsx` | `/quotes/*`, `/swaps/quote` | ✅ Client |
| `WalletConnect` | `components/wallet/WalletConnect.tsx` | `/wallet/*` via `useWallet` | ❌ |
| `TransactionPreview` | `components/transaction/TransactionPreview.tsx` | None (display only) | ✅ Client |
| `ChainWarning` | `components/chain/ChainWarning.tsx` | None (display only) | ❌ |

---

### `BalanceCard` & `TokenList` → `/balances/*`

**File:** `components/balances/TokenList.tsx`

**Hook:** `useBalances()`

**Endpoints:**
```
POST /balances/wallet        → Single chain balance
POST /balances/multi-chain   → Multi-chain balances
GET  /balances/address/{addr}/chain/{chain} → Quick lookup
```

**Data Flow:**
```
TokenList
  ↓
useBalances() hook
  ↓
balanceStore.fetchBalances()
  ↓
balancesApi.getMultiChainBalance()
  ↓
POST /balances/multi-chain
  ↓
Backend queries blockchain RPC
  ↓
Returns token balances (read-only)
```

**Security:** ✅ Read-only, no signing

---

### `SwapInterface` → `/swaps/quote` & `/quotes/*`

**File:** `components/swap/SwapInterface.tsx`

**Hooks:** `useQuote()`, `useTransaction()`, `useSwap()`

**Endpoints:**
```
POST /quotes/        → Get rate preview (read-only)
POST /swaps/quote    → Get quote + unsigned transaction
POST /transactions/approve → Token approval (unsigned)
```

**Data Flow:**
```
SwapInterface
  ↓
User enters amount
  ↓
useQuote() → POST /quotes/ → Rate preview
  ↓
User clicks "Swap"
  ↓
POST /swaps/quote → Returns unsigned tx
  ↓
TransactionPreview shown
  ↓
User confirms
  ↓
useTransaction().executeTransaction(unsignedTx)
  ↓
signer.sendTransaction() → WALLET POPUP
  ↓
User signs in wallet
  ↓
Transaction broadcast from wallet
```

**Code Path for Signing:**
```typescript
// SwapInterface.tsx line 54-63
const handleSwap = async () => {
  if (!quote?.transaction || !isConnected) return;
  setSwapping(true);
  try {
    await executeTransaction(quote.transaction);  // ← Uses wallet signer
  } finally {
    setSwapping(false);
  }
};

// useTransaction.ts line 35-87
const executeTransaction = async (unsignedTx) => {
  const signer = await getSigner();  // ← From connected wallet
  const tx = await signer.sendTransaction(txRequest);  // ← WALLET POPUP
  await tx.wait();
};
```

**Security:** ✅ All signing via `signer.sendTransaction()` (wallet popup)

---

### `WalletConnect` → `/wallet/*`

**File:** `components/wallet/WalletConnect.tsx`

**Hook:** `useWallet()`

**Endpoints:**
```
POST /wallet/connect      → Register session (public address only)
POST /wallet/disconnect   → End session
GET  /wallet/session/{address} → Get session info
POST /wallet/switch-chain → Switch active chain
```

**Data Flow:**
```
WalletConnect
  ↓
User clicks "Connect Wallet"
  ↓
useWallet().connectInjected()
  ↓
window.ethereum.request({ method: 'eth_requestAccounts' })
  ↓
WALLET POPUP: "Connect to site?"
  ↓
User approves
  ↓
walletApi.connectWallet({ address, chain_id, wallet_type })
  ↓
Backend stores PUBLIC address only
```

**Security:** ✅ Never receives private keys

---

### `TransactionPreview` → Display Only

**File:** `components/transaction/TransactionPreview.tsx`

**Endpoints:** None (receives data from parent)

**Purpose:** Shows transaction details before user confirms signing

**Security Features:**
- Line 85-86: "Your wallet will open to confirm this transaction"
- Line 89-91: "Transaction signed locally in your wallet, never on our servers"

**Security:** ✅ Display only, reminds user of client-side signing

---

## Step 6: Security Validation

### ✅ 1. No Backend Signing Endpoints Used

**Audit of API Modules:**

| API Module | Endpoints Used | Signing? |
|------------|----------------|----------|
| `api/balances.ts` | `/balances/wallet`, `/balances/multi-chain` | ❌ Read-only |
| `api/chains.ts` | `/chains/`, `/chains/{id}`, `/chains/assets` | ❌ Read-only |
| `api/quotes.ts` | `/quotes/`, `/quotes/multi` | ❌ Read-only |
| `api/wallet.ts` | `/wallet/connect`, `/wallet/disconnect` | ❌ Session only |
| `api/swaps.ts` | `/swaps/quote` | ❌ Returns unsigned |
| `api/transactions.ts` | `/transactions/build`, `/transactions/approve` | ❌ Returns unsigned |
| `api/withdrawals.ts` | `/withdrawals/template`, `/withdrawals/fee-estimate` | ❌ Returns unsigned |

**Backend Signing Endpoints (NONE used):**
```
❌ /withdrawals/execute    → Not called (blocked with 403)
❌ /transactions/sign      → Does not exist
❌ /transactions/broadcast → Does not exist
❌ /wallet/sign            → Does not exist
```

**Grep verification:**
```bash
# Search for any signing-related API calls
grep -r "sign" frontend/src/api/
# Result: Only comments about "unsigned transactions"

grep -r "/execute" frontend/src/api/
# Result: Comment only: "Note: /withdrawals/execute is BLOCKED"
```

---

### ✅ 2. All Transactions Signed Client-Side

**Signing locations in codebase:**

| File | Line | Code | Type |
|------|------|------|------|
| `hooks/useTransaction.ts` | 67 | `signer.sendTransaction(txRequest)` | Swap/Transfer |
| `hooks/useTransaction.ts` | 100 | `signer.sendTransaction({ to, value })` | Simple Transfer |
| `hooks/useSwap.ts` | 87 | `executeTransaction(approvalTx)` | Token Approval |
| `hooks/useSwap.ts` | 94 | `executeTransaction(transaction)` | Swap Execution |

**Signer source:**
```typescript
// hooks/useWallet.ts line 126-131
const getSigner = useCallback(async () => {
  if (!provider) {
    throw new Error('Not connected');
  }
  return provider.getSigner();  // ← From ethers.js BrowserProvider
}, [provider]);

// Provider is created from injected wallet
const browserProvider = new BrowserProvider(window.ethereum);
```

**Verification:**
- All `signer` objects come from `ethers.js BrowserProvider`
- `BrowserProvider` wraps `window.ethereum` (MetaMask, etc.)
- `sendTransaction()` triggers wallet popup
- User must manually approve in wallet

---

### ✅ 3. Blocked Endpoints Return Warnings

**API Client Error Handling:**

```typescript
// api/client.ts line 111-118
if (status === 403) {
  console.warn(
    '[API] Blocked operation:',
    error.config?.url,
    data
  );
}

// api/client.ts line 46-50
case 'forbidden':
  return 'This operation is not allowed in web mode. ' +
         'Please sign transactions in your wallet.';
```

**Frontend Error Display:**

```typescript
// SwapInterface.tsx line 159-163
{(quoteError || txError) && (
  <div className="bg-red-900/20 border border-red-800 rounded-xl text-sm text-red-400">
    {quoteError || txError}
  </div>
)}

// TransactionError.tsx
function TransactionError({ type, message, onRetry, onDismiss }) {
  // User-friendly error messages for all error types
}
```

**403 Response Handling:**
1. API client catches 403
2. Logs warning to console
3. Throws `ApiError` with type `'forbidden'`
4. Component displays user-friendly message
5. User sees: "This operation is not allowed in web mode..."

---

### ✅ 4. Mode Validation (WEB_NON_CUSTODIAL vs TELEGRAM_CUSTODIAL)

**Frontend assumes WEB_NON_CUSTODIAL:**
- All API modules return unsigned data
- All signing via wallet hooks
- No custodial endpoints called

**Backend enforces mode:**
```python
# safety.py
if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
    raise CustodialAccessError(module, operation)

# controllers/withdrawals.py
if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
    raise HTTPException(status_code=403, detail={...})
```

**Mode separation:**
| Operation | WEB_NON_CUSTODIAL | TELEGRAM_CUSTODIAL |
|-----------|-------------------|-------------------|
| Get quotes | ✅ Allowed | ✅ Allowed |
| Get balances | ✅ Blockchain | ✅ Ledger |
| Build unsigned tx | ✅ Allowed | ✅ Allowed |
| Sign transaction | ❌ Blocked (client-side only) | ✅ Server-side |
| Execute withdrawal | ❌ 403 Forbidden | ✅ Allowed |

---

## Security Summary

### ✅ PASSED: No Private Key Handling

```
✅ No input fields for private keys
✅ No input fields for seed phrases
✅ detectSensitiveInput() blocks attempts
✅ SecurityWarning component displays on detection
```

### ✅ PASSED: Client-Side Signing Only

```
✅ All signing via signer.sendTransaction()
✅ Signer from ethers.js BrowserProvider
✅ Wallet popup required for every transaction
✅ User can cancel any transaction
```

### ✅ PASSED: No Backend Signing Calls

```
✅ No /transactions/sign endpoint called
✅ No /transactions/broadcast endpoint called
✅ No /withdrawals/execute called (comment documents 403)
✅ All endpoints return unsigned data
```

### ✅ PASSED: Error Handling

```
✅ 403 responses logged and displayed
✅ Wrong chain detection with warnings
✅ User rejection handled gracefully
✅ Network errors show retry UI
```

### ✅ PASSED: Mode Enforcement

```
✅ Frontend uses only web-compatible endpoints
✅ Backend blocks custodial operations in web mode
✅ Clear separation of concerns
```

---

## Audit Checklist

| Check | Status | Notes |
|-------|--------|-------|
| No private key inputs | ✅ | `detectSensitiveInput()` blocks |
| No seed phrase inputs | ✅ | Pattern detection in place |
| All signing client-side | ✅ | Via `signer.sendTransaction()` |
| Wallet popup required | ✅ | ethers.js enforces |
| 403 errors handled | ✅ | `ApiError.isBlockedOperation()` |
| Wrong chain warnings | ✅ | `isWrongChain` state + UI |
| Transaction previews | ✅ | `TransactionPreview` component |
| Security notices | ✅ | "Signed locally in your wallet" |
| No execute endpoints | ✅ | Only `/template` used |
| Mode separation | ✅ | Backend enforces |

---

## Conclusion

**The frontend is secure for WEB_NON_CUSTODIAL mode:**

1. ✅ No private keys ever handled
2. ✅ All signing via wallet popup
3. ✅ Backend endpoints return unsigned data only
4. ✅ Blocked operations show clear errors
5. ✅ User has full control over all transactions

**Risk Level:** LOW

**Recommendations:**
- Continue using only `/template` and `/quote` endpoints
- Never add `/execute` or `/sign` API calls
- Maintain `detectSensitiveInput()` validation
- Keep `TransactionPreview` for all transactions
