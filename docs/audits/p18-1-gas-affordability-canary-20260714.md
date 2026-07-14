# P18.1 Gas Affordability Canary — 20260714

## BNB insufficient-gas
Observed CTA: `Insufficient BNB for fees`
Observed alert: `Insufficient BNB for network fees. Reduce the swap amount or add more BNB.`
No wallet signing prompt (signRequests=0).

## Gas unavailable
UI: `Quote ready — network fee unavailable` + wallet final-fee disclosure. Not fully ready. No false zero fee.

## ERC-20 approval affordability
Low-native / approval gating exercised; all sign attempts reject with 4001. No approval broadcast.
