# P18.2 Safe MAX Deep Validation — 20260715

Evidence root: `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z`
Production URL: https://dex.kobbex.com
Live artifact: `883d8b58b1db224511b0a235532c687136823c2c` (`883d8b5`)
Production mutation: **NONE** (no redeploy; live labels already correct)


## Method
- Unit matrix in `safeNativeMax.test.ts` (BNB boundaries, ETH fallback, precision).
- Live production canary (controlled WalletConnect-path EIP-1193) on artifact `883d8b5`.

## BNB results
| Balance | Gas | Result |
|---------|-----|--------|
| 0 | live/fallback | MAX=0 |
| below fallback | fallback | MAX=0 |
| = fallback (0.002) | fallback | MAX=0 |
| 0.05 | live (~fee) | MAX≈0.048 (canary) |
| large | live | MAX < balance, reserve > 0 |
| 0.002 + input 0.0019 | live | **blocked** (insufficient gas) |

## ETH results
- Deterministic unit: chainId 1 fallback **0.005 ETH** applied correctly.
- Real-wallet tiny ETH: **SKIP_WITH_JUSTIFICATION** / canary `PASS_WITH_WARNINGS` — no funded ETH available; do not fund for test.

## Precision
- Format uses fixed decimals, strips trailing zeros; no scientific notation; never negative; never exceeds balance.

## Verdict
**PASS** for BNB; ETH real-wallet **SKIP_WITH_JUSTIFICATION**.
