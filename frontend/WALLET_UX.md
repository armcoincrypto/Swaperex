# Wallet Connect UX Flow - Step 1 Polish

## UX Flow Diagram

```
                    ┌─────────────────────────────────────────┐
                    │              APP LOADS                   │
                    └─────────────────┬───────────────────────┘
                                      │
                              ┌───────▼───────┐
                              │ Check for     │
                              │ Persisted     │
                              │ Wallet State  │
                              └───────┬───────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │ Yes             │                 │ No
                    ▼                 │                 ▼
          ┌─────────────────┐         │       ┌─────────────────┐
          │ Auto-reconnect  │         │       │ DISCONNECTED    │
          │ Attempt         │         │       │ STATE           │
          └────────┬────────┘         │       └────────┬────────┘
                   │                  │                │
                   │                  │                │
          ┌────────▼────────┐         │       ┌────────▼────────┐
          │ Success?        │         │       │ Show:           │
          │                 │         │       │ - Connect Button│
          └────────┬────────┘         │       │ - Install CTA   │
                   │                  │       │ - View-only     │
        ┌──────────┼──────────┐       │       └────────┬────────┘
        │ Yes      │          │ No    │                │
        ▼          │          ▼       │                │
┌───────────────┐  │   ┌──────────────┐               │
│ CONNECTED     │  │   │ Clear state  │◄──────────────┘
│ STATE         │  │   │ → DISCONNECTED│
└───────┬───────┘  │   └──────────────┘
        │          │
        ▼          │
┌───────────────┐  │
│ Check Chain   │  │
│ Supported?    │  │
└───────┬───────┘  │
        │          │
   ┌────┴────┐     │
   │Yes     │No    │
   ▼         ▼     │
┌──────┐ ┌────────────────┐
│READY │ │ WRONG_CHAIN    │
│      │ │ STATE          │
│      │ │                │
│      │ │ Show warning + │
│      │ │ Switch button  │
└──────┘ └────────────────┘


REJECTION FLOW:
                    ┌─────────────────┐
                    │ User clicks     │
                    │ Connect         │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ CONNECTING      │
                    │ STATE           │
                    │ (Spinner shown) │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Wallet Popup    │
                    │ Opens           │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │ Approve      │              │ Reject
              ▼              │              ▼
    ┌─────────────────┐      │    ┌─────────────────┐
    │ CONNECTED       │      │    │ Show Error:     │
    │                 │      │    │ "Connection     │
    │                 │      │    │ rejected"       │
    └─────────────────┘      │    └────────┬────────┘
                             │             │
                             │    ┌────────▼────────┐
                             │    │ DISCONNECTED    │
                             │    │ (try again btn) │
                             │    └─────────────────┘


READ-ONLY MODE:
                    ┌─────────────────┐
                    │ User enters     │
                    │ address manually│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Validate        │
                    │ 0x address      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ READ_ONLY       │
                    │ STATE           │
                    │                 │
                    │ - View balances │
                    │ - View quotes   │
                    │ - NO signing    │
                    │ - Badge shown   │
                    └─────────────────┘
```

---

## Wallet States

| State | `isConnected` | `isConnecting` | `isWrongChain` | `isReadOnly` | Description |
|-------|---------------|----------------|----------------|--------------|-------------|
| `DISCONNECTED` | `false` | `false` | `false` | `false` | No wallet connected |
| `CONNECTING` | `false` | `true` | `false` | `false` | Waiting for user approval |
| `CONNECTED` | `true` | `false` | `false` | `false` | Ready for transactions |
| `WRONG_CHAIN` | `true` | `false` | `true` | `false` | Connected but unsupported chain |
| `READ_ONLY` | `true` | `false` | `false` | `true` | View-only mode (no signing) |
| `REJECTED` | `false` | `false` | `false` | `false` | User denied (show error) |
| `ERROR` | `false` | `false` | `false` | `false` | Connection failed (show error) |

---

## State Transitions

| From | Trigger | To | UI Action |
|------|---------|-----|-----------|
| `DISCONNECTED` | Click "Connect" | `CONNECTING` | Show spinner, disable button |
| `CONNECTING` | Wallet approves | `CONNECTED` or `WRONG_CHAIN` | Show address, check chain |
| `CONNECTING` | Wallet rejects | `DISCONNECTED` | Show rejection message |
| `CONNECTING` | Timeout (30s) | `DISCONNECTED` | Show timeout message |
| `CONNECTED` | Chain changes to unsupported | `WRONG_CHAIN` | Show chain warning |
| `WRONG_CHAIN` | User switches chain | `CONNECTED` | Hide warning |
| `WRONG_CHAIN` | Click "Switch" | (waiting) | Request chain switch |
| `CONNECTED` | Click "Disconnect" | `DISCONNECTED` | Clear state |
| `DISCONNECTED` | Enter address | `READ_ONLY` | Show view-only badge |
| `READ_ONLY` | Click "Exit" | `DISCONNECTED` | Clear state |

---

## Components to Adjust

### 1. `WalletConnect.tsx` (MAJOR)
**Current Issues:**
- No read-only mode
- No wrong chain indicator in button
- No loading states for chain switch
- Simple error display

**Improvements:**
- Add read-only address input
- Show chain warning badge on button
- Better connection states UI
- Retry button on rejection

### 2. `ChainWarning.tsx` (MINOR)
**Current:** Already well-structured
**Improvements:**
- Add "connecting..." state to switch buttons
- Better mobile layout

### 3. `App.tsx` (MINOR)
**Improvements:**
- Add ChainWarningBanner at top when wrong chain
- Block navigation during connection

### 4. `walletStore.ts` (ADD)
**Add:**
- `isReadOnly` state
- `connectionError` state
- `setReadOnlyAddress` action

### 5. `useWallet.ts` (ADD)
**Add:**
- `enterReadOnlyMode` function
- Better error handling
- Auto-reconnect on mount

---

## User-Facing Messages

### Connection States

| State | Primary Message | Secondary Message | CTA |
|-------|-----------------|-------------------|-----|
| No Wallet | "Connect Wallet" | "Start trading by connecting your wallet" | [Connect Wallet] |
| No MetaMask | "Install MetaMask" | "A Web3 wallet is required to use this app" | [Get MetaMask] |
| Connecting | "Connecting..." | "Please approve in your wallet" | (spinner) |
| Connected | "0x1234...5678" | Chain badge | [dropdown menu] |
| Wrong Chain | "Wrong Network" | "Switch to Ethereum, BSC, or Polygon" | [Switch Network] |
| Read-Only | "0x1234...5678" | "View-only mode" | [Connect to Trade] |

### Error Messages

| Error Type | Message | Action |
|------------|---------|--------|
| User rejected | "Connection cancelled" | "Try Again" button |
| Timeout | "Connection timed out" | "Try Again" button |
| Network error | "Failed to connect. Check your connection." | "Retry" button |
| Chain switch failed | "Failed to switch network. Add it to your wallet first." | "Add Network" button |
| No wallet | "No wallet detected" | "Install MetaMask" button |

### Chain Warning Messages

| Scenario | Message |
|----------|---------|
| Unsupported chain | "You're connected to [Chain Name], which is not supported. Please switch to a supported network." |
| Wrong chain for action | "This swap requires [Required Chain]. You're on [Current Chain]." |

### Action Feedback

| Action | Message |
|--------|---------|
| Address copied | "Address copied to clipboard" (toast) |
| Chain switched | "Switched to [Chain Name]" (toast) |
| Disconnected | "Wallet disconnected" (toast) |

---

## Implementation Checklist

### Phase 1: Store Updates
- [ ] Add `isReadOnly` to walletStore
- [ ] Add `connectionError` to walletStore
- [ ] Add `setReadOnlyAddress` action
- [ ] Add `clearError` action

### Phase 2: Hook Updates
- [ ] Add `enterReadOnlyMode` to useWallet
- [ ] Add auto-reconnect logic
- [ ] Improve error categorization
- [ ] Add connection timeout

### Phase 3: Component Updates
- [ ] Enhance WalletConnect with all states
- [ ] Add read-only address input
- [ ] Add ChainWarningBanner to App
- [ ] Add retry buttons on errors

### Phase 4: Polish
- [ ] Toast notifications for actions
- [ ] Loading states on all buttons
- [ ] Mobile-responsive layouts
- [ ] Keyboard accessibility
