# Slippage & Quote Authority Rules

**Purpose**: Protect users and trust through clear authority rules.

---

## Who Controls Slippage

| Authority Level | Entity | Can Modify? |
|-----------------|--------|-------------|
| **Primary** | User | ✅ Yes — via settings panel |
| **Secondary** | System default | ✅ Yes — only on first load (0.5%) |
| **Forbidden** | Backend | ❌ Never |
| **Forbidden** | Quote response | ❌ Never |
| **Forbidden** | Auto-optimization | ❌ Never |

---

## Slippage Authority Rules

1. **User is sovereign** — Slippage value comes ONLY from user action or persisted preference
2. **No silent defaults** — If using default (0.5%), show it visibly in UI
3. **No auto-increase** — System must NEVER increase slippage to make a trade succeed
4. **Persist across sessions** — User's slippage choice survives page reload (localStorage)
5. **Persist across chains** — Same slippage applies to ETH and BSC unless user changes it
6. **Warnings, not blocks** — Low slippage (<0.1%) shows warning but doesn't prevent swap
7. **Hard cap enforced** — Maximum 50% slippage (prevents catastrophic user error)

---

## When a Quote Becomes Invalid

| Trigger | Quote Status | Required Action |
|---------|--------------|-----------------|
| 30 seconds elapsed | **EXPIRED** | Clear quote, require refresh |
| `fromAmount` changed | **STALE** | Clear quote, fetch new |
| `fromAsset` changed | **STALE** | Clear quote, fetch new |
| `toAsset` changed | **STALE** | Clear quote, fetch new |
| `slippage` changed | **STALE** | Clear quote, fetch new |
| Chain changed | **INVALID** | Clear quote, reset tokens, fetch new |
| Wallet disconnected | **INVALID** | Clear quote, block swap |
| Account changed | **INVALID** | Clear quote, refetch balances |

---

## Quote Validity Rules

1. **Quote TTL is 30 seconds** — After 30s, quote is dead. No exceptions.
2. **Parameter change = new quote** — Any input change invalidates existing quote
3. **No quote caching** — Never reuse a quote after ANY parameter change
4. **Stale detection via request ID** — Track request ID to reject out-of-order responses
5. **Quote includes slippage** — `minAmountOut` is calculated server-side using user's slippage
6. **Quote is immutable** — Once displayed, quote values cannot change until refresh

---

## What UI Must Do When Slippage Changes

| Action | UI Response |
|--------|-------------|
| User changes slippage | 1. Update displayed slippage value |
|  | 2. Clear current quote immediately |
|  | 3. Clear `toAmount` field |
|  | 4. Trigger new quote fetch (debounced) |
|  | 5. Show spinner while fetching |
|  | 6. Display new `minAmountOut` with new slippage |

---

## Slippage Change Rules

1. **Immediate visual feedback** — Selected slippage shows instantly in UI
2. **Quote invalidation is synchronous** — Quote clears BEFORE new fetch starts
3. **No "pending slippage"** — Displayed slippage is always the active slippage
4. **Modal inherits current slippage** — Preview modal shows the slippage used for that quote

---

## Explicitly Forbidden Behaviors

| Behavior | Why Forbidden |
|----------|---------------|
| **Silent slippage changes** | User must consent to every slippage value |
| **Auto-adjusting slippage for success** | Trades user funds without consent |
| **Backend overriding user slippage** | Violates user sovereignty |
| **Quote reuse after parameter change** | Could execute at wrong price |
| **Showing old quote with new slippage** | `minAmountOut` would be wrong |
| **Hiding slippage in modal** | User must see what they're signing |
| **Different slippage for approval vs swap** | Confusing and potentially exploitable |
