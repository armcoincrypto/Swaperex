# SWAPEREX P14.6 — Trust, Security, and Transparency Audit

**Program:** P14 | **Date:** 2026-07-10

---

## Verdict

**P14_6_TRUST_SECURITY_ACCEPTABLE_WITH_GAPS**

(No critical integration defects found. Formal smart-contract audit **not performed** in P14.)

---

## Visible trust elements

| Element | Present | Status |
|---------|---------|--------|
| Self-custody explanation | Trust Center + FAQ | **CONFIRMED** |
| No registration | Yes | **CONFIRMED** |
| Fee disclosure | 20bps ETH, 50bps BSC | **CONFIRMED** |
| Contract addresses | Trust Center + explorers | **CONFIRMED** |
| Supported chains | Explicit tiers | **CONFIRMED** |
| "Audited routes" | Internal certification language | **CONFIRMED** — not third-party |
| Slippage explanation | Settings warnings | **CONFIRMED** |
| Approval explanation | Exact vs unlimited | **CONFIRMED** |
| Terms / Privacy / Disclaimer | Crawlable routes | **CONFIRMED** |
| Status indicator | Footer health | **PARTIALLY CONFIRMED** |
| Public status page | No dedicated status.swaperex.com | **MISSING** |

---

## Frontend integration audit (CONFIRMED source review)

| Check | Result |
|-------|--------|
| Client-side signing only | Pass |
| No private keys in frontend | Pass |
| Wrong-chain signing guard | Banner + swap block |
| Allowance read before approval | `allowanceRead.ts` |
| Quote expiry before execution | `quoteExpiry`, `useSwap` |
| Unlimited approval warning | Yellow copy when selected |
| Receipt status checked | `useSwap` confirming state |
| Spender address in preview | SwapPreviewModal |
| Commission fee in quote | Smoke `commissionApplied: true` |
| RPC secrets in dist | P10 verify script exists |

---

## Transaction construction audit (CONFIRMED source)

- Wrapper tx builders: Uniswap V3 V2/V3, Pancake V2
- Deadline handling in builders (see `constants.ts` default deadline)
- Slippage applied to `minimum_received`
- Native ETH wrapping via WETH in wrapper path

---

## Contract integration review (CONFIRMED ops scripts)

`verify-wrappers.sh` (2026-07-10):
- ETH V1/V2/V3 wrappers: code present, feeBps correct, not paused
- BSC wrapper: verified
- Treasury: `0x509Cfd32ce279E08010C143F90Cc1782a3520196`

---

## Gaps / weaknesses

| ID | Issue | Severity |
|----|-------|----------|
| T1 | No third-party smart contract audit badge | MEDIUM (disclosed) |
| T2 | Legacy V1 wrapper still listed (transparency OK; user confusion possible) | LOW |
| T3 | Custom token import without strong friction | MEDIUM |
| T4 | No public incident/status page | MEDIUM |
| T5 | "Audited" language could be misread as external audit | LOW — mitigated in Trust Center |

---

## Formal smart-contract audit

**NOT PERFORMED** in P14. Scope was frontend integration + live wrapper verification only.

---

## Separation statement

| Scope | Performed |
|-------|-----------|
| Frontend integration audit | Yes |
| Transaction construction audit | Yes (source) |
| Contract integration review | Yes (verify script) |
| Formal smart-contract audit | No |
