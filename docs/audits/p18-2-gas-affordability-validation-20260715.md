# P18.2 Gas Affordability Validation — 20260715

Evidence root: `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z`
Production URL: https://dex.kobbex.com
Live artifact: `883d8b58b1db224511b0a235532c687136823c2c` (`883d8b5`)
Production mutation: **NONE** (no redeploy; live labels already correct)


## Formula (unchanged)
Live path: `estimatedFee × (1 + LIVE_FEE_SAFETY_MARGIN=0.25) + padding`  
Fallback: centralized `NATIVE_GAS_FALLBACK_RESERVE[chainId]` (ETH 0.005 / BNB 0.002).

## Gates exercised
| Scenario | Result |
|----------|--------|
| Native insufficient | Quote may show; CTA blocked; `Insufficient BNB/ETH…`; no wallet prompt |
| ERC-20 approval + swap | Requires approval+swap(+pad); blocked before approve |
| Gas unavailable | `Quote ready — network fee unavailable`; not fully ready; fallback reserve |
| Quote expiry | Expiry precedence; CTA blocked; prep cleared |
| Wallet rejection | No broadcast (canary) |

## Fallback localization
Swap-enabled UI uses ETH/BNB symbols via network capability — no MATIC/AVAX messaging in those surfaces.

## Canary
`bnb_insufficient_gas`, `erc20_approval_gas`, `gas_unavailable`, `quote_expiry` → **PASS**.
