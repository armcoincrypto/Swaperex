# SWAPEREX P14.5 — Token, Route, and Liquidity Coverage Audit

**Program:** P14 | **Date:** 2026-07-10

---

## Verdict

**P14_5_ROUTE_COVERAGE_LIMITED**

(Limited relative to major DEXs; **sufficient for certified commission product scope**.)

---

## Current supported matrix

### Chains (commission swap)

| Chain | Native | Wrapped | Stablecoins | Majors |
|-------|--------|---------|-------------|--------|
| Ethereum (1) | ETH | WETH | USDT, USDC, DAI, FDUSD | WBTC, LINK, UNI, AAVE, LDO, PEPE* |
| BNB Chain (56) | BNB | WBNB | USDT, USDC, FDUSD, BUSD | BTCB, ETH, CAKE |

*PEPE listed but **blocked** from commission routing (smoke confirms).

### Token list inventory (static JSON)

| File | Count |
|------|-------|
| ethereum.json | 26 |
| bsc.json | 25 |
| optimism.json | 20 |
| avalanche.json | 18 |
| gnosis.json | 15 |
| fantom.json | 12 |
| base.json | 10 |
| polygon.json | 8 |
| arbitrum.json | 8 |
| **Total** | **~142** |

Custom tokens: `localStorage` (`swaperex-custom-tokens`).

---

## Actually working matrix (production certified)

**126/126** commission pair audit tests PASS (`audit-commission-pairs.mjs`).

**17** popular display routes in catalog; filtered by audit allowlist.

**19/19** P12.5 smoke tests PASS including:
- ETH/USDT, WETH/USDT, WETH/USDC, ETH/USDC
- BNB/USDT, WBNB/USDT
- WETH/PEPE blocked

### Quote providers (CONFIRMED)

| Chain | Provider | Contract verified |
|-------|----------|-------------------|
| ETH | uniswap-v3-wrapper-v2/v3 | `verify-wrappers.sh` PASS |
| BSC | pancakeswap-v3-wrapper-v2 | PASS |

Legacy V1 wrapper listed in Trust Center for transparency.

---

## Partially working matrix

| Item | Status |
|------|--------|
| 1inch proxy (`/oneinch`) | Configured in backend-signals; not primary commission path |
| Non-audit token pairs in UI | May appear in selector but fail quote |
| L2 token lists | Display/balance only |
| Solana balance service | Code present; not core EVM swap |

---

## Missing high-priority routes (market expectation)

- Arbitrum/Base/Optimism **swap** routes
- Cross-stable routes beyond audited set (e.g. USDT↔USDC on all sizes)
- L2 native ETH pairs
- Long-tail meme tokens (intentionally restricted)

---

## Recommended expansion sequence

1. **P17** — Expand audit allowlist only after wrapper deployment on new chain
2. **P17** — Add top stable-stable pairs per chain with liquidity probes
3. **P20** — L2 commission wrappers (major architectural decision)
4. Always run `audit-commission-pairs.mjs` before promoting pairs in UI

---

## Risk controls for adding tokens

- `commissionCoverage.ts` audit allowlist gate
- `audit-commission-pairs.mjs` regression
- Token safety probes (`tokenSafetyProbe.ts`)
- Block high-risk pairs (PEPE pattern in smoke)
- Custom token user warning path

---

## Duplicate / unsafe token risks

- Native/wrapped pairs (ETH/WETH) handled with wrap keys excluded from popular routes
- Custom tokens: user-supplied — **MEDIUM** trust risk if abused
- No unlimited unverified token promotion in static lists
