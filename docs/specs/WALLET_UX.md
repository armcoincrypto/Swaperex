# Wallet Connect UX Flow - Step 1 Polish

## UX Flow Diagram

```
                    ┌─────────────────────────────────────────┐
                    │              APP LOADS                   │
                    └─────────────────┬───────────────────────┘
                                      │
                              ┌───────▼───────┐
                              │ DISCONNECTED  │
                              │ STATE         │
                              │               │
                              │ Show:         │
                              │ [Connect      │
                              │  Wallet]      │
                              └───────┬───────┘
                                      │
                                      │ User clicks
                                      │ "Connect Wallet"
                                      ▼
                    ┌─────────────────────────────────────────┐
                    │         WALLET SELECTION DROPDOWN        │
                    │                                          │
                    │  ┌────────────────────────────────────┐  │
                    │  │ 🦊 MetaMask                        │  │
                    │  │    Connect with browser wallet     │  │
                    │  ├────────────────────────────────────┤  │
                    │  │ 🔗 WalletConnect                   │  │
                    │  │    Scan with mobile wallet         │  │
                    │  ├────────────────────────────────────┤  │
                    │  │ 👁  View Address                   │  │
                    │  │    View balances without signing   │  │
                    │  └────────────────────────────────────┘  │
                    └─────────────────┬───────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
     ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
     │ MetaMask    │         │ WalletConnect│        │ View-Only   │
     │ selected    │         │ selected     │        │ selected    │
     └──────┬──────┘         └──────────────┘        └──────┬──────┘
            │                                                │
            │ NOW wallet                                     │
            │ popup opens                                    │
            ▼                                                ▼
   ┌────────────────┐                              ┌─────────────────┐
   │ CONNECTING     │                              │ Address Input   │
   │ STATE          │                              │                 │
   │ (Spinner shown)│                              │ Enter 0x...     │
   │                │                              │ [View] [Cancel] │
   └────────┬───────┘                              └────────┬────────┘
            │                                               │
   ┌────────┼────────┐                            ┌────────┼────────┐
   │ Approve│ Reject │                            │ Valid  │ Invalid│
   ▼        ▼                                     ▼        ▼
┌──────┐  ┌─────────────┐                   ┌──────────┐ ┌───────────┐
│CONN- │  │ ERROR STATE │                   │READ_ONLY │ │Show error │
│ECTED │  │             │                   │STATE     │ │"Invalid   │
│      │  │ "Connection │                   │          │ │ address"  │
│      │  │  cancelled" │                   │View-only │ │           │
│      │  │             │                   │badge     │ │No retry   │
│      │  │[Retry][Cancel]                  └──────────┘ └───────────┘
└──────┘  └─────────────┘


CRITICAL RULES:
1. MetaMask popup ONLY opens AFTER user explicitly selects MetaMask
2. Clicking "Connect Wallet" shows wallet selection dropdown first
3. Clicking outside dropdown closes it (no popup)
4. Closing MetaMask popup does NOT auto-retry
5. User must click "Try Again" to retry connection
6. Invalid address shows inline error, no automatic retry


CHAIN CHECK (after connection):
                    ┌───────────────┐
                    │ CONNECTED     │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │ Check Chain   │
                    │ Supported?    │
                    └───────┬───────┘
                            │
                   ┌────────┴────────┐
                   │Yes              │No
                   ▼                 ▼
            ┌──────────┐    ┌────────────────┐
            │  READY   │    │ WRONG_CHAIN    │
            │          │    │ STATE          │
            │          │    │                │
            │          │    │ Show warning + │
            │          │    │ Switch button  │
            └──────────┘    └────────────────┘
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
| `DISCONNECTED` | Click "Connect Wallet" | `SELECTING` | Show wallet dropdown |
| `SELECTING` | Click outside dropdown | `DISCONNECTED` | Close dropdown, NO popup |
| `SELECTING` | Select MetaMask | `CONNECTING` | Close dropdown, THEN popup opens |
| `SELECTING` | Select View-Only | `ADDRESS_INPUT` | Show address input field |
| `CONNECTING` | Wallet approves | `CONNECTED` or `WRONG_CHAIN` | Show address, check chain |
| `CONNECTING` | Wallet rejects | `ERROR` | Show rejection message |
| `CONNECTING` | Close popup | `ERROR` | Show "Connection cancelled" |
| `ERROR` | Click "Try Again" | `CONNECTING` | Retry with same wallet type |
| `ERROR` | Click "Cancel" | `DISCONNECTED` | Reset to initial state |
| `CONNECTED` | Chain changes to unsupported | `WRONG_CHAIN` | Show chain warning |
| `WRONG_CHAIN` | User switches chain | `CONNECTED` | Hide warning |
| `WRONG_CHAIN` | Click "Switch" | (waiting) | Request chain switch |
| `CONNECTED` | Click "Disconnect" | `DISCONNECTED` | Clear state |
| `ADDRESS_INPUT` | Enter valid address | `READ_ONLY` | Show view-only badge |
| `ADDRESS_INPUT` | Enter invalid address | `ADDRESS_INPUT` | Show inline error |
| `ADDRESS_INPUT` | Click "Cancel" | `DISCONNECTED` | Close input, reset |
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
