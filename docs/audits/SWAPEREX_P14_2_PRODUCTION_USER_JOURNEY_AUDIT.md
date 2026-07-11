# SWAPEREX P14.2 — Production User Journey Audit

**Program:** P14  
**Date:** 2026-07-10  
**Production baseline:** `eee0264`  
**Audit method:** Production HTTP + P12.5 Playwright smoke + source review. **No wallet signatures, no swaps, no approvals.**

---

## Verdict

**P14_2_USER_JOURNEYS_PASS_WITH_FRICTION**

---

## Test coverage note

| Method | Coverage |
|--------|----------|
| P12.5 route-quote smoke (Playwright, production) | HTTP routes, bundle load, on-chain quotes, UI quote widgets |
| Manual curl / health checks | version.txt, health, proxies |
| Live wallet connect QA | **NOT PERFORMED** (safety restriction) |
| Multi-viewport manual browser | **NOT PERFORMED** — inferred from responsive Tailwind classes + prior P12 mobile deferral |

---

## Journey A — First-time visitor

| Question | Finding | Status |
|----------|---------|--------|
| Understand product in 5 seconds? | Hero + "Non-custodial swap" meta; brand "Swaperex" / "Kobbex DEX" mixed | **PARTIALLY CONFIRMED** |
| Main action obvious? | Swap card is above fold on `/` | **CONFIRMED** |
| Trustworthy? | Trust strip, Trust Center link, no fake badges | **CONFIRMED** |
| Supported networks clear? | Footer lists swap vs balance-view networks; wallet shows 6 chains | **PARTIALLY CONFIRMED** — friction |
| Supported tokens clear? | Token picker + popular routes | **CONFIRMED** |
| Fees understood? | Trust Center + route transparency; commission in quote | **CONFIRMED** |
| Custody model clear? | Trust Center + FAQ JSON-LD | **CONFIRMED** |
| Registration required? | No — wallet or read-only | **CONFIRMED** |
| Feels finished? | Professional dark UI; optional tabs add depth | **CONFIRMED** with polish gaps |

**Friction:** Dual branding (Swaperex vs Kobbex DEX) and six selectable networks when only two support commission swap.

---

## Journey B — Connect wallet

| Test | Finding | Status |
|------|---------|--------|
| Open / close wallet modal | Reown AppKit modal; lazy-loaded wallet chunk | **CONFIRMED** source |
| Reopen after refresh | AppKit persistence + P11 sanitizer | **CONFIRMED** (Vitest + P11 docs) |
| WalletConnect connect | WC-only; injected disabled | **CONFIRMED** config |
| Reject connection | Error surfaced via wallet hook | **CONFIRMED** source |
| Disconnect / reconnect | Supported | **CONFIRMED** source |
| Read-only path | "View address" without WC | **CONFIRMED** source |
| Terms gate | Blocks connect until accepted | **CONFIRMED** source |
| Mobile QR / deep link | P12.1 assist script exists; live mobile **deferred** | **PARTIALLY CONFIRMED** |
| Vendor console warnings | P12 runtime warning monitor; 1 benign warning in status | **CONFIRMED** ops |

**NOT CONFIRMED live:** Full WC session on mobile device in this audit window.

---

## Journey C — Build a quote

Tested via P12.5 smoke against production:

| Scenario | Result | Status |
|----------|--------|--------|
| ETH → USDT | PASS, wrapper v2, ~114ms | **CONFIRMED** |
| WETH → USDT | PASS, ~43ms | **CONFIRMED** |
| USDT → ETH (reverse) | In commission audit 126 pairs | **CONFIRMED** |
| BNB → USDT | PASS, Pancake wrapper | **CONFIRMED** |
| WBNB → USDT | PASS | **CONFIRMED** |
| WETH → PEPE | Blocked as expected | **CONFIRMED** |
| UI quote path ETH/USDT | PASS, ~8ms median | **CONFIRMED** |
| Zero / invalid amount | Validation in `SwapInterface` | **CONFIRMED** source |
| Wrong network (Polygon) | Commission banner blocks swap | **CONFIRMED** source |
| Rapid token switching | Quote invalidation in `useSwap` | **CONFIRMED** source |

**NOT live-tested:** RPC failure injection on production (would require controlled outage).

---

## Journey D — Transaction preparation (pre-signature)

| Element | Present | Status |
|---------|---------|--------|
| Approval requirement indicator | Yes | **CONFIRMED** source |
| Transaction summary | `SwapPreviewModal` | **CONFIRMED** source |
| Route details | `RouteTransparencyCard` | **CONFIRMED** source |
| Minimum received | Yes | **CONFIRMED** |
| Price impact | Yes (with caveats) | **PARTIALLY CONFIRMED** |
| Slippage | Settings + preview | **CONFIRMED** |
| Network fee | Via wallet at sign time | **PARTIALLY CONFIRMED** |
| Commission / protocol fee | Shown in transparency card | **CONFIRMED** |
| Spender / contract | Preview modal | **CONFIRMED** source |
| Expiry / deadline | Quote expiry handling | **CONFIRMED** source |

Stopped before signature per safety rules.

---

## Journey E — Failure and recovery

| Scenario | Behavior | Status |
|----------|----------|--------|
| Wallet rejected | `user_rejected` category | **CONFIRMED** source |
| Wrong chain | Banner + switch CTA | **CONFIRMED** source |
| Quote unavailable | Error store + swap error | **CONFIRMED** source |
| Quote expired | Refresh CTA | **CONFIRMED** source |
| Insufficient balance | CTA disabled + message | **CONFIRMED** source |
| Browser refresh mid-flow | Quote reset; WC persistence | **CONFIRMED** source |
| Wallet disconnect mid-flow | Swap blocked | **CONFIRMED** source |
| Network change mid-flow | Chain sync via AppKitBridge | **CONFIRMED** source |

Global error store (`errorStore.ts`) centralizes user messages.

---

## Journey F — Mobile usability

| Area | Finding | Severity |
|------|---------|----------|
| Tap targets | `min-h-[3.25rem]` on token buttons | **ACCEPTABLE** |
| Token selector | Full-width on small screens | **CONFIRMED** source |
| Modal height | Reown vendor modal | **PARTIALLY CONFIRMED** |
| Wallet QR | WC modal | **PARTIALLY CONFIRMED** |
| Safe area | Some `sm:` breakpoints; no explicit `env(safe-area-inset-*)` grep hits | **MEDIUM** gap |
| Landscape | Not explicitly tested | **NOT CONFIRMED** |
| Below-fold SEO defer | Scroll sentinel for LCP | **CONFIRMED** — good for mobile perf |

P12 certified with optional mobile WC validation deferred.

---

## Viewport matrix

| Viewport | Method | Result |
|----------|--------|--------|
| 1440×900 | Source (responsive classes) | Expected OK |
| 1280×800 | Source | Expected OK |
| 1024×768 | Source | Expected OK |
| 768×1024 | Source | Expected OK |
| 430×932 | Source + P12 defer | Expected OK with WC TBD |
| 390×844 | Source | Expected OK |
| 360×800 | Source | Expected OK |

**RECOMMENDED:** P16 dedicated mobile WC validation on real devices.

---

## Evidence

- `reports/p12-5-route-quote-smoke.json`
- `docs/audits/raw/p14/baseline/p12-5-route-quote-smoke.json`
- `reports/p13/status/p13-production-status.json`
