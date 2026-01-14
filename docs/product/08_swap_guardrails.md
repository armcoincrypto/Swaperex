# Review Swap Guardrails (Safety Gate)

**Purpose**: The "Approve & Swap" button must be a safety gate, not a speedbump. Every failure has a specific, actionable error message.

---

## Mandatory Checks Before Enabling "Approve & Swap"

| # | Check | Condition | Error Message if Failed |
|---|-------|-----------|-------------------------|
| 1 | **Quote Exists** | `quote !== null` | "No quote available. Please enter an amount and wait for quote." |
| 2 | **Quote Fresh** | `quoteAge < 30 seconds` | "Quote expired (over 30 seconds old). Click 'Refresh Quote' to get current price." |
| 3 | **Balance Sufficient** | `userBalance >= fromAmount` | "Insufficient [TOKEN] balance. You have [X], trying to swap [Y]." |
| 4 | **Gas Available** | `nativeBalance >= estimatedGas` | "Insufficient [ETH/BNB] for gas. You need ~[X] for transaction fees." |
| 5 | **Network Matches** | `walletChainId === quoteChainId` | "Network mismatch. Quote is for [Ethereum], but wallet is on [BSC]. Switch network or refresh quote." |
| 6 | **Wallet Connected** | `address !== null` | "Wallet disconnected. Please reconnect to continue." |
| 7 | **Amount Valid** | `fromAmount > 0` | "Invalid amount. Please enter a number greater than zero." |
| 8 | **Tokens Different** | `fromToken !== toToken` | "Cannot swap [TOKEN] to itself. Select a different output token." |
| 9 | **Slippage Valid** | `0 < slippage <= 50` | "Invalid slippage: [X]%. Must be between 0.01% and 50%." |
| 10 | **Output Non-Dust** | `toAmount > minThreshold` | "Output too small. Minimum swap output is $0.01 equivalent." |

---

## Check Execution Order

```
1. Wallet Connected?     → "Wallet disconnected..."
2. Network Matches?      → "Network mismatch..."
3. Quote Exists?         → "No quote available..."
4. Quote Fresh?          → "Quote expired..."
5. Tokens Different?     → "Cannot swap to itself..."
6. Amount Valid?         → "Invalid amount..."
7. Balance Sufficient?   → "Insufficient balance..."
8. Gas Available?        → "Insufficient gas..."
9. Slippage Valid?       → "Invalid slippage..."
10. Output Non-Dust?     → "Output too small..."
```

**Rule**: Stop at first failure. Show ONE clear error, not a list.

---

## Error Message Requirements

| Requirement | Example |
|-------------|---------|
| **Specific** | "Insufficient USDT balance" not "Insufficient balance" |
| **Quantified** | "You have 10 USDT, trying to swap 15 USDT" |
| **Actionable** | "Click 'Refresh Quote' to get current price" |
| **No codes** | Never show "Error 0x..." or "CALL_EXCEPTION" |
| **No jargon** | "Transaction fees" not "gas stipend" |

---

## Forbidden Error Messages

| ❌ Forbidden | ✅ Required |
|--------------|-------------|
| "Network error" | "Failed to connect to Ethereum. Check your internet connection." |
| "Transaction failed" | "Swap failed: price moved beyond your 0.5% slippage tolerance." |
| "Error" | "Quote request failed. The 1inch API is temporarily unavailable." |
| "Something went wrong" | "Wallet rejected the transaction. No funds were moved." |
| "Invalid params" | "Invalid swap amount. Please enter a positive number." |
| "0x..." | Human-readable translation of the error |

---

## Visual Guardrail States

| State | Button Text | Button Enabled | Visual Indicator |
|-------|-------------|----------------|------------------|
| All checks pass | "Approve & Swap" | ✅ Yes | Green button |
| Quote expired | "Refresh Quote" | ✅ Yes | Yellow warning banner |
| Balance insufficient | "Insufficient Balance" | ❌ No | Red input border |
| No gas | "Need [ETH/BNB] for Gas" | ❌ No | Red warning banner |
| Network mismatch | "Switch to [Network]" | ✅ Yes (triggers switch) | Orange warning |
| Wallet disconnected | "Connect Wallet" | ✅ Yes (triggers connect) | — |
| Fetching quote | "Getting Quote..." | ❌ No | Spinner |
