# Withdrawal UX Flow

**Core Principle:** "Swaperex does not withdraw. Your wallet withdraws. Swaperex only prepares the transaction template."

## UX Flow (Step-by-Step)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     WITHDRAWAL USER JOURNEY                          │
└─────────────────────────────────────────────────────────────────────┘

1. IDLE STATE
   ├─ User navigates to Withdraw page
   ├─ Sees list of tokens with balances
   └─ Selects asset to withdraw

2. FORM ENTRY
   ├─ Enter withdrawal amount
   ├─ Enter destination address
   ├─ Select chain (if multi-chain asset)
   └─ Validate inputs as user types

3. INPUT VALIDATION
   ├─ Check: Is amount > 0?
   ├─ Check: Is amount <= balance?
   ├─ Check: Is destination address valid (0x...)?
   ├─ Check: Is destination not same as source?
   └─ Show errors inline if invalid

4. USER CLICKS "PREVIEW WITHDRAWAL"
   ├─ Fetch withdrawal template from backend
   ├─ Show loading state
   └─ Open WithdrawalPreviewModal

5. TEMPLATE FETCHING
   ├─ Call /withdrawals/template endpoint
   ├─ Returns: unsigned transaction + fee estimate
   └─ Handle errors (insufficient balance, invalid address)

6. PREVIEW MODAL DISPLAYED
   ├─ Asset + amount being sent
   ├─ Destination address
   ├─ Network/chain
   ├─ Network fee estimate (native + USD)
   ├─ Net amount after fees
   ├─ Any warnings from backend
   └─ "Sign in wallet" notice

7. TOKEN APPROVAL (if ERC-20)
   ├─ Some tokens may need approval
   ├─ Show "Step 1/2: Approve [TOKEN]"
   ├─ User signs approval in wallet
   └─ On success → proceed to withdrawal

8. USER CONFIRMS WITHDRAWAL
   ├─ "Confirm in your wallet..." message
   ├─ Wallet popup opens
   └─ Buttons disabled, spinner shown

9. TRANSACTION BROADCASTING
   ├─ "Broadcasting transaction..."
   └─ Show tx hash when available

10. SUCCESS STATE
    ├─ "Withdrawal sent!"
    ├─ Show tx hash with explorer link
    ├─ "View on Explorer" button
    └─ Auto-refresh balances

11. ERROR STATES
    ├─ User rejected → "Transaction cancelled"
    ├─ Insufficient balance → "Insufficient [TOKEN] balance"
    ├─ Insufficient gas → "Insufficient [NATIVE] for gas"
    ├─ Invalid address → "Invalid destination address"
    └─ Network error → "Network error. Please try again"
```

## State Diagram

```
         ┌────────┐
         │  IDLE  │
         └───┬────┘
             │ user enters amount + address
             ▼
    ┌────────────────┐
    │   VALIDATING   │
    └───────┬────────┘
            │ inputs valid
            ▼
    ┌────────────────┐     user clicks "Preview"
    │     READY      │─────────────────────────┐
    └───────┬────────┘                         │
            │                                  ▼
            │                         ┌────────────────┐
            │                         │ FETCHING_TMPL  │
            │                         └───────┬────────┘
            │                                 │ template received
            │                                 ▼
            │                         ┌────────────────┐
            │                         │   PREVIEWING   │
            │                         └───────┬────────┘
            │                                 │
            │                                 │ user confirms
            │                                 ▼
            │                         ┌────────────────┐
            │                         │   APPROVING    │ (if needed)
            │                         └───────┬────────┘
            │                                 │ approval success
            │                                 ▼
            │                         ┌────────────────┐
            │                         │    SIGNING     │
            │                         └───────┬────────┘
            │                                 │ signed
            │                                 ▼
            │                         ┌────────────────┐
            │                         │  BROADCASTING  │
            │                         └───────┬────────┘
            │                                 │ confirmed
            │                                 ▼
            │                         ┌────────────────┐
            │                         │    SUCCESS     │
            │                         └───────┬────────┘
            │                                 │ new withdrawal
            └─────────────────────────────────┘

    ERROR can occur from any state → returns to PREVIEWING or IDLE
```

## State Transitions Table

| Current State   | Event                    | Next State       | UI Change                                    |
|-----------------|--------------------------|------------------|----------------------------------------------|
| IDLE            | Enter amount/address     | VALIDATING       | Validate inputs inline                        |
| VALIDATING      | Inputs valid             | READY            | Enable "Preview Withdrawal" button            |
| VALIDATING      | Inputs invalid           | VALIDATING       | Show inline errors                            |
| READY           | Click "Preview"          | FETCHING_TMPL    | Show loading, disable button                  |
| FETCHING_TMPL   | Template received        | PREVIEWING       | Open modal with details                       |
| FETCHING_TMPL   | Template failed          | READY            | Show error toast, keep form                   |
| PREVIEWING      | Click "Confirm"          | APPROVING/SIGNING| Show wallet prompt message                    |
| PREVIEWING      | Click "Cancel"           | READY            | Close modal                                   |
| APPROVING       | Approval success         | SIGNING          | Show "Step 2/2: Send"                         |
| APPROVING       | User rejected            | PREVIEWING       | Show "Cancelled", re-enable buttons           |
| SIGNING         | Signed                   | BROADCASTING     | Show "Broadcasting..."                        |
| SIGNING         | User rejected            | PREVIEWING       | Show "Cancelled", re-enable buttons           |
| BROADCASTING    | Tx confirmed             | SUCCESS          | Show success, explorer link                   |
| BROADCASTING    | Tx failed                | ERROR            | Show error message                            |
| SUCCESS         | Click "Done"             | IDLE             | Reset form                                    |
| ERROR           | Click "Try Again"        | PREVIEWING       | Re-enable confirm button                      |

## Components to Create

### New Components

1. **`WithdrawalPreviewModal.tsx`** - Preview modal
   - Transaction summary
   - Destination address display
   - Network fee estimate
   - Multi-step progress (approval + send)
   - Security notices

2. **`WithdrawalInterface.tsx`** - Main withdrawal form
   - Asset selector
   - Amount input with MAX button
   - Destination address input
   - Chain selector (for multi-chain assets)
   - Preview button

### New Hooks

1. **`useWithdrawal.ts`** - Withdrawal logic
   - Template fetching
   - Approval handling
   - Transaction execution
   - State management

### Files to Modify

1. **`App.tsx`** - Add "Withdraw" to navigation

## User-Facing Messages

### Loading States
- "Fetching withdrawal details..." (getting template)
- "Waiting for approval..." (ERC-20 approve)
- "Confirm in your wallet..." (waiting for signature)
- "Broadcasting transaction..." (after signing)
- "Confirming..." (waiting for block confirmation)

### Success States
- "Withdrawal sent!"
- "View on [Chain] Explorer"

### Warning States
- "High network fees on this chain"
- "This is a token transfer, not native"
- "Double-check the destination address"

### Error States
- "Transaction cancelled" (user rejected)
- "Insufficient [ASSET] balance"
- "Insufficient [NATIVE] for gas fees"
- "Invalid destination address"
- "Address must start with 0x"
- "Cannot send to your own address"
- "Network error. Please try again."
- "This network is not supported"

### Security Notices
- "Your wallet will open to confirm this transaction"
- "Transaction signed locally - never on our servers"
- "Verify the destination address carefully"

## Visual Specifications

### Address Display
- Show full address in modal with copy button
- Highlight first 6 and last 4 characters
- Show chain icon next to address

### Fee Display
- Show fee in native token + USD equivalent
- Show total cost (amount + fee)
- Highlight if fee > 5% of amount

### Network Selector
- Show chain icon + name
- Show estimated fee per chain
- Highlight current wallet chain

### Button States
- Normal: Primary color, enabled
- Loading: Spinner + disabled
- Disabled: Grayed out (invalid inputs, wrong chain)
- Success: Green with checkmark

## Implementation Checklist

- [ ] Create useWithdrawal hook
- [ ] Create WithdrawalPreviewModal
- [ ] Create WithdrawalInterface
- [ ] Add address validation
- [ ] Add amount validation
- [ ] Add chain selector
- [ ] Add to App navigation
- [ ] Test insufficient balance
- [ ] Test invalid address
- [ ] Test user rejection
- [ ] Verify explorer links
