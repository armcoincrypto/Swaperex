# Error & Rejection Handling UX

**Core Principle:** Every error must be user-friendly, actionable, and never block the UI permanently.

## Error Categories

### 1. Wallet Errors

| Error Type | Trigger | User Message | Action |
|------------|---------|--------------|--------|
| `no_wallet` | No MetaMask/wallet installed | "No wallet detected. Please install MetaMask." | Link to MetaMask download |
| `rejected` | User clicks "Cancel" in wallet popup | "Connection cancelled" | Show retry button |
| `timeout` | Wallet popup takes too long | "Connection timed out. Please try again." | Show retry button |
| `network` | Network/RPC error | "Network error. Please check your connection." | Show retry button |
| `wrong_chain` | Connected to unsupported chain | "Please switch to a supported network" | Show switch button |
| `read_only` | Attempting to sign in view-only mode | "View-only mode. Connect wallet to sign." | Show connect button |

### 2. Swap Errors

| Error Type | Trigger | User Message | Action |
|------------|---------|--------------|--------|
| `insufficient_balance` | Amount > balance | "Insufficient [TOKEN] balance" | Disable button, show balance |
| `quote_failed` | Backend quote error | "Failed to get quote. Please try again." | Show retry button |
| `quote_expired` | Quote older than 30s | "Quote expired. Refresh to continue." | Show refresh button |
| `high_slippage` | Price impact > 3% | "High price impact: X%" | Warning banner (allow proceed) |
| `very_high_slippage` | Price impact > 10% | "Very high price impact! You may lose funds." | Red warning banner |
| `approval_rejected` | User rejects approval tx | "Approval cancelled. No changes made." | Re-enable buttons |
| `swap_rejected` | User rejects swap tx | "Transaction cancelled. No changes made." | Re-enable buttons |
| `swap_failed` | Transaction reverts | "Swap failed: [reason]" | Show error, enable retry |
| `gas_error` | Insufficient gas | "Insufficient ETH for gas fees" | Show required amount |

### 3. Withdrawal Errors

| Error Type | Trigger | User Message | Action |
|------------|---------|--------------|--------|
| `invalid_address` | Address format wrong | "Invalid address format (must be 0x...)" | Disable button |
| `same_address` | Sending to self | "Cannot send to your own address" | Disable button |
| `insufficient_balance` | Amount > balance | "Insufficient [TOKEN] balance" | Disable button |
| `template_failed` | Backend template error | "Failed to prepare withdrawal. Try again." | Show retry |
| `fee_error` | Fee estimation failed | "Could not estimate fees. Try again." | Show retry |
| `approval_rejected` | User rejects approval | "Approval cancelled. No changes made." | Re-enable buttons |
| `withdrawal_rejected` | User rejects send | "Transaction cancelled. No changes made." | Re-enable buttons |
| `withdrawal_failed` | Transaction reverts | "Withdrawal failed: [reason]" | Show error, enable retry |

## State Diagram

```
    ┌─────────────────────────────────────────────────────────┐
    │                    ERROR FLOW                           │
    └─────────────────────────────────────────────────────────┘

                         ┌─────────┐
                         │  IDLE   │
                         └────┬────┘
                              │
                              │ user action
                              ▼
                    ┌─────────────────┐
                    │    LOADING      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
         ┌────────┐    ┌────────┐    ┌───────────┐
         │SUCCESS │    │ ERROR  │    │ REJECTED  │
         └────────┘    └───┬────┘    └─────┬─────┘
                           │               │
                           │               │ (no changes made)
                           ▼               ▼
                    ┌─────────────────────────┐
                    │   SHOW ERROR MESSAGE    │
                    │   + RETRY BUTTON        │
                    └────────────┬────────────┘
                                 │
                                 │ user clicks retry
                                 ▼
                           ┌───────────┐
                           │  LOADING  │
                           └───────────┘
```

## State Transitions Table

| Current | Event | Next | Toast | UI Change |
|---------|-------|------|-------|-----------|
| idle | click action | loading | - | Disable buttons, show spinner |
| loading | success | success | ✓ Success | Show result, enable buttons |
| loading | user_rejected | idle | ⚠ Cancelled | "No changes made", enable buttons |
| loading | error | error | ✗ Error msg | Show error banner, enable retry |
| error | click retry | loading | - | Clear error, start over |
| error | click cancel | idle | - | Clear error, reset form |

## User-Facing Messages

### Success Messages
- "Wallet connected!"
- "Swap completed!"
- "Withdrawal sent!"
- "Token approved!"
- "Network switched!"

### Warning Messages (Yellow)
- "High price impact: X%"
- "Quote expires in Xs"
- "Transaction cancelled"
- "Approval cancelled"

### Error Messages (Red)
- "No wallet detected. Please install MetaMask."
- "Connection failed. Please try again."
- "Insufficient [TOKEN] balance"
- "Invalid address format"
- "Failed to get quote"
- "Swap failed: [reason]"
- "Withdrawal failed: [reason]"
- "Network error. Check your connection."

### Info Messages (Blue)
- "Confirm in your wallet..."
- "Approving token..."
- "Broadcasting transaction..."
- "This swap requires approval first"

## Implementation Rules

### 1. Error Display
- Toasts auto-dismiss after 5s (success/info) or 8s (warning/error)
- Inline errors persist until user takes action
- Critical errors (very high slippage) require explicit dismiss

### 2. Button States During Errors
- Disable confirm buttons when validation fails
- Show specific reason as button text: "Insufficient Balance"
- Enable retry after recoverable errors
- Never leave user stuck

### 3. Clear Previous Errors
- Clear errors when user starts typing
- Clear errors when user changes inputs
- Clear errors on successful action

### 4. Loading States
- Always show loading spinner during async operations
- Disable all action buttons during loading
- Show descriptive loading text: "Getting quote..."

### 5. Rejection Handling
- User rejections are NOT errors (show warning, not error)
- Always message: "No changes were made"
- Immediately re-enable buttons
- Don't require page refresh

## Component Responsibilities

### Toast System
- Global notifications for all flows
- Auto-dismiss with close button
- Stack multiple toasts
- Different colors for types

### Inline Errors
- Form validation errors (address, amount)
- Balance checks
- Persist until fixed

### Modal Errors
- Transaction failures
- Network errors
- Require explicit dismiss

## Error Utility Functions

```typescript
// Categorize wallet errors
function categorizeWalletError(err): { type, message }

// Parse transaction errors
function parseTransactionError(err): string

// Check if user rejection
function isUserRejection(err): boolean

// Format balance error
function formatBalanceError(asset, required, available): string
```

## Testing Checklist

- [ ] Wallet: Cancel connection popup
- [ ] Wallet: Wrong network warning
- [ ] Wallet: No wallet installed
- [ ] Swap: Enter amount > balance
- [ ] Swap: Let quote expire
- [ ] Swap: Reject approval in wallet
- [ ] Swap: Reject swap in wallet
- [ ] Withdrawal: Invalid address
- [ ] Withdrawal: Same address (self-send)
- [ ] Withdrawal: Insufficient balance
- [ ] Withdrawal: Reject in wallet
- [ ] All: Network disconnection
- [ ] All: UI never stuck/frozen
