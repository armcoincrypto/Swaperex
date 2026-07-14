# P18 Token Safety Accuracy

## Liquidity
- Scanner missing DEX data → "Token scanner liquidity data / Unavailable" (not "None found")
- Selected pool liquidity labeled separately with source explanation

## Ownership / supply
- "Ownership risk signal" / "No high-risk ownership flag detected"
- "Supply controls" / issuer may retain supply-management capabilities
- Unavailable states explicit; no renounced claim without verification

## Tests
`swapTokenSafetyModel.test.ts`, `tokenSecurityLiquidity.test.ts` — PASS
