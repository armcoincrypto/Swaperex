# SWAPEREX PAIR EXPANSION PLAN

## Current production limits

- Commission mode: **ON** (`VITE_COMMISSION_REQUIRED=true`)
- Swap-capable chains: **Ethereum (1)** and **BNB Chain (56)** only
- Commission wrappers (read-only verified):
  - ETH V2: `0x660B2E98E9eeAA4CaE21f319FbF3D6aD6909b491` — 20 bps
  - ETH V3 (multi-hop): `0xa7702Ce9267567fd811B39C886CdABeC6eB249fc` — 20 bps
  - BSC V2: `0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6` — 50 bps
- No backend quote API; routing is client-side via wrapper `staticCall` quotes
- Non-ETH/BSC chains appear in network selector but are **not** swap-ready in commission mode
- Workflow: audit → allowlist → dry-run quote → manual QA → deploy (deploy **not** done in this change)

## Existing audited pairs

**Before expansion:** 17 undirected / 34 directional pairs.

**After expansion (2026-07-07 audit):** 21 undirected / 42 directional pairs.

### Ethereum (12 undirected)

| Pair | Directions | Provider |
|------|------------|----------|
| WETH/USDC | both | V3 (WETH→USDC path) |
| WETH/USDT | both | V2 |
| WETH/DAI | both | V3 (WETH→USDC→DAI) |
| ETH/USDC | both | V2 (native → WETH) |
| ETH/USDT | both | V2 |
| WETH/WBTC | both | V2 |
| WETH/LINK | both | V2 |
| WETH/UNI | both | V2 |
| WETH/AAVE | both | V2 |
| WETH/LDO | both | V2 |
| WETH/SNX | both | V3 (WETH→USDC→SNX) |
| WETH/PENDLE | both | V3 (WETH→USDC→PENDLE) |

### BNB Chain (9 undirected)

| Pair | Directions | Provider |
|------|------------|----------|
| BNB/USDT | both | Pancake V2 |
| BNB/USDC | both | Pancake V2 |
| WBNB/USDT | both | Pancake V2 |
| WBNB/BTCB | both | Pancake V2 |
| CAKE/USDT | both | Pancake V2 |
| WBNB/CAKE | both | Pancake V2 |
| WBNB/USDC | both | Pancake V2 |
| WBNB/ETH | both | Pancake V2 |
| WBNB/FDUSD | both | Pancake V2 |

## Candidate new Ethereum pairs

All requested Ethereum candidates were **already in the allowlist**. This pass re-verified them and fixed token address checksum bugs (DAI, SNX, PENDLE).

| Candidate | Status | Notes |
|-----------|--------|-------|
| WETH/USDC | PASS | V3 single-hop |
| WETH/USDT | PASS | V2 |
| WETH/DAI | PASS (fixed) | Wrong DAI address corrected in `ethereum.json` |
| WETH/WBTC | PASS | V2 |
| WETH/LINK | PASS | V2 |
| WETH/UNI | PASS | V2 |
| WETH/AAVE | PASS | V2 |
| WETH/LDO | PASS | V2 |
| WETH/SNX | PASS (fixed) | Checksum fix + V3 multi-hop |
| WETH/PENDLE | PASS (fixed) | Checksum fix + V3 multi-hop |

## Candidate new BNB Chain pairs

| Candidate | Status | Notes |
|-----------|--------|-------|
| BNB/USDT | PASS | Already audited |
| BNB/USDC | PASS | Already audited |
| WBNB/USDT | PASS | Already audited |
| WBNB/BTCB | PASS | Already audited |
| CAKE/USDT | PASS | Already audited |
| WBNB/CAKE | **NEW PASS** | Added to allowlist |
| WBNB/USDC | **NEW PASS** | Added to allowlist |
| WBNB/ETH | **NEW PASS** | Added to allowlist |
| WBNB/FDUSD | **NEW PASS** | Added to allowlist |

## Pairs rejected and why

| Pair | Reason |
|------|--------|
| WETH/PEPE | Policy block (`COMMISSION_AUDIT_BLOCKED_PAIR_KEYS`) — meme/low-trust |
| PEPE/WETH | Policy block |
| All Polygon/Arbitrum/Optimism/Base/etc. | No commission wrappers deployed — remain non-swap-ready |

No candidate pair failed quote after token address corrections.

## Required files to modify

| File | Purpose |
|------|---------|
| `frontend/src/constants/commissionCoverage.ts` | Directional allowlist + audit timestamp |
| `frontend/src/constants/popularCommissionRoutes.ts` | UI shortcut presets (filtered by allowlist) |
| `frontend/src/utils/routeSupport.ts` | Token picker support tiers (UX only) |
| `frontend/src/tokens/ethereum.json` | Token registry (DAI/SNX/PENDLE checksum fixes) |
| `frontend/src/config/uniswapWrapperV3.ts` | Only if new V3 multi-hop paths needed — **no change required** |
| `scripts/audit/audit-commission-pairs.mjs` | Reusable read-only audit script |
| `docs/audits/swaperex-pair-expansion-plan.md` | This document |
| `docs/audits/swaperex-pair-expansion-qa.md` | Manual wallet QA matrix |

## Required dry-run tests

```bash
cd /root/Swaperex
bash scripts/audit/verify-wrappers.sh
node scripts/audit/audit-commission-pairs.mjs
```

Audit must confirm per direction (small / normal / large amounts):

- Quote returns `feeAmount > 0`
- `feeBps` matches chain (20 ETH, 50 BSC)
- Provider is wrapper contract (not direct router)
- Both directions pass before marking bidirectional in UI

Report: `reports/commission-pair-audit-YYYYMMDD.json`

## Required manual wallet QA

See `docs/audits/swaperex-pair-expansion-qa.md` for per-pair checklist.

Priority manual QA (new BSC pairs):

1. WBNB ⇄ CAKE
2. WBNB ⇄ USDC
3. WBNB ⇄ ETH
4. WBNB ⇄ FDUSD

Also re-verify after DAI address fix:

5. WETH ⇄ DAI

## Rollback plan

1. Revert allowlist changes in `commissionCoverage.ts` (remove 8 new BSC directional keys; restore prior `COMMISSION_COVERAGE_AUDIT_AT`).
2. Revert `popularCommissionRoutes.ts` and `routeSupport.ts` if UI regressions.
3. Revert `ethereum.json` only if DAI fix causes unexpected behavior (unlikely — prior address was invalid).
4. Rebuild frontend: `npm --prefix frontend run build`
5. Deploy only after explicit approval (not performed in this change).

```bash
git checkout HEAD -- frontend/src/constants/commissionCoverage.ts \
  frontend/src/constants/popularCommissionRoutes.ts \
  frontend/src/utils/routeSupport.ts \
  frontend/src/tokens/ethereum.json
```
