# Swap Preview & Confirmation UX

**Core Principle:** "Swaperex does not swap. Your wallet swaps. Swaperex only prepares the transaction."

## UX Flow (Step-by-Step)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER JOURNEY                                 │
└─────────────────────────────────────────────────────────────────────┘

1. IDLE STATE
   ├─ User enters swap form
   ├─ Selects from/to tokens
   └─ Enters amount

2. QUOTE FETCHING
   ├─ [Automatic] Debounced quote fetch on amount change
   ├─ Show "Getting quote..." indicator
   └─ Display rate preview below input

3. QUOTE READY
   ├─ Show estimated output amount
   ├─ Display quick summary (rate, price impact)
   ├─ Enable "Preview Swap" button
   └─ If high slippage (>3%) → show warning color

4. USER CLICKS "PREVIEW SWAP"
   ├─ Open SwapPreviewModal
   ├─ Show full transaction details
   └─ Start quote expiry timer (30s)

5. PREVIEW MODAL DISPLAYED
   ├─ From: amount + token + chain
   ├─ To: estimated amount + token + chain
   ├─ Route/aggregator (e.g. "via 1inch")
   ├─ Slippage tolerance
   ├─ Minimum received
   ├─ Estimated gas fee (native + USD)
   ├─ Price impact (RED if >3%)
   └─ "Sign in wallet" notice

6. QUOTE EXPIRY HANDLING
   ├─ Show countdown timer "Quote expires in Xs"
   ├─ If expired → show "Quote Expired"
   ├─ Offer "Refresh Quote" button
   └─ Disable "Confirm Swap" when expired

7. USER CONFIRMS SWAP
   ├─ Check: Approval needed?
   │   ├─ YES → Show approval step first
   │   │   ├─ "Step 1/2: Approve [TOKEN]"
   │   │   ├─ User signs approval in wallet
   │   │   └─ On success → proceed to swap
   │   └─ NO → Proceed directly to swap
   └─ "Step 2/2: Confirm Swap" (or "Step 1/1" if no approval)

8. SIGNING STATE
   ├─ Modal shows "Confirm in your wallet..."
   ├─ Wallet popup opens
   └─ Buttons disabled, spinner shown

9. TRANSACTION BROADCASTING
   ├─ "Broadcasting transaction..."
   └─ Show tx hash when available

10. SUCCESS STATE
    ├─ "Swap completed!"
    ├─ Show tx hash with explorer link
    ├─ "View on Explorer" button
    └─ Auto-refresh balances

11. ERROR STATES
    ├─ User rejected → "Transaction cancelled" (dismissable)
    ├─ Insufficient balance → "Insufficient [TOKEN] balance"
    ├─ Quote expired → "Quote expired. Refresh to continue"
    └─ Network error → "Network error. Please try again"
```

## State Diagram

```
         ┌────────┐
         │  IDLE  │
         └───┬────┘
             │ user enters amount
             ▼
    ┌────────────────┐
    │ FETCHING_QUOTE │
    └───────┬────────┘
            │ quote received
            ▼
    ┌────────────────┐     quote expires
    │  QUOTE_READY   │◄────────────────┐
    └───────┬────────┘                 │
            │ user clicks "Preview"    │
            ▼                          │
    ┌────────────────┐                 │
    │   PREVIEWING   │─────────────────┤
    └───────┬────────┘  refresh quote  │
            │                          │
            │ user confirms            │
            ▼                          │
    ┌────────────────┐                 │
    │   APPROVING    │ (if needed)     │
    └───────┬────────┘                 │
            │ approval success         │
            ▼                          │
    ┌────────────────┐                 │
    │    SIGNING     │                 │
    └───────┬────────┘                 │
            │ signed                   │
            ▼                          │
    ┌────────────────┐                 │
    │  BROADCASTING  │                 │
    └───────┬────────┘                 │
            │ confirmed                │
            ▼                          │
    ┌────────────────┐                 │
    │    SUCCESS     │                 │
    └───────┬────────┘                 │
            │ user starts new swap     │
            └──────────────────────────┘

    ERROR can occur from any state → returns to PREVIEWING or IDLE
```

## State Transitions Table

| Current State   | Event                    | Next State       | UI Change                                    |
|-----------------|--------------------------|------------------|----------------------------------------------|
| IDLE            | Enter amount             | FETCHING_QUOTE   | Show loading spinner in output field         |
| FETCHING_QUOTE  | Quote received           | QUOTE_READY      | Show output amount, enable Preview button    |
| FETCHING_QUOTE  | Quote failed             | IDLE             | Show error message, clear output             |
| QUOTE_READY     | Click "Preview Swap"     | PREVIEWING       | Open modal with full details                 |
| QUOTE_READY     | Amount changed           | FETCHING_QUOTE   | Re-fetch quote                               |
| PREVIEWING      | Quote expires            | PREVIEWING       | Show "Expired", disable Confirm, show Refresh|
| PREVIEWING      | Click "Refresh"          | FETCHING_QUOTE   | Update quote in modal                        |
| PREVIEWING      | Click "Confirm"          | APPROVING/SIGNING| Show wallet prompt message                   |
| PREVIEWING      | Click "Cancel"           | QUOTE_READY      | Close modal                                  |
| APPROVING       | Approval success         | SIGNING          | Show "Approving..." → "Confirm Swap"         |
| APPROVING       | User rejected            | PREVIEWING       | Show "Cancelled", re-enable buttons          |
| SIGNING         | Signed                   | BROADCASTING     | Show "Broadcasting..."                       |
| SIGNING         | User rejected            | PREVIEWING       | Show "Cancelled", re-enable buttons          |
| BROADCASTING    | Tx confirmed             | SUCCESS          | Show success, explorer link                  |
| BROADCASTING    | Tx failed                | ERROR            | Show error message                           |
| SUCCESS         | Click "New Swap"         | IDLE             | Reset form                                   |
| ERROR           | Click "Try Again"        | PREVIEWING       | Re-enable confirm button                     |

## Components to Create/Modify

### New Components

1. **`SwapPreviewModal.tsx`** - Main preview modal
   - Full transaction breakdown
   - Quote expiry timer
   - Refresh quote button
   - Multi-step progress (approval + swap)
   - Security notices

### Components to Modify

1. **`SwapInterface.tsx`**
   - Add preview modal trigger
   - Show loading states
   - Handle insufficient balance
   - Show quote expiry warning

2. **`useSwap.ts`**
   - Add quote expiry tracking
   - Add refresh quote function
   - Track multi-step progress

3. **`swapStore.ts`**
   - Add quote timestamp
   - Add expiry state

## User-Facing Messages

### Loading States
- "Getting best rate..." (fetching quote)
- "Refreshing quote..." (refreshing expired quote)
- "Waiting for approval..." (ERC-20 approve)
- "Confirm in your wallet..." (waiting for signature)
- "Broadcasting transaction..." (after signing)
- "Confirming..." (waiting for block confirmation)

### Success States
- "Swap completed!"
- "View on [Chain] Explorer"

### Warning States
- "High price impact: X%" (>3% impact, yellow)
- "Very high price impact: X%" (>10% impact, red)
- "Quote expires in Xs" (countdown timer)
- "Quote expired" (needs refresh)
- "This swap requires token approval first"

### Error States
- "Transaction cancelled" (user rejected)
- "Insufficient [TOKEN] balance"
- "Quote expired. Please refresh."
- "Network error. Please try again."
- "Slippage tolerance exceeded"
- "This network is not supported"

### Security Notices
- "Your wallet will open to confirm this transaction"
- "Transaction signed locally - never on our servers"
- "Swaperex does not hold your funds"

## Visual Specifications

### High Slippage Warning
- Price impact 1-3%: Yellow text
- Price impact >3%: Red text + warning icon
- Price impact >10%: Red background banner

### Quote Expiry Timer
- >15s remaining: Normal gray text
- 5-15s remaining: Yellow text
- <5s remaining: Red text + pulse animation
- Expired: Red badge "Quote Expired"

### Button States
- Normal: Primary color, enabled
- Loading: Spinner + disabled
- Disabled: Grayed out (insufficient balance, wrong chain, no quote)
- Success: Green with checkmark

## Implementation Checklist

- [ ] Create SwapPreviewModal with all sections
- [ ] Add quote expiry timer (30s default)
- [ ] Add refresh quote functionality
- [ ] Add approval step UI
- [ ] Add high slippage warnings
- [ ] Add insufficient balance check
- [ ] Connect to SwapInterface
- [ ] Test all error states
- [ ] Test user rejection handling
- [ ] Verify explorer links work
