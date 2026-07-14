# P18 Native Gas Reserve & Safe MAX

## Implementation
- Canonical config: `frontend/src/config/nativeGasReserve.ts`
- Helper: `calculateSafeNativeMax` / `checkNativeGasAffordability` in `frontend/src/utils/safeNativeMax.ts`
- Wired into `SwapInterface` MAX + preview/confirm gating

## Behavior
- Native MAX = balance − (live fee × margin + pad) when gas price available
- Fallback chain reserve when gas price unavailable (never silent 90% drain)
- MAX never negative
- Insufficient gas blocks preview/sign with dynamic ETH/BNB message

## Tests
See `frontend/src/utils/__tests__/safeNativeMax.test.ts` — PASS
