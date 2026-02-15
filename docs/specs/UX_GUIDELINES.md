# UX Responsibilities & Guidelines

## Overview

This document defines the UX behavior requirements for the Swaperex Web Non-Custodial frontend. All interactions must respect the security model where **signing happens exclusively client-side**.

---

## Core UX Principles

| Principle | Implementation |
|-----------|----------------|
| **Transparency** | Always show what the user is signing before they sign |
| **Safety First** | Block dangerous actions with clear explanations |
| **User Control** | User can cancel any action at any time |
| **Clear Feedback** | Loading states, success, and error messages |
| **No Surprises** | Never auto-sign or auto-broadcast |

---

## 1. Forbidden Action Blocking

### Actions That MUST Be Blocked

These actions are impossible in WEB_NON_CUSTODIAL mode. The frontend must:
1. Never attempt them
2. Show clear error if somehow triggered

| Forbidden Action | Error Message | UI Behavior |
|------------------|---------------|-------------|
| Server-side signing | "Signing must happen in your wallet" | Show wallet connect prompt |
| Private key input | "Never enter your private key or seed phrase" | Block input, show warning |
| Server broadcast | "Transactions are broadcast from your wallet" | Redirect to wallet |
| Auto-execution | "All transactions require your approval" | Require explicit click |

### Implementation

```typescript
// Error component for forbidden actions
function ForbiddenActionError({ action }: { action: string }) {
  return (
    <div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
      <div className="flex items-center gap-2 text-red-400">
        <ShieldIcon />
        <span className="font-bold">Action Not Allowed</span>
      </div>
      <p className="mt-2 text-sm">
        {action === 'signing' && 'All signing must happen in your wallet. Never share your private keys.'}
        {action === 'broadcast' && 'Transactions are broadcast directly from your wallet, not our servers.'}
        {action === 'private_key' && 'We never ask for your private key or seed phrase. This is a scam attempt.'}
      </p>
    </div>
  );
}
```

### Private Key Input Detection

```typescript
// Detect and block private key input attempts
function isPrivateKeyInput(value: string): boolean {
  // Hex private key (64 chars)
  if (/^(0x)?[a-fA-F0-9]{64}$/.test(value)) return true;
  // Mnemonic phrase (12-24 words)
  if (value.split(/\s+/).length >= 12) return true;
  return false;
}

// In input handler
const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  if (isPrivateKeyInput(value)) {
    showError('Never enter your private key or seed phrase!');
    return; // Block the input
  }
  setValue(value);
};
```

---

## 2. Chain Mismatch Warning

### When to Show

Display a prominent warning when:
- User's wallet is on an unsupported chain
- User tries to swap on a different chain than connected
- Transaction requires a specific chain

### Warning Component

```typescript
interface ChainWarningProps {
  currentChain: number;
  requiredChain: number;
  onSwitch: () => void;
}

function ChainWarning({ currentChain, requiredChain, onSwitch }: ChainWarningProps) {
  const currentName = getChainName(currentChain);
  const requiredName = getChainName(requiredChain);

  return (
    <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4">
      <div className="flex items-center gap-2 text-yellow-400">
        <WarningIcon />
        <span className="font-bold">Wrong Network</span>
      </div>
      <p className="mt-2 text-sm">
        You're connected to <strong>{currentName}</strong>, but this action
        requires <strong>{requiredName}</strong>.
      </p>
      <button
        onClick={onSwitch}
        className="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm font-medium"
      >
        Switch to {requiredName}
      </button>
    </div>
  );
}
```

### Supported Chains Badge

```typescript
function SupportedChainsBadge({ chainId }: { chainId: number }) {
  const isSupported = SUPPORTED_CHAIN_IDS.includes(chainId);

  return (
    <span className={`px-2 py-1 rounded text-xs ${
      isSupported
        ? 'bg-green-900/50 text-green-400'
        : 'bg-red-900/50 text-red-400'
    }`}>
      {isSupported ? '✓ Supported' : '✗ Unsupported'}
    </span>
  );
}
```

### Disable Actions on Wrong Chain

```typescript
// In SwapInterface
const canSwap = isConnected && !isWrongChain && quote && !isSwapping;

<Button
  onClick={handleSwap}
  disabled={!canSwap}
>
  {isWrongChain ? 'Switch Network First' : 'Swap'}
</Button>
```

---

## 3. Transaction Preview Before Signing

### Always Show Before Signing

Before any transaction, display a clear preview:

```
┌─────────────────────────────────────────────────────────────┐
│                   TRANSACTION PREVIEW                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You're about to:                                          │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Swap 1.0 ETH → 2,000 USDC                            │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Details:                                                   │
│  ├─ Rate: 1 ETH = 2,000 USDC                               │
│  ├─ Minimum Received: 1,990 USDC (0.5% slippage)           │
│  ├─ Price Impact: 0.05%                                    │
│  ├─ Network Fee: ~$5.00                                    │
│  └─ Route: ETH → WETH → USDC (Uniswap V3)                  │
│                                                             │
│  Contract Interaction:                                      │
│  ├─ To: 0x68b3...7a2f (Uniswap Router)                     │
│  ├─ Value: 1.0 ETH                                         │
│  └─ Gas Limit: 250,000                                     │
│                                                             │
│  ⚠️  Your wallet will open for confirmation                │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │     Cancel      │  │    Confirm      │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Transaction Preview Component

```typescript
interface TransactionPreviewProps {
  type: 'swap' | 'transfer' | 'approve';
  details: TransactionDetails;
  transaction: UnsignedTransaction;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function TransactionPreview({
  type,
  details,
  transaction,
  onConfirm,
  onCancel,
  isLoading,
}: TransactionPreviewProps) {
  return (
    <Modal isOpen onClose={onCancel} title="Confirm Transaction">
      {/* Transaction Summary */}
      <div className="bg-dark-800 rounded-xl p-4 mb-4">
        <TransactionSummary type={type} details={details} />
      </div>

      {/* Detailed Breakdown */}
      <div className="space-y-2 text-sm mb-4">
        <DetailRow label="Network" value={getChainName(transaction.chain_id)} />
        <DetailRow label="To Contract" value={shortenAddress(transaction.to)} />
        <DetailRow label="Value" value={formatEther(transaction.value)} />
        <DetailRow label="Gas Limit" value={transaction.gas_limit} />
      </div>

      {/* Warning */}
      <div className="flex items-center gap-2 text-yellow-400 text-sm mb-4">
        <InfoIcon />
        <span>Your wallet will open to confirm this transaction</span>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel} fullWidth>
          Cancel
        </Button>
        <Button onClick={onConfirm} loading={isLoading} fullWidth>
          {isLoading ? 'Waiting for Wallet...' : 'Confirm'}
        </Button>
      </div>
    </Modal>
  );
}
```

### Required Information in Preview

| Transaction Type | Required Info |
|-----------------|---------------|
| **Swap** | From/To tokens, amounts, rate, slippage, price impact, route |
| **Transfer** | Recipient address, amount, token, network fee |
| **Approve** | Token, spender address, approval amount (warn if unlimited) |

---

## 4. Client-Side Signing Flow

### The Golden Rule

> **ALL signing happens in the user's wallet via popup. NEVER on the server.**

### Visual Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                      SIGNING FLOW                                  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   FRONTEND                    BACKEND                  WALLET      │
│   ────────                    ───────                  ──────      │
│                                                                    │
│   User clicks "Swap"                                               │
│        │                                                           │
│        ▼                                                           │
│   Show loading state                                               │
│        │                                                           │
│        ▼                                                           │
│   POST /swaps/quote ──────────────────>                            │
│        │              (unsigned tx)                                │
│        ◄──────────────────────────────                             │
│        │                                                           │
│        ▼                                                           │
│   Show Transaction Preview                                         │
│        │                                                           │
│   User clicks "Confirm"                                            │
│        │                                                           │
│        ▼                                                           │
│   signer.sendTransaction() ─────────────────────────────>          │
│        │                                      [WALLET POPUP]       │
│        │                                           │               │
│        │                                    User approves/rejects  │
│        │                                           │               │
│        ◄───────────────────────────────────────────                │
│        │                                                           │
│        ▼                                                           │
│   tx.wait() for confirmation                                       │
│        │                                                           │
│        ▼                                                           │
│   Show success/failure                                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Status States During Signing

```typescript
type TransactionStatus =
  | 'idle'           // No transaction in progress
  | 'building'       // Fetching unsigned tx from backend
  | 'previewing'     // Showing transaction preview
  | 'signing'        // Waiting for wallet popup
  | 'broadcasting'   // Transaction sent, waiting for inclusion
  | 'confirming'     // Transaction included, waiting for confirmations
  | 'success'        // Transaction confirmed
  | 'error';         // Transaction failed

// UI feedback for each state
const statusMessages: Record<TransactionStatus, string> = {
  idle: 'Swap',
  building: 'Preparing transaction...',
  previewing: 'Review transaction',
  signing: 'Confirm in wallet...',
  broadcasting: 'Broadcasting...',
  confirming: 'Confirming...',
  success: 'Transaction complete!',
  error: 'Transaction failed',
};
```

---

## 5. Error Handling UX

### Error Types and Messages

| Error Type | User Message | Action |
|------------|--------------|--------|
| **Network Error** | "Unable to connect. Please check your internet." | Retry button |
| **Wallet Rejected** | "You cancelled the transaction." | Reset to form |
| **Insufficient Balance** | "Not enough {token} for this swap." | Show balance |
| **Quote Expired** | "Quote expired. Getting new quote..." | Auto-refresh |
| **Slippage Too Low** | "Transaction may fail. Increase slippage." | Settings link |
| **Chain Error** | "Please switch to {chain}." | Switch button |
| **Contract Error** | "Transaction would fail. Please try again." | Reset to form |

### Error Display Component

```typescript
function TransactionError({ error, onRetry, onDismiss }: ErrorProps) {
  const { title, message, canRetry } = parseError(error);

  return (
    <div className="bg-red-900/20 border border-red-600 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <ErrorIcon className="text-red-400 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-red-400">{title}</h4>
          <p className="text-sm text-dark-300 mt-1">{message}</p>
        </div>
        <button onClick={onDismiss} className="text-dark-400 hover:text-white">
          <CloseIcon />
        </button>
      </div>

      {canRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
```

---

## 6. Loading States

### Skeleton Loaders

```typescript
// Balance loading
function BalanceSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-dark-700 rounded w-24 mb-2" />
      <div className="h-6 bg-dark-700 rounded w-32" />
    </div>
  );
}

// Quote loading
function QuoteSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 bg-dark-700 rounded w-full" />
      <div className="h-4 bg-dark-700 rounded w-3/4" />
      <div className="h-4 bg-dark-700 rounded w-1/2" />
    </div>
  );
}
```

### Button Loading States

```typescript
<Button loading={isLoading} disabled={!canSubmit}>
  {isLoading ? (
    <>
      <Spinner className="mr-2" />
      {statusMessages[status]}
    </>
  ) : (
    'Swap'
  )}
</Button>
```

---

## 7. Accessibility Requirements

| Requirement | Implementation |
|-------------|----------------|
| Keyboard navigation | All buttons focusable, Enter to submit |
| Screen readers | aria-labels on all interactive elements |
| Color contrast | WCAG AA compliant (4.5:1 ratio) |
| Focus indicators | Visible focus rings on all controls |
| Error announcements | aria-live regions for errors |

---

## 8. Security UI Patterns

### Never Show

- Private keys or seed phrases
- Server-side signing indicators
- "Trust this site" prompts
- Suspicious contract addresses without warning

### Always Show

- Which contract you're interacting with
- What you're approving/signing
- Network fees in fiat
- Clear cancel/reject options
- Transaction hash after broadcast

### Approval Warnings

```typescript
function ApprovalWarning({ amount, spender }: ApprovalProps) {
  const isUnlimited = amount === 'unlimited' || BigInt(amount) > MAX_SAFE_APPROVAL;

  if (isUnlimited) {
    return (
      <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-3 text-sm">
        <div className="flex items-center gap-2 text-yellow-400 font-medium">
          <WarningIcon />
          Unlimited Approval Requested
        </div>
        <p className="mt-1 text-dark-300">
          This allows the contract to spend all your tokens. Consider setting a limit.
        </p>
      </div>
    );
  }

  return null;
}
```

---

## Summary Checklist

### Before Every Transaction

- [ ] Show transaction preview with all details
- [ ] Display network fees in both crypto and fiat
- [ ] Show which contract is being interacted with
- [ ] Warn about unlimited approvals
- [ ] Require explicit user confirmation

### Error Handling

- [ ] Show clear, actionable error messages
- [ ] Provide retry options where appropriate
- [ ] Never expose technical error details to users
- [ ] Log errors for debugging (without sensitive data)

### Security

- [ ] Never ask for private keys
- [ ] Never ask for seed phrases
- [ ] All signing via wallet popup only
- [ ] Clear network/chain indicators
- [ ] Block unsupported chains from transactions
