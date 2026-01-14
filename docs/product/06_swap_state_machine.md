# Swap State Machine

**Purpose**: Formalize the swap flow to prevent regressions.

---

## States

| State | Description |
|-------|-------------|
| `idle` | No active swap. Form ready for input. |
| `inputting` | User is typing/selecting (implicit — not tracked in code) |
| `fetching_quote` | Requesting quote from aggregator (1inch/Uniswap/PancakeSwap) |
| `checking_allowance` | Verifying if token approval exists |
| `previewing` | Quote ready, waiting for user confirmation |
| `approving` | Wallet prompt for token approval transaction |
| `swapping` | Wallet prompt for swap transaction |
| `confirming` | Transaction sent, waiting for block confirmation |
| `success` | Swap complete. Show receipt. |
| `error` | Something failed. Show message. |

---

## State Transition Rules

### `idle`

| Allowed Actions | Result |
|-----------------|--------|
| Enter amount + both tokens selected | → `fetching_quote` |
| Change token | Stay `idle`, clear any stale data |
| Connect wallet | Stay `idle` |

| Forbidden Transitions |
|-----------------------|
| Cannot go to `approving`, `swapping`, `confirming` directly |
| Cannot show quote data |

| Required UI Resets |
|--------------------|
| `toAmount` = empty |
| `quote` = null |
| `error` = null |
| `txHash` = null |

---

### `fetching_quote`

| Allowed Actions | Result |
|-----------------|--------|
| Wait for response | → `checking_allowance` |
| Clear input | → `idle` (abort request) |
| Change token | → `idle` (abort request) |
| Quote fails | → `error` |

| Forbidden Transitions |
|-----------------------|
| Cannot go to `swapping` without quote |
| Cannot show "Confirm Swap" button |

| Required UI Resets |
|--------------------|
| Show spinner (after 250ms delay) |
| Disable swap button |

---

### `checking_allowance`

| Allowed Actions | Result |
|-----------------|--------|
| Allowance sufficient | → `previewing` |
| Allowance insufficient | → `previewing` (with `needsApproval: true`) |
| Error | → `error` |

| Forbidden Transitions |
|-----------------------|
| Cannot go to `swapping` without passing through `previewing` |

| Required UI Resets |
|--------------------|
| None (transient state) |

---

### `previewing`

| Allowed Actions | Result |
|-----------------|--------|
| User clicks "Confirm Swap" | → `approving` (if needs approval) or → `swapping` |
| User clicks "Cancel" | → `idle` |
| User changes input | → `idle` (invalidate quote) |
| Quote expires (30s) | → `idle` (force refresh) |
| Refresh quote | → `fetching_quote` |

| Forbidden Transitions |
|-----------------------|
| Cannot show stale quote (>30s old) |
| Cannot proceed without user action |

| Required UI Resets |
|--------------------|
| Show quote details (rate, minimum received, slippage) |
| Enable "Confirm Swap" button |

---

### `approving`

| Allowed Actions | Result |
|-----------------|--------|
| User confirms in wallet | → `swapping` |
| User rejects | → `previewing` |
| Transaction fails | → `error` |
| Wallet disconnects | → `idle` |
| Chain changes | → `idle` |

| Forbidden Transitions |
|-----------------------|
| Cannot skip to `success` |
| Cannot modify inputs |

| Required UI Resets |
|--------------------|
| Show "Approving..." status |
| Disable all inputs |
| Block modal close |

---

### `swapping`

| Allowed Actions | Result |
|-----------------|--------|
| User confirms in wallet | → `confirming` |
| User rejects | → `previewing` |
| Transaction fails | → `error` |
| Wallet disconnects | → `idle` |
| Chain changes | → `idle` |

| Forbidden Transitions |
|-----------------------|
| Cannot modify inputs |
| Cannot cancel after tx sent |

| Required UI Resets |
|--------------------|
| Show "Confirm in wallet..." |
| Disable all inputs |
| Block modal close |

---

### `confirming`

| Allowed Actions | Result |
|-----------------|--------|
| Block confirms (status=1) | → `success` |
| Block confirms (status=0) | → `error` |
| RPC timeout | → `error` (with "Check explorer" link) |

| Forbidden Transitions |
|-----------------------|
| Cannot go back to `previewing` |
| Cannot retry without reset |

| Required UI Resets |
|--------------------|
| Show "Waiting for confirmation..." |
| Show txHash + explorer link |
| Keep inputs disabled |

---

### `success`

| Allowed Actions | Result |
|-----------------|--------|
| User clicks "Done" or "New Swap" | → `idle` |
| Auto-reset after 30s | → `idle` |

| Forbidden Transitions |
|-----------------------|
| Cannot retry same swap |
| Cannot modify without reset |

| Required UI Resets |
|--------------------|
| Clear all form inputs |
| Clear quote |
| Refresh balances |
| Show success message + explorer link |

---

### `error`

| Allowed Actions | Result |
|-----------------|--------|
| User clicks "Try Again" | → `idle` |
| User clicks "Dismiss" | → `idle` |

| Forbidden Transitions |
|-----------------------|
| Cannot auto-retry |
| Cannot proceed to `swapping` |

| Required UI Resets |
|--------------------|
| Show error message (human-readable) |
| Clear quote |
| Keep input values (user may want to retry) |
| Enable "Try Again" button |

---

## Valid Transition Diagram

```
idle → fetching_quote → checking_allowance → previewing
  ↑           ↓                                  ↓
  ← ← ← ← ← error ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ↓
  ↑                                              ↓
  ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ↓
  ↑                                    approving (if needed)
  ↑                                              ↓
  ↑                                         swapping
  ↑                                              ↓
  ↑                                        confirming
  ↑                                              ↓
  ← ← ← ← ← ← ← ← ← success ← ← ← ← ← ← ← ← ← ← ↓
```
