# Backend Verification & Endpoint Mapping

## Step 1: Backend Functionality Verification

### Controllers Found (7 routers)

| Router | File | Prefix | Status |
|--------|------|--------|--------|
| `quotes_router` | `controllers/quotes.py` | `/quotes` | ✅ Ready |
| `chains_router` | `controllers/chains.py` | `/chains` | ✅ Ready |
| `transactions_router` | `controllers/transactions.py` | `/transactions` | ✅ Ready |
| `swaps_router` | `controllers/swaps.py` | `/swaps` | ✅ Ready |
| `withdrawals_router` | `controllers/withdrawals.py` | `/withdrawals` | ✅ Ready |
| `balances_router` | `controllers/balances.py` | `/balances` | ✅ Ready |
| `wallet_router` | `controllers/wallet.py` | `/wallet` | ✅ Ready |

### Services Found

| Service | File | Purpose |
|---------|------|---------|
| `QuoteService` | `services/quote_service.py` | Fetches swap quotes |
| `ChainService` | `services/chain_service.py` | Chain/asset metadata |
| `TransactionBuilder` | `services/transaction_builder.py` | Builds unsigned transactions |
| `SwapService` | `services/swap_service.py` | Swap quotes with calldata |
| `WithdrawalService` | `services/withdrawal_service.py` | Withdrawal templates |
| `BalanceService` | `services/balance_service.py` | Blockchain balance queries |
| `WalletService` | `services/wallet_service.py` | Wallet session management |

### Safety Guards Verification

| Guard | Location | Status |
|-------|----------|--------|
| `CustodialAccessError` | `safety.py:39` | ✅ Raises on blocked access |
| `require_custodial` decorator | `safety.py:77` | ✅ Blocks decorated functions |
| `guard_module_import` | `safety.py:103` | ✅ Blocks restricted imports |
| `RESTRICTED_MODULES` list | `safety.py:20-33` | ✅ 12 modules blocked |
| `print_startup_banner` | `safety.py:142` | ✅ Shows mode on startup |

### Blocked in WEB_NON_CUSTODIAL Mode

| Module | Reason |
|--------|--------|
| `swaperex.signing.*` | Private key access |
| `swaperex.hdwallet.*` | HD wallet derivation |
| `swaperex.withdrawal.factory` | Server-side execution |
| `swaperex.services.deposit_sweeper` | Custodial operation |

### Endpoint Blocking

| Endpoint | Mode | Behavior |
|----------|------|----------|
| `POST /withdrawals/execute` | WEB | Returns 403 Forbidden |
| `POST /withdrawals/execute` | TELEGRAM | Returns 400 (use Telegram) |

---

## Step 2: Endpoint to Frontend Mapping

### `/balances/wallet` — Fetch Wallet Balances

**Method:** `POST`

**Request Payload:**
```typescript
{
  address: string;        // Wallet address (0x...)
  chain: string;          // Chain ID (ethereum, bsc, polygon, etc.)
  include_tokens?: boolean; // Include ERC-20 tokens (default: true)
}
```

**Response:**
```typescript
{
  success: boolean;
  address: string;
  chain: string;
  native_balance: {
    symbol: string;       // ETH, BNB, etc.
    balance: string;      // Decimal string
    usd_value?: string;
  };
  token_balances: Array<{
    symbol: string;
    contract_address: string;
    balance: string;
    usd_value?: string;
  }>;
  total_usd_value?: string;
}
```

**Signing Required:** ❌ No

---

### `/balances/multi-chain` — Fetch Multi-Chain Balances

**Method:** `POST`

**Request Payload:**
```typescript
{
  address: string;
  chains: string[];       // ["ethereum", "bsc", "polygon"]
  include_tokens?: boolean;
}
```

**Response:**
```typescript
{
  success: boolean;
  address: string;
  chains: Record<string, ChainBalance>;
  total_usd_value?: string;
}
```

**Signing Required:** ❌ No

---

### `/quotes/` — Get Swap Quote

**Method:** `POST`

**Request Payload:**
```typescript
{
  from_asset: string;     // "ETH", "USDC", etc.
  to_asset: string;
  amount: string;         // Decimal string
  slippage?: number;      // Percentage (0.5 = 0.5%)
}
```

**Response:**
```typescript
{
  success: boolean;
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
  rate: string;
  fee_amount?: string;
  fee_asset?: string;
  expires_at?: number;
}
```

**Signing Required:** ❌ No

---

### `/swaps/quote` — Get Swap Quote with Unsigned Transaction

**Method:** `POST`

**Request Payload:**
```typescript
{
  from_asset: string;
  to_asset: string;
  amount: string;
  from_address: string;   // User's wallet address
  slippage?: number;
  chain?: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
  minimum_received: string;
  rate: string;
  gas_estimate: {
    gas_limit: number;
    gas_price_gwei: string;
    estimated_cost_native: string;
    estimated_cost_usd?: string;
  };
  route: {
    provider: string;     // "1inch", "dry_run"
    route_type: string;   // "single", "multi-hop"
    protocols_used: string[];
    price_impact_percent?: string;
  };
  transaction: {
    chain: string;
    chain_id: number;
    to: string;           // Router address
    value: string;        // Hex wei
    data: string;         // Calldata
    gas_limit: string;
    gas_price: string;
    description: string;
    warnings?: string[];
  };
  approval_needed: boolean;
  expires_at: number;
  quote_id: string;
}
```

**Signing Required:** ✅ Yes (client-side)

---

### `/withdrawals/template` — Build Unsigned Withdrawal

**Method:** `POST`

**Request Payload:**
```typescript
{
  asset: string;          // "ETH", "USDC", etc.
  amount: string;
  from_address: string;   // User's wallet
  to_address: string;     // Destination
  chain?: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  asset: string;
  amount: string;
  to_address: string;
  chain: string;
  transaction: {
    chain: string;
    chain_id: number;
    to: string;
    value: string;
    data: string;
    gas_limit?: string;
  };
  fee_estimate: {
    gas_limit: number;
    gas_price_gwei: string;
    estimated_fee: string;
    fee_asset: string;
  };
  warnings?: string[];
}
```

**Signing Required:** ✅ Yes (client-side)

---

### `/wallet/connect` — Connect Wallet Session

**Method:** `POST`

**Request Payload:**
```typescript
{
  address: string;        // Wallet address (0x...)
  chain_id: number;       // Current chain ID
  wallet_type: "walletconnect" | "injected" | "readonly" | "hardware";
  is_read_only?: boolean;
}
```

**Response:**
```typescript
{
  success: boolean;
  session: {
    address: string;
    wallet_type: string;
    chain_id: number;
    connected_chains: Array<{
      chain_id: number;
      connected_at: number;
    }>;
    can_sign_messages: boolean;
    can_sign_transactions: boolean;
    is_read_only: boolean;
    created_at: number;
  };
  message?: string;
}
```

**Signing Required:** ❌ No

---

### `/wallet/disconnect` — Disconnect Wallet Session

**Method:** `POST`

**Request Payload:**
```typescript
{
  address: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
  address: string;
}
```

**Signing Required:** ❌ No

---

### `/transactions/build` — Build Unsigned Transaction

**Method:** `POST`

**Request Payload:**
```typescript
{
  action: "approve" | "transfer" | "swap";
  chain: string;
  // For approve:
  token?: string;         // Token contract address
  spender?: string;       // Address to approve
  // For transfer:
  to_address?: string;
  amount?: string;
}
```

**Response:**
```typescript
{
  chain: string;
  chain_id: number;
  to: string;
  value: string;
  data: string;
  gas_limit?: string;
  gas_price?: string;
  description: string;
  warnings?: string[];
}
```

**Signing Required:** ✅ Yes (client-side)

---

### `/transactions/approve` — Build Token Approval

**Method:** `POST`

**Query Parameters:**
```
chain: string
token_address: string
spender: string
unlimited: boolean = true
```

**Response:** Same as `/transactions/build`

**Signing Required:** ✅ Yes (client-side)

---

### `/chains/` — Get Supported Chains

**Method:** `GET`

**Response:**
```typescript
{
  success: boolean;
  chains: Array<{
    id: string;           // "ethereum", "bsc", etc.
    name: string;
    chain_id: number;
    native_asset: string;
    explorer_url?: string;
    rpc_url?: string;
  }>;
}
```

**Signing Required:** ❌ No

---

### `/chains/assets` — Get Supported Assets

**Method:** `GET`

**Response:**
```typescript
{
  success: boolean;
  assets: Array<{
    symbol: string;
    name: string;
    chains: string[];
    decimals: number;
    logo_url?: string;
  }>;
}
```

**Signing Required:** ❌ No

---

## Endpoint Summary Table

| Endpoint | Method | Signing | Description |
|----------|--------|---------|-------------|
| `/balances/wallet` | POST | ❌ | Get wallet balances |
| `/balances/multi-chain` | POST | ❌ | Get multi-chain balances |
| `/balances/address/{addr}/chain/{chain}` | GET | ❌ | Quick balance lookup |
| `/quotes/` | POST | ❌ | Get swap quote |
| `/quotes/multi` | POST | ❌ | Compare quotes |
| `/quotes/pairs` | GET | ❌ | Get trading pairs |
| `/swaps/quote` | POST | ✅ | Get swap with unsigned tx |
| `/swaps/supported-chains` | GET | ❌ | List swap chains |
| `/withdrawals/template` | POST | ✅ | Get withdrawal template |
| `/withdrawals/execute` | POST | 🚫 | **BLOCKED (403)** |
| `/withdrawals/fee-estimate` | GET | ❌ | Estimate fees |
| `/wallet/connect` | POST | ❌ | Connect wallet session |
| `/wallet/disconnect` | POST | ❌ | Disconnect wallet |
| `/wallet/session/{address}` | GET | ❌ | Get session info |
| `/wallet/switch-chain` | POST | ❌ | Switch active chain |
| `/wallet/capabilities/{type}` | GET | ❌ | Get wallet capabilities |
| `/transactions/build` | POST | ✅ | Build unsigned tx |
| `/transactions/approve` | POST | ✅ | Build approval tx |
| `/chains/` | GET | ❌ | List chains |
| `/chains/{chain_id}` | GET | ❌ | Get chain info |
| `/chains/assets` | GET | ❌ | List assets |

---

## Security Summary

### ✅ Allowed in WEB_NON_CUSTODIAL Mode

- Quote generation (all read-only)
- Blockchain balance queries
- Chain/asset metadata
- Unsigned transaction building
- Wallet session management (public address only)

### 🚫 Blocked in WEB_NON_CUSTODIAL Mode

- Transaction signing
- Transaction broadcasting
- Private key access
- HD wallet derivation
- Deposit sweeping
- Server-side withdrawal execution

### Safety Enforcement

```python
# Decorator blocks functions in web mode
@require_custodial
def sign_transaction(...):
    ...  # Raises CustodialAccessError in WEB mode

# Module import blocking
guard_module_import("swaperex.signing")  # Raises in WEB mode

# Runtime checks
if settings.mode == ExecutionMode.WEB_NON_CUSTODIAL:
    raise HTTPException(status_code=403, detail="Blocked in web mode")
```
