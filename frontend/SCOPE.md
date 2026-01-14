# Swaperex Web Frontend - Non-Custodial Mode

## Overview

This frontend is designed for **WEB_NON_CUSTODIAL** mode only. The backend **never** handles private keys, signs transactions, or broadcasts to the network. All signing happens client-side via WalletConnect or injected wallets (MetaMask, etc.).

## Security Principles

| Principle | Implementation |
|-----------|----------------|
| No private keys on backend | Wallet abstraction only stores public address |
| No server-side signing | All transactions returned unsigned |
| No server-side broadcasting | Client broadcasts via wallet |
| User controls funds | Wallet popup required for every transaction |
| Instant revocation | User can disconnect anytime |

---

## Backend API Endpoints Mapping

### 1. Chain Information (`/chains`)

| Endpoint | Method | Frontend Usage |
|----------|--------|----------------|
| `GET /chains/` | GET | Populate chain selector dropdown |
| `GET /chains/{chain_id}` | GET | Get chain details (RPC, explorer) |
| `GET /chains/assets/` | GET | List of supported tokens |

**Frontend Component**: `<ChainSelector />`, `<AssetList />`

---

### 2. Quotes (`/quotes`)

| Endpoint | Method | Frontend Usage |
|----------|--------|----------------|
| `POST /quotes/` | POST | Get best swap quote |
| `POST /quotes/multi` | POST | Compare quotes from multiple DEXs |
| `GET /quotes/pairs` | GET | Show available trading pairs |

**Request Schema**:
```typescript
interface QuoteRequest {
  from_asset: string;
  to_asset: string;
  amount: string;
  slippage?: number;
}
```

**Frontend Component**: `<SwapQuote />`, `<QuoteComparison />`

---

### 3. Wallet Balances (`/balances`)

| Endpoint | Method | Frontend Usage |
|----------|--------|----------------|
| `POST /balances/wallet` | POST | Get wallet balances from blockchain |
| `POST /balances/multi-chain` | POST | Get balances across all chains |
| `GET /balances/address/{addr}/chain/{chain}` | GET | Quick balance lookup |

**Request Schema**:
```typescript
interface WalletBalanceRequest {
  address: string;
  chain: string;
  include_tokens?: boolean;
}
```

**Frontend Component**: `<BalanceCard />`, `<TokenList />`

---

### 4. Wallet Connection (`/wallet`)

| Endpoint | Method | Frontend Usage |
|----------|--------|----------------|
| `POST /wallet/connect` | POST | Register wallet session |
| `POST /wallet/disconnect` | POST | End session |
| `GET /wallet/session/{address}` | GET | Get session info |
| `POST /wallet/switch-chain` | POST | Switch active chain |
| `GET /wallet/capabilities/{type}` | GET | Get wallet capabilities |

**Request Schema**:
```typescript
interface ConnectWalletRequest {
  address: string;
  chain_id: number;
  wallet_type: 'walletconnect' | 'injected' | 'readonly' | 'hardware';
  is_read_only?: boolean;
}
```

**Frontend Component**: `<WalletConnect />`, `<WalletInfo />`

---

### 5. Transactions (`/transactions`)

| Endpoint | Method | Frontend Usage |
|----------|--------|----------------|
| `POST /transactions/build` | POST | Build unsigned transaction |
| `POST /transactions/approve` | POST | Build token approval tx |

**Response**: Returns unsigned transaction for client signing.

**Frontend Component**: `<TransactionBuilder />`, `<ApprovalModal />`

---

### 6. Swaps (`/swaps`)

| Endpoint | Method | Frontend Usage |
|----------|--------|----------------|
| `POST /swaps/quote` | POST | Get swap quote with unsigned tx |

**Response**: Returns swap quote + unsigned transaction calldata.

**Frontend Component**: `<SwapInterface />`

---

### 7. Withdrawals (`/withdrawals`)

| Endpoint | Method | Frontend Usage |
|----------|--------|----------------|
| `POST /withdrawals/template` | POST | Get withdrawal tx template |
| `POST /withdrawals/execute` | POST | **BLOCKED (403)** |
| `GET /withdrawals/fee-estimate` | GET | Estimate withdrawal fees |

**Response**: Returns unsigned withdrawal transaction.

**Frontend Component**: `<WithdrawInterface />`

---

## Frontend Architecture

```
frontend/
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── assets/
│       └── tokens/           # Token logos
│
├── src/
│   ├── api/
│   │   ├── client.ts         # Axios/fetch wrapper
│   │   ├── chains.ts         # /chains endpoints
│   │   ├── quotes.ts         # /quotes endpoints
│   │   ├── balances.ts       # /balances endpoints
│   │   ├── wallet.ts         # /wallet endpoints
│   │   ├── transactions.ts   # /transactions endpoints
│   │   ├── swaps.ts          # /swaps endpoints
│   │   └── withdrawals.ts    # /withdrawals endpoints
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Loading.tsx
│   │   │   └── Toast.tsx
│   │   │
│   │   ├── wallet/
│   │   │   ├── WalletConnect.tsx
│   │   │   ├── WalletInfo.tsx
│   │   │   ├── ChainSelector.tsx
│   │   │   └── AddressDisplay.tsx
│   │   │
│   │   ├── swap/
│   │   │   ├── SwapInterface.tsx
│   │   │   ├── TokenSelector.tsx
│   │   │   ├── SwapQuote.tsx
│   │   │   ├── QuoteComparison.tsx
│   │   │   └── SlippageSettings.tsx
│   │   │
│   │   └── balances/
│   │       ├── BalanceCard.tsx
│   │       ├── TokenList.tsx
│   │       └── PortfolioValue.tsx
│   │
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Swap.tsx
│   │   ├── Portfolio.tsx
│   │   └── Settings.tsx
│   │
│   ├── stores/
│   │   ├── walletStore.ts    # Zustand/Redux for wallet state
│   │   ├── balanceStore.ts   # Token balances cache
│   │   └── swapStore.ts      # Swap form state
│   │
│   ├── hooks/
│   │   ├── useWallet.ts      # Wallet connection hook
│   │   ├── useBalances.ts    # Balance fetching hook
│   │   ├── useQuote.ts       # Quote polling hook
│   │   ├── useTransaction.ts # Transaction building/signing
│   │   └── useChain.ts       # Chain switching hook
│   │
│   ├── utils/
│   │   ├── format.ts         # Number/address formatting
│   │   ├── validation.ts     # Input validation
│   │   ├── constants.ts      # Chain configs, token lists
│   │   └── errors.ts         # Error handling
│   │
│   ├── types/
│   │   ├── api.ts            # API response types
│   │   ├── wallet.ts         # Wallet types
│   │   └── swap.ts           # Swap types
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## User Flow

### 1. Connect Wallet
```
User clicks "Connect Wallet"
  → WalletConnect/MetaMask popup
  → User approves connection
  → Frontend gets address
  → POST /wallet/connect (register session)
  → GET /balances/wallet (fetch balances)
  → Display portfolio
```

### 2. Swap Tokens
```
User selects from/to tokens and amount
  → POST /quotes/ (get quote)
  → Display quote with rate and fees
  → User clicks "Swap"
  → POST /swaps/quote (get unsigned tx)
  → Wallet popup for signing
  → User signs transaction
  → Frontend broadcasts to network
  → Wait for confirmation
  → Refresh balances
```

### 3. Withdraw/Send
```
User enters destination and amount
  → POST /withdrawals/template (get unsigned tx)
  → Display fee estimate
  → User clicks "Send"
  → Wallet popup for signing
  → Frontend broadcasts
  → Show transaction hash
```

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| State Management | Zustand |
| API Client | Axios |
| Wallet Connection | @web3-react or wagmi |
| Ethereum Interaction | ethers.js v6 |
| UI Components | Headless UI / Radix |

---

## Environment Variables

```env
VITE_API_URL=http://localhost:8000
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
VITE_CHAIN_ID=1
VITE_ENVIRONMENT=development
```

---

## Security Checklist

- [ ] Never store private keys in localStorage/sessionStorage
- [ ] Always validate addresses before transactions
- [ ] Show clear transaction details before signing
- [ ] Implement slippage protection
- [ ] Rate limit API requests
- [ ] Sanitize all user inputs
- [ ] Use HTTPS in production
- [ ] Implement CSP headers
