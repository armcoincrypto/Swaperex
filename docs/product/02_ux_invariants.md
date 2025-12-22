# UX Invariants — Swaperex Constitution

**Status**: LOCKED - These rules are non-negotiable. Any future change that violates them must be rejected.

---

## Input & Output

1. **Zero input = zero output** — If `fromAmount` is empty or zero, `toAmount` must be empty. Never show stale quotes.

2. **Clear input clears everything** — Clearing `fromAmount` resets `toAmount`, quote, route, and any error state.

3. **Token change clears quote** — Changing `fromAsset` or `toAsset` immediately clears the current quote and output amount.

4. **MAX uses real balance** — MAX button uses the actual on-chain balance, never a cached or estimated value.

---

## Slippage & Settings

5. **Slippage never auto-changes** — User-set slippage persists across sessions. System never overrides it silently.

6. **Default slippage is safe** — Default is 0.5%. Never default to >1% without explicit user action.

7. **Slippage is always visible** — Current slippage tolerance is displayed before transaction confirmation.

---

## Loading & Feedback

8. **No spinner without delay** — Spinners appear only after 250ms. Fast responses show no spinner.

9. **Loading never blocks input** — User can always type, change tokens, or cancel while quote is fetching.

10. **Errors are human-readable** — No raw error codes or technical jargon. Every error has a plain-English message.

---

## Transaction Safety

11. **Review before sign** — Every transaction shows a confirmation modal with amounts, slippage, and fees before wallet prompt.

12. **No transaction without quote** — Swap button is disabled unless a valid, non-expired quote exists.

13. **Quote expiry is enforced** — Quotes older than 30 seconds are rejected. User must refresh.

14. **Insufficient balance blocks action** — If balance < input amount, swap button is disabled with clear message.

---

## State Consistency

15. **Chain change clears state** — Switching networks clears tokens, amounts, and quotes. No cross-chain state pollution.

16. **Wallet disconnect clears sensitive state** — Disconnecting wallet clears balances and pending transactions.

17. **No phantom balances** — If balance fetch fails, show "—" or error, never stale data.

---

## Navigation & Flow

18. **Every action leads to swap** — Screener → Swap, Portfolio → Swap. All roads lead to the core action.

19. **Back always works** — User can always return to previous screen. No dead ends.

20. **No popups without user action** — Modals only appear from explicit user clicks, never automatically.

---

## Trust & Transparency

21. **Signing happens in wallet only** — No private key input fields. Ever.

22. **Route source is visible** — User can see which DEX/aggregator provides the quote (1inch, 0x, Paraswap).

23. **Fees are disclosed** — Any fees (gas, protocol) are shown before confirmation.

---

## Determinism

24. **Same-input determinism** — Given the same inputs (assets, amount, slippage, chain), the UI must always produce the same quote or clearly explain why it changed (e.g., "Price moved +0.3% since last quote").

---

*These 24 rules are the UX constitution. Memorize them.*
