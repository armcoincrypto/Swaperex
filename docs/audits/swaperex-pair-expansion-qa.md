# SWAPEREX PAIR EXPANSION — MANUAL WALLET QA

**Scope:** New and re-verified pairs after 2026-07-07 dry-run audit.  
**Commit:** `77c039b`  
**Chains:** Ethereum (1), BNB Chain (56) only.  
**Automated swap-surface QA:** `reports/manual-qa-swap-surface-20260707.json` (2026-07-07)  
**Do not broadcast** until owner wallet QA sign-off.

---

## QA environment

| Item | Status |
|------|--------|
| `npm --prefix frontend run build` | PASS |
| Dev server `http://127.0.0.1:5173` | PASS (HTTP 200) |
| Browser + MetaMask wallet QA | **NOT TESTED** (no wallet in agent environment) |
| Programmatic quote + tx.to wrapper | PASS (10/10 directions) |

---

## New BSC pairs (priority)

### WBNB ⇄ CAKE

#### WBNB → CAKE

```text
Pair: WBNB/CAKE
Chain: 56 (BNB Chain)
Direction: WBNB → CAKE
Verdict: PASS (programmatic) / NOT TESTED (wallet UI)

Quote appears: PASS
Evidence: amountOut 40.46 CAKE @ 0.1 WBNB; audit-commission-pairs + manual-qa-swap-surface
Notes: Wallet UI quote display not exercised in browser.

Commission shown: NOT TESTED
Evidence: feeBps=50, feeAmount>0 in dry-run quote
Notes: SwapPreviewModal shows fee via getMonetizationConfig(); needs wallet preview confirm.

Minimum received shown: PASS (computed)
Evidence: minOut 40.26 @ 0.5% slippage in manual-qa-swap-surface
Notes: UI label not verified in browser.

Tx target is wrapper: PASS
Evidence: tx.to = 0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6
Notes: Encoded swapExactInputSingleERC20 to Pancake wrapper V2.

No direct router bypass: PASS
Evidence: tx.to ≠ Pancake router 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4

User rejected tx test: NOT TESTED
Evidence: Requires MetaMask reject on preview
Notes: Owner must confirm reject flow before deploy.

Wallet network switch: NOT TESTED
```

#### CAKE → WBNB

```text
Pair: WBNB/CAKE
Chain: 56
Direction: CAKE → WBNB
Verdict: PASS (programmatic) / NOT TESTED (wallet UI)

Quote appears: PASS
Evidence: amountOut 0.000244 WBNB @ 0.1 CAKE
Notes: —

Commission shown: NOT TESTED
Evidence: feeBps=50, feeAmount>0
Notes: —

Minimum received shown: PASS (computed)
Evidence: minOut derived with 0.5% slippage
Notes: —

Tx target is wrapper: PASS
Evidence: tx.to = 0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6

No direct router bypass: PASS

User rejected tx test: NOT TESTED
```

---

### WBNB ⇄ USDC

#### WBNB → USDC

```text
Verdict: PASS (programmatic) / NOT TESTED (wallet UI)
Quote appears: PASS — amountOut ~57.43 USDC @ 0.1 WBNB
Commission shown: NOT TESTED — feeBps=50 dry-run
Minimum received shown: PASS (computed)
Tx target is wrapper: PASS — 0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6
No direct router bypass: PASS
User rejected tx test: NOT TESTED
Evidence: manual-qa-swap-surface id=wbnb-usdc-fwd
Notes: —
```

#### USDC → WBNB

```text
Verdict: PASS (programmatic) / NOT TESTED (wallet UI)
Quote appears: PASS — amountOut ~0.043 WBNB @ 25 USDC
Commission shown: NOT TESTED — feeBps=50
Minimum received shown: PASS (computed)
Tx target is wrapper: PASS
No direct router bypass: PASS
User rejected tx test: NOT TESTED
Evidence: manual-qa-swap-surface id=wbnb-usdc-rev
```

---

### WBNB ⇄ ETH

#### WBNB → ETH

```text
Verdict: PASS (programmatic) / NOT TESTED (wallet UI)
Quote appears: PASS — amountOut ~0.0324 ETH @ 0.1 WBNB
Commission shown: NOT TESTED — feeBps=50
Minimum received shown: PASS (computed)
Tx target is wrapper: PASS — 0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6
No direct router bypass: PASS
User rejected tx test: NOT TESTED
Evidence: manual-qa-swap-surface id=wbnb-eth-fwd
```

#### ETH → WBNB

```text
Verdict: PASS (programmatic) / NOT TESTED (wallet UI)
Quote appears: PASS — amountOut ~0.0306 WBNB @ 0.01 ETH
Commission shown: NOT TESTED — feeBps=50
Minimum received shown: PASS (computed)
Tx target is wrapper: PASS
No direct router bypass: PASS
User rejected tx test: NOT TESTED
Evidence: manual-qa-swap-surface id=wbnb-eth-rev
```

---

### WBNB ⇄ FDUSD

#### WBNB → FDUSD

```text
Verdict: PASS (programmatic) / NOT TESTED (wallet UI)
Quote appears: PASS — amountOut ~56.10 FDUSD @ 0.1 WBNB
Commission shown: NOT TESTED — feeBps=50
Minimum received shown: PASS (computed)
Tx target is wrapper: PASS — 0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6
No direct router bypass: PASS
User rejected tx test: NOT TESTED
Evidence: manual-qa-swap-surface id=wbnb-fdusd-fwd
Notes: FDUSD liquidity thinner at large size; monitor in wallet QA.
```

#### FDUSD → WBNB

```text
Verdict: PASS (programmatic) / NOT TESTED (wallet UI)
Quote appears: PASS — amountOut ~0.000172 WBNB @ 0.1 FDUSD
Commission shown: NOT TESTED — feeBps=50
Minimum received shown: PASS (computed)
Tx target is wrapper: PASS
No direct router bypass: PASS
User rejected tx test: NOT TESTED
Evidence: manual-qa-swap-surface id=wbnb-fdusd-rev
```

---

## Re-verify after DAI address fix

### WETH ⇄ DAI

#### WETH → DAI

```text
Verdict: PASS (programmatic) / NOT TESTED (wallet UI)
Quote appears: PASS — amountOut ~17.72 DAI @ 0.01 WETH via V3 multi-hop
Commission shown: NOT TESTED — feeBps=20 dry-run
Minimum received shown: PASS (computed) — minOut ~17.63
Tx target is wrapper: PASS — 0xa7702Ce9267567fd811B39C886CdABeC6eB249fc (V3)
No direct router bypass: PASS — tx.to ≠ Uniswap router
User rejected tx test: NOT TESTED
Evidence: manual-qa-swap-surface id=weth-dai-fwd; DAI address fix 0x6B175474E89094C44Da98b954EedeAC495271d0F
Notes: Critical mainnet fix — wallet QA strongly recommended before deploy.
```

#### DAI → WETH

```text
Verdict: PASS (programmatic) / NOT TESTED (wallet UI)
Quote appears: PASS — V2 single-hop quote @ 0.1 DAI
Commission shown: NOT TESTED — feeBps=20
Minimum received shown: PASS (computed)
Tx target is wrapper: PASS — 0x660B2E98E9eeAA4CaE21f319FbF3D6aD6909b491 (V2)
No direct router bypass: PASS
User rejected tx test: NOT TESTED
Evidence: manual-qa-swap-surface id=weth-dai-rev
```

---

## Negative tests

### WETH → PEPE (must be blocked)

```text
Verdict: PASS
Evidence: COMMISSION_AUDIT_BLOCKED_PAIR_KEYS contains 1|WETH|PEPE; not in allowlist; SwapInterface uses isCommissionPairAuditBlocked for commission route issue panel
Notes: Wallet UI should show unsupported/blocked — NOT TESTED in browser
```

### Polygon / Arbitrum unsupported (commission mode)

```text
Verdict: PASS (logic)
Evidence: quoteAggregator throws for chainId ∉ {1,56} when VITE_COMMISSION_REQUIRED=true; reason commission_chain_no_wrapper / unsupported_commission_route
Notes: Network selector may still list chains; swap must not proceed — NOT TESTED in browser
Chains to spot-check: Polygon (137), Arbitrum (42161)
```

### Wrong network

```text
Verdict: NOT TESTED
Evidence: —
Notes: Owner should confirm clear error when wallet network ≠ selected chain
```

---

## Regression spot-check (existing pairs)

| Pair | Verdict | Evidence |
|------|---------|----------|
| WETH → USDC | PASS | commission-pair-audit-20260707.json |
| ETH → USDT | PASS | commission-pair-audit-20260707.json |
| BNB → USDT | PASS | commission-pair-audit-20260707.json |
| WBNB → BTCB | PASS | commission-pair-audit-20260707.json |
| WETH → SNX | PASS | V3 multi-hop audit |
| WETH → PENDLE | PASS | V3 multi-hop audit |

---

## Owner wallet sign-off (required before deploy)

- [ ] WBNB ⇄ CAKE — quote + commission + min received in preview + wrapper tx target + reject tx
- [ ] WBNB ⇄ USDC — same
- [ ] WBNB ⇄ ETH — same
- [ ] WBNB ⇄ FDUSD — same
- [ ] WETH ⇄ DAI — same (priority: post-address fix)
- [ ] WETH → PEPE blocked in UI
- [ ] Polygon/Arbitrum show unsupported in commission mode

**Signed off by:** _______________ **Date:** _______________
