# Page to Backend Endpoint Mapping

## Overview

This document maps each frontend page/feature to its corresponding backend endpoints, specifying which operations are read-only and which require transaction signing.

---

## Page Summary

| Page | Route | Primary Endpoints | Signing Required |
|------|-------|-------------------|------------------|
| Connect Wallet | `/` | `/wallet/connect` | No (wallet approval only) |
| Wallet Overview | `/portfolio` | `/balances/wallet` | No |
| Swap | `/swap` | `/quotes`, `/swaps/quote`, `/transactions/build` | Yes (for swap) |
| Transaction History | `/history` | `/transactions/history` | No |
| Deposit | `/deposit` | None | No (instructions only) |

---

## 1. Connect Wallet Page

**Route**: `/` (when disconnected)

**Purpose**: Allow users to connect their wallet via MetaMask or WalletConnect.

### Flow

```
┌────────────────────────────────────────────────────────────────┐
│                     CONNECT WALLET PAGE                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  [MetaMask Icon]              [WalletConnect Icon]             │
│  ┌──────────────────┐        ┌──────────────────┐             │
│  │  Connect with    │        │  Connect with    │             │
│  │    MetaMask      │        │  WalletConnect   │             │
│  └──────────────────┘        └──────────────────┘             │
│                                                                │
│  [Read-Only Mode]                                              │
│  ┌──────────────────────────────────────────────┐             │
│  │  Enter address to view balances (read-only)  │             │
│  └──────────────────────────────────────────────┘             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Backend Endpoints

| Action | Endpoint | Method | Request | Response |
|--------|----------|--------|---------|----------|
| Register session | `/wallet/connect` | POST | `{ address, chain_id, wallet_type }` | `{ success, session }` |
| Get capabilities | `/wallet/capabilities/{type}` | GET | - | `{ can_sign, chains }` |

### State After Connection

```typescript
{
  isConnected: true,
  address: "0x1234...5678",
  chainId: 1,
  walletType: "injected"
}
```

### Notes
- No private keys ever sent to backend
- Only public address is registered
- Connection state stored client-side

---

## 2. Wallet Overview / Portfolio Page

**Route**: `/portfolio`

**Purpose**: Display user's token balances across all supported chains.

### Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    WALLET OVERVIEW PAGE                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Total Balance: $12,345.67                                     │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Chain: [Ethereum ▼] [BSC] [Polygon] [All Chains]        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Token      │ Balance      │ Value         │ 24h Change  │  │
│  ├────────────┼──────────────┼───────────────┼─────────────┤  │
│  │ ETH        │ 2.5000       │ $5,000.00     │ +2.3%       │  │
│  │ USDC       │ 1,000.00     │ $1,000.00     │ 0.0%        │  │
│  │ USDT       │ 500.00       │ $500.00       │ 0.0%        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  [Refresh Balances]                                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Backend Endpoints

| Action | Endpoint | Method | Request | Response |
|--------|----------|--------|---------|----------|
| Get single chain | `/balances/wallet` | POST | `{ address, chain }` | `{ native_balance, token_balances }` |
| Get all chains | `/balances/multi-chain` | POST | `{ address, chains[] }` | `{ chain: balances }` |
| Quick lookup | `/balances/address/{addr}/chain/{chain}` | GET | - | `{ balance }` |

### Request Example

```typescript
// Single chain request
POST /balances/wallet
{
  "address": "0x1234...5678",
  "chain": "ethereum",
  "include_tokens": true
}
```

### Response Example

```typescript
{
  "address": "0x1234...5678",
  "chain": "ethereum",
  "native_balance": {
    "symbol": "ETH",
    "balance": "2.5",
    "usd_value": 5000.00
  },
  "token_balances": [
    {
      "symbol": "USDC",
      "address": "0xa0b8...",
      "balance": "1000.0",
      "usd_value": 1000.00
    }
  ],
  "total_usd_value": 6000.00
}
```

### Notes
- **READ-ONLY**: No signing required
- Balances fetched directly from blockchain RPC
- Cached briefly to reduce RPC calls
- Polling interval: 30 seconds

---

## 3. Swap Page

**Route**: `/swap`

**Purpose**: Allow users to swap tokens. Returns unsigned transactions for client-side signing.

### Flow

```
┌────────────────────────────────────────────────────────────────┐
│                         SWAP PAGE                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ From                                                      │ │
│  │ [ETH ▼]                                          1.0     │ │
│  │ Balance: 2.5 ETH                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          [↓↑]                                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ To                                                        │ │
│  │ [USDC ▼]                                      ~2,000.00  │ │
│  │ Balance: 1,000 USDC                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Rate: 1 ETH = 2,000 USDC                                  │ │
│  │ Price Impact: 0.05%                                       │ │
│  │ Minimum Received: 1,990 USDC                              │ │
│  │ Network Fee: ~$5.00                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                       [SWAP]                              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Backend Endpoints

| Action | Endpoint | Method | Signing | Notes |
|--------|----------|--------|---------|-------|
| Get quote | `/quotes/` | POST | No | Price preview only |
| Compare quotes | `/quotes/multi` | POST | No | Multi-DEX comparison |
| Get pairs | `/quotes/pairs` | GET | No | Available pairs |
| Build swap tx | `/swaps/quote` | POST | **Yes** | Returns unsigned tx |
| Build approval | `/transactions/approve` | POST | **Yes** | Token approval tx |

### Quote Request (READ-ONLY)

```typescript
POST /quotes/
{
  "from_asset": "ETH",
  "to_asset": "USDC",
  "amount": "1.0",
  "slippage": 0.5,
  "chain": "ethereum"
}
```

### Quote Response

```typescript
{
  "from_asset": "ETH",
  "to_asset": "USDC",
  "from_amount": "1.0",
  "to_amount": "2000.0",
  "rate": "2000.0",
  "price_impact": "0.05",
  "minimum_received": "1990.0",
  "expires_at": "2024-01-01T12:00:00Z",
  "route": ["ETH", "WETH", "USDC"],
  "dex": "uniswap_v3"
}
```

### Swap Execution Request (REQUIRES SIGNING)

```typescript
POST /swaps/quote
{
  "from_asset": "ETH",
  "to_asset": "USDC",
  "amount": "1.0",
  "slippage": 0.5,
  "sender_address": "0x1234...5678"
}
```

### Swap Response (Unsigned Transaction)

```typescript
{
  "quote": { ... },
  "transaction": {
    "to": "0xRouter...",
    "data": "0x38ed1739...",
    "value": "1000000000000000000",
    "gas_limit": "250000",
    "chain_id": 1
  },
  "requires_approval": false
}
```

### Client-Side Signing

```typescript
// Frontend handles signing - NEVER backend
const signer = await provider.getSigner();
const tx = await signer.sendTransaction({
  to: response.transaction.to,
  data: response.transaction.data,
  value: response.transaction.value,
  gasLimit: response.transaction.gas_limit,
});
// Wallet popup appears for user to confirm
await tx.wait();
```

---

## 4. Transaction History Page

**Route**: `/history`

**Purpose**: Display past transactions (read-only).

### Flow

```
┌────────────────────────────────────────────────────────────────┐
│                   TRANSACTION HISTORY PAGE                     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Filter: [All ▼] [Swaps] [Transfers] [Approvals]          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ✓ Swap ETH → USDC          │ $2,000.00 │ 2 hours ago    │ │
│  │   0xabc...123              │           │ [View ↗]       │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ ✓ Transfer USDC            │ $500.00   │ 1 day ago      │ │
│  │   To: 0xdef...456          │           │ [View ↗]       │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ ✓ Approve USDT             │ Unlimited │ 2 days ago     │ │
│  │   Spender: 0xRouter...     │           │ [View ↗]       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  [Load More]                                                   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Backend Endpoints

| Action | Endpoint | Method | Signing | Notes |
|--------|----------|--------|---------|-------|
| Get history | `/transactions/history` | GET | No | Read-only |
| Get by hash | `/transactions/{hash}` | GET | No | Single tx details |

### Request

```typescript
GET /transactions/history?address=0x1234...5678&chain=ethereum&limit=20
```

### Response

```typescript
{
  "transactions": [
    {
      "hash": "0xabc...123",
      "type": "swap",
      "status": "confirmed",
      "from_asset": "ETH",
      "to_asset": "USDC",
      "from_amount": "1.0",
      "to_amount": "2000.0",
      "timestamp": "2024-01-01T10:00:00Z",
      "gas_used": "150000",
      "gas_price": "30000000000"
    }
  ],
  "total": 45,
  "page": 1
}
```

### Notes
- **READ-ONLY**: No signing required
- Data fetched from indexer or blockchain
- Optional: Can also use `/balances/wallet` with `include_history: true`

---

## 5. Deposit Page

**Route**: `/deposit`

**Purpose**: Show deposit instructions (read-only, no backend interaction).

### Flow

```
┌────────────────────────────────────────────────────────────────┐
│                        DEPOSIT PAGE                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Your Deposit Address:                                         │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 0x1234567890abcdef1234567890abcdef12345678              │ │
│  │                                          [Copy] [QR]     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ⚠️  Important:                                                │
│  • Only send assets on supported networks                      │
│  • Sending to wrong network may result in loss                 │
│  • Minimum deposit: $10                                        │
│                                                                │
│  Supported Networks:                                           │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ [✓] Ethereum  [✓] BSC  [✓] Polygon  [✓] Arbitrum        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Backend Endpoints

| Action | Endpoint | Method | Notes |
|--------|----------|--------|-------|
| None | - | - | Client-side only |

### Notes
- **READ-ONLY**: No backend calls needed
- Displays connected wallet address
- Shows supported networks from config
- **NO private keys involved** - just displaying user's own address

---

## Endpoint Security Summary

| Endpoint | Auth Required | Signing Required | Operation Type |
|----------|--------------|------------------|----------------|
| `/chains/*` | No | No | Read-only |
| `/quotes/*` | No | No | Read-only |
| `/balances/*` | No | No | Read-only |
| `/wallet/connect` | No | No | Session only |
| `/wallet/disconnect` | No | No | Session only |
| `/transactions/history` | No | No | Read-only |
| `/swaps/quote` | No | **Yes (client)** | Returns unsigned tx |
| `/transactions/build` | No | **Yes (client)** | Returns unsigned tx |
| `/transactions/approve` | No | **Yes (client)** | Returns unsigned tx |
| `/withdrawals/template` | No | **Yes (client)** | Returns unsigned tx |
| `/withdrawals/execute` | **BLOCKED** | N/A | 403 in web mode |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   FRONTEND                    BACKEND                   BLOCKCHAIN      │
│   ────────                    ───────                   ──────────      │
│                                                                         │
│   ┌─────────┐   GET /chains   ┌─────────┐                              │
│   │  Chain  │ ───────────────> │  Chain  │                              │
│   │Selector │ <─────────────── │  Info   │                              │
│   └─────────┘   { chains[] }   └─────────┘                              │
│                                                                         │
│   ┌─────────┐  POST /balances  ┌─────────┐  eth_getBalance  ┌────────┐ │
│   │ Balance │ ────────────────> │ Balance │ ───────────────> │  RPC   │ │
│   │  View   │ <──────────────── │ Service │ <─────────────── │  Node  │ │
│   └─────────┘   { balances }   └─────────┘   { balance }    └────────┘ │
│                                                                         │
│   ┌─────────┐   POST /quotes   ┌─────────┐                              │
│   │  Quote  │ ────────────────> │  Quote  │  (price oracles)            │
│   │ Display │ <──────────────── │ Engine  │                              │
│   └─────────┘   { quote }      └─────────┘                              │
│                                                                         │
│   ┌─────────┐  POST /swaps     ┌─────────┐                              │
│   │  Swap   │ ────────────────> │   Tx    │                              │
│   │ Button  │ <──────────────── │ Builder │                              │
│   └────┬────┘   { unsigned }   └─────────┘                              │
│        │                                                                │
│        │ User signs                                                     │
│        ▼                                                                │
│   ┌─────────┐                               ┌────────┐                  │
│   │ WALLET  │  sendTransaction             │  Chain  │                  │
│   │ (local) │ ─────────────────────────────> │ Network │                  │
│   └─────────┘                               └────────┘                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Error States Per Page

| Page | Error | User Message | Action |
|------|-------|--------------|--------|
| Connect | No wallet | "Install MetaMask to continue" | Show install link |
| Portfolio | Not connected | "Connect wallet to view balances" | Show connect button |
| Portfolio | Fetch failed | "Unable to load balances" | Retry button |
| Swap | No quote | "Enter amount to get quote" | - |
| Swap | Quote expired | "Quote expired, refreshing..." | Auto-refresh |
| Swap | Wrong chain | "Switch to {chain} to swap" | Switch button |
| Swap | Insufficient balance | "Insufficient {token} balance" | - |
| Swap | User rejected | "Transaction cancelled" | - |
| History | No transactions | "No transactions yet" | - |
