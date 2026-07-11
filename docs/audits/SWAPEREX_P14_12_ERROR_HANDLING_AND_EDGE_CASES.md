# SWAPEREX P14.12 — Error Handling and Edge Cases Audit

**Program:** P14 | **Date:** 2026-07-10

---

## Verdict

**P14_12_ERROR_HANDLING_INCOMPLETE**

(Strong source-level coverage; live edge-case matrix **partially confirmed** without wallet signing tests.)

---

## Error-state matrix

| Scenario | Current behavior | User message | Technical logging | Recovery path | Funds at risk | Severity | Recommended improvement |
|----------|------------------|--------------|-------------------|---------------|---------------|----------|-------------------------|
| No wallet | CTA "Connect wallet" | Clear | monitoring optional | Connect | None | LOW | — |
| Wrong chain | Banner + switch | chain_mismatch | yes | Switch network | Low if user ignores | MED | Non-dismiss on swap |
| Unsupported chain | Swap blocked | unsupported_chain | yes | Switch to ETH/BSC | None | MED | Tier UX |
| Unsupported token pair | Quote error | From quote/swap | swapTrace | Change pair | None | LOW | — |
| Zero balance | Disabled CTA | insufficient_balance | yes | Add funds | None | LOW | — |
| Insufficient gas | gas_error | Wallet/provider | yes | Add native | None | MED | Pre-estimate gas |
| Insufficient token | Disabled CTA | Clear | yes | Reduce amount | None | LOW | — |
| Approval rejected | user_rejected | Clear | yes | Retry | None | LOW | — |
| Approval failed | contract_error | Generic | yes | Retry | None | MED | Richer revert parse |
| Swap rejected | user_rejected | Clear | yes | Retry | None | LOW | — |
| Swap reverted | contract_error | Generic | yes | Refresh quote | None* | MED | Explorer link |
| RPC unavailable | rpc_timeout | Retryable | yes | Retry | None | MED | Fallback RPC |
| Quote provider down | quote error | Refresh CTA | yes | Retry | None | MED | — |
| Quote expired | quote_expired | Refresh quote | yes | Refresh | Low if stale exec | MED | — blocked |
| Token metadata failed | Fallback symbol | Partial | console | Manual | None | LOW | — |
| Balance fetch failed | Empty/loading | Implicit | yes | Retry | None | LOW | — |
| Explorer unavailable | No link | N/A | yes | Manual explorer | None | LOW | — |
| Session expired | WC reconnect | Wallet modal | AppKit | Reconnect | None | MED | Copy guidance |
| Page refresh | State reset | Neutral | — | Re-enter flow | None | LOW | — |
| Multiple tabs | Undefined | — | — | — | Low | LOW | Document |
| Account changed | Store sync | Implicit | yes | Continue | Low | MED | Toast notice |
| Chain changed | Quote invalidation | Implicit | yes | Re-quote | Low | MED | Toast notice |
| Network offline | fetch fail | network_error | yes | Retry | None | MED | Offline banner |
| Browser offline | Same | Same | — | Retry | None | MED | — |
| Read-only swap attempt | Blocked CTA | "Connect wallet" | — | Connect | None | LOW | Clearer copy |

*Funds not at risk if user does not sign stale txs — expiry guard confirmed in source.

---

## Central error infrastructure

`errorStore.ts` — categories, user messages, retryable flag, global display.

`portfolioErrorHandler.ts` — portfolio-specific mapping.

---

## Gaps

1. No unified **post-failure "your funds are safe"** reassurance panel
2. Swap revert messages often generic
3. Multi-tab behavior undocumented for users

---

## Verdict rationale

Source coverage is good; live wallet rejection/revert paths **not re-tested** in P14.
