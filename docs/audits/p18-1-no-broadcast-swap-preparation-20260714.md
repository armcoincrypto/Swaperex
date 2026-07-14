# P18.1 No-Broadcast Swap Preparation — 20260714

## Account / chain
- Account change A→B: PASS (stale amount cleared)
- BNB ↔ Ethereum switch: PASS
- Unsupported/balance-only network: PASS_WITH_WARNINGS

## Quote expiry
Expired state observed; refresh path available — PASS

## Swap preparation / rejection
Preview/sign attempts keep `eth_sendTransaction` rejected (4001).  
`approvalBroadcast=false`, `swapBroadcast=false`, `fundedSwap=false`

## Activity / support
Portfolio activity + Trust Center render — PASS_WITH_WARNINGS (no fabricated tx history)
