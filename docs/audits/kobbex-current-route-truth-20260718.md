# Kobbex DEX — Current Route Truth Audit (2026-07-18)

## Scope

Regenerate executable commission-route truth for Ethereum (`1`) and BNB Chain (`56`) from:

- current source in worktree `/root/Swaperex-route-truth-20260718`
- branch `audit/kobbex-current-route-truth-20260718`
- production env `frontend/.env.production`
- live wrapper contracts (read-only)
- quote simulation + Anvil fork native execution (no funded production swaps)

Production artifact left untouched until P21.1 cutover: `78c0aaf` at `https://dex.kobbex.com` (`/var/www/swaperex`).

## Ownership / isolation

| Item | Value |
|------|-------|
| Primary tree | `/root/Swaperex` (dirty; left alone) |
| Isolation | `/root/Swaperex-route-truth-20260718` |
| Base HEAD | `9b817c3493d11c4047ce4e726e3c887425ee2bc5` |
| Rollback floor | `78c0aaf` |

## Commission / wrapper truth (on-chain)

| Chain | Wrapper | Fee | Treasury |
|-------|---------|-----|----------|
| ETH V1 | `0xe07f5940487a58E30F9fa711Be358FB036B0Fc44` | 20 bps | `0x509Cfd32ce279E08010C143F90Cc1782a3520196` |
| ETH V2 | `0x660B2E98E9eeAA4CaE21f319FbF3D6aD6909b491` | 20 bps | same |
| ETH V3 | `0xa7702Ce9267567fd811B39C886CdABeC6eB249fc` | 20 bps | same |
| BSC V2 | `0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6` | 50 bps | same |

Runtime: `VITE_COMMISSION_REQUIRED=true` (fail-closed; no silent direct-router bypass).

## Critical execution finding

Uniswap V2 and Pancake V2 wrappers **reject wrapped-native as ERC-20 endpoints**:

- ETH V2 reverts when `tokenIn`/`tokenOut` is WETH (`NativeEth_NotSupported`)
- BSC V2 reverts when `tokenIn`/`tokenOut` is WBNB (`InvalidPath`)

Native legs must use native entrypoints. Therefore **WBNB-labeled “certified” routes were false positives** from quote-only ERC-20 audits.

## P21.1 — Certified route execution enforcement

`frontend/src/utils/commissionRoutePolicy.ts` is the canonical execution API:

- `resolveCommissionTokenIdentity` — address / native-sentinel based
- `isCommissionRouteCertified` / `getCertifiedCommissionRoute` / `assertCommissionRouteCertified`

Enforcement boundaries (commission-required mode):

1. `quoteAggregator.getAggregatedQuote` — before any provider call
2. `useSwap.fetchSwapQuote` — before quote + after quote acceptance
3. `useSwap.executeApproval` — before approval construction
4. `useSwap.executeSwap` — preflight + final guard before wallet `sendTransaction`
5. `useSwap.confirmSwap` — before execution handoff

Catalog alignment audit: `npm run audit:commission-coverage-alignment` (`MISMATCHES=0`).

Negative probes: `npm run audit:commission-negative-probes`.

## Certified catalog after this audit

`frontend/src/constants/commissionCoverage.ts` stamp: `2026-07-18T14:00:00.000Z`

- **46** directional certified keys
- Ethereum: **34**
- BNB Chain: **12**

### Explicitly not certified / blocked

- `WETH/ETH ⇄ PEPE` (policy)
- All `WBNB ⇄ *` ERC-20 commission legs
- `BNB/WBNB ⇄ FDUSD`
- `SNX`, `PENDLE` multi-hop paths
- `ETH ⇄ WETH` / `BNB ⇄ WBNB` wrap/unwrap
