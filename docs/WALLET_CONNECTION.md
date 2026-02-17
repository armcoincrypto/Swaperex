# Wallet Connection — Setup & Troubleshooting

## Architecture

Swaperex uses a custom multi-connector wallet layer built on:

- **`@walletconnect/ethereum-provider`** — WalletConnect v2 (QR + deep link)
- **`@walletconnect/modal`** — QR code modal UI
- **`ethers.js`** — Provider/Signer abstraction for transactions
- **Custom injected detection** — MetaMask, Rabby, Brave, Coinbase ext, OKX

### Why not wagmi/Web3Modal?

The existing codebase uses raw ethers.js (`BrowserProvider`, `getSigner()`) in 18+ files (swap, withdrawal, balance, transaction hooks). Migrating to wagmi/viem would require rewriting all of those. Instead, we plugged WalletConnect v2 into the existing architecture with zero changes to consumer code.

## Supported Wallets

| Wallet | Connector | How it works |
|--------|-----------|-------------|
| MetaMask | injected | `window.ethereum` (browser extension) |
| Rabby | injected | Detected via `window.ethereum.isRabby` |
| Brave Wallet | injected | Detected via `window.ethereum.isBraveWallet` |
| Coinbase Wallet (ext) | injected | Detected via `window.ethereum.isCoinbaseWallet` |
| OKX Wallet | injected | Detected via `window.ethereum.isOkxWallet` |
| Any WalletConnect wallet | walletconnect | QR code scan / deep link |
| Coinbase Wallet (mobile) | walletconnect | Via WalletConnect QR |
| Ledger Live | walletconnect | Via WalletConnect QR |
| Trust Wallet | walletconnect | Via WalletConnect QR |
| Rainbow | walletconnect | Via WalletConnect QR |

## Supported Chains

| Chain | ID | Native Token |
|-------|----|-------------|
| Ethereum | 1 | ETH |
| BNB Chain | 56 | BNB |
| Polygon | 137 | MATIC |
| Arbitrum | 42161 | ETH |
| Optimism | 10 | ETH |
| Avalanche | 43114 | AVAX |

## Environment Variables

Create a `.env` file in the **repo root** (for backend) and/or in `frontend/` (for Vite):

```bash
# Required for WalletConnect v2
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here

# Optional
VITE_DEFAULT_CHAIN_ID=1
VITE_API_URL=http://localhost:8000
```

### Getting a WalletConnect Project ID

1. Go to https://cloud.walletconnect.com
2. Create a free account
3. Create a new project (type: "App")
4. Copy the Project ID
5. Add it to your `.env` file

**Without this ID, WalletConnect will show an error when users try to connect.**

## File Structure

```
frontend/src/
├── wallet/
│   ├── index.ts          # Public API exports
│   ├── types.ts          # EIP1193Provider, ConnectorId, ChainConfig types
│   ├── chains.ts         # Central chain config (single source of truth)
│   └── connectors.ts     # connect/disconnect/autoReconnect logic
├── hooks/
│   └── useWallet.ts      # React hook (same API as before + connectWalletConnect)
├── components/wallet/
│   └── WalletConnect.tsx  # UI component (wallet picker + connected dropdown)
└── stores/
    └── walletStore.ts     # Zustand store (unchanged interface)
```

## How It Works

### Connection Flow

1. User clicks "Connect Wallet" → wallet picker dropdown opens
2. User selects connector type:
   - **Injected**: calls `eth_requestAccounts` on `window.ethereum`
   - **WalletConnect**: creates `EthereumProvider`, shows QR modal, waits for scan
3. On success:
   - Raw EIP-1193 provider stored in ref
   - `ethers.BrowserProvider` + `Signer` created for transaction signing
   - `walletStore.connect()` called with address, chainId, walletType
   - Balance fetch triggered (non-blocking)
   - Connector ID saved to `localStorage` for auto-reconnect

### Auto-Reconnect

On page load, `useWallet` checks `localStorage` for last connector:
- **injected**: calls `eth_accounts` (no prompt) — if accounts exist, reconnects
- **walletconnect**: re-initializes `EthereumProvider` with `showQrModal: false` — if session exists, reconnects

### Event Handling

Both connector types fire standard EIP-1193 events:
- `accountsChanged` → updates address, emits `wallet_events.account_changed`
- `chainChanged` → updates chainId, emits `wallet_events.chain_changed`
- WC `session_delete` → disconnects, emits `wallet_events.disconnect`

All active operations (swaps, quotes, etc.) subscribe to these events and cancel safely.

### Network Switching

`switchNetwork(chainId)` flow:
1. Calls `wallet_switchEthereumChain` on the active provider
2. If chain not found (error 4902), calls `wallet_addEthereumChain` with params from `chains.ts`
3. Updates store + emits chain_changed event

## Troubleshooting

### "WalletConnect Project ID not configured"
- Set `VITE_WALLETCONNECT_PROJECT_ID` in your `.env` file
- Restart the dev server after changing `.env`

### QR modal appears but nothing happens after scanning
- Check that your WalletConnect Project ID is valid
- Ensure the wallet app supports WalletConnect v2
- Check browser console for WebSocket errors

### "No browser wallet detected"
- Install MetaMask or another browser wallet extension
- If using Brave, enable Brave Wallet in settings

### Chain switching fails
- Some wallets don't support `wallet_addEthereumChain` — user must add the chain manually
- WalletConnect chain switching depends on the mobile wallet's support

### Auto-reconnect doesn't work
- Clear `localStorage` key `swaperex_last_connector` to reset
- WalletConnect sessions expire after ~7 days by default

## Development

```bash
# Install deps
cd frontend && npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Type check only
npx tsc --noEmit
```

## Smoke Test Checklist

- [ ] **MetaMask injected**: Click Connect → MetaMask → approve → shows address + chain + balance
- [ ] **Rabby injected**: Same flow, shows "Rabby" as wallet label
- [ ] **WalletConnect QR**: Click Connect → WalletConnect → scan QR with mobile wallet → connected
- [ ] **Coinbase via WC**: Click Connect → Coinbase → scan QR with Coinbase app → connected
- [ ] **Auto-reconnect**: Connect, refresh page → wallet re-connects without prompt
- [ ] **Account change**: Switch account in MetaMask → UI updates address, active operations cancel
- [ ] **Chain change**: Switch chain in MetaMask → UI updates chain badge, operations cancel
- [ ] **Network switch**: Click network selector → switch to BSC → wallet prompts, chain updates
- [ ] **Unsupported chain**: Switch to chain not in list → "Wrong Network" shows, "Switch" button works
- [ ] **Disconnect**: Click address → Disconnect → clears all state, localStorage cleared
- [ ] **View-only mode**: Click Connect → View Address → enter address → shows balances, swap blocked
- [ ] **Error: user reject**: Click Connect → MetaMask → click Cancel → "Connection cancelled" shows
- [ ] **Error: no WC project ID**: Remove env var → click WalletConnect → clear error message
- [ ] **Build**: `npm run build` succeeds with zero errors
