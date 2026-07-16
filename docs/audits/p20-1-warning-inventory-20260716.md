# P20.1 Warning Inventory

All warnings preserved — compact presentation only.

| Warning | Source | Blocker? | Compact | Expanded | Regression test |
|---------|--------|----------|---------|----------|-----------------|
| Scanner unavailable | `fetchSwapTokenSafetySignals` null | Advisory | Liquidity scan: Unavailable | Full signal rows | `swapTokenSafetyModel.test.ts` unavailable distinct |
| Contract unverified | `security.contractVerified` | Advisory | Contract line | Full detail | Summary from canonical signal |
| Ownership risk | `parseOwnership` risk/warn | Advisory | Ownership line + banner | Full detail | Critical alerts test |
| Supply controls | `parseMintability` warn | Advisory | Supply controls line | Full detail | Ownership/supply wording tests |
| Proxy contract | `parseProxy` warn | Advisory | In expanded only | Full detail | Expanded checklist |
| Holder concentration | `parseHolderConcentration` risk/warn | Advisory | Banner if risk/warn | Full detail | `hasTokenSafetyHighRisk` |
| Wallet disconnected | `buildTradePreparationItems` network idle | Blocker (CTA) | Summary: Connect wallet | Checklist | `swapIntelCenterModel.test.ts` |
| Network mismatch | network warn | Blocker | Summary priority + expand | Checklist | Network priority test |
| Receive token unverified | token warn | Advisory | Summary if highest | Checklist | Preserved item |
| Slippage zero | slippage warn | Advisory | Summary if highest | Checklist | Preserved item |
| Quote pending/missing | quote pending/idle | Blocker (preview) | Summary pending text | Checklist | Ready/pending tests |
| High-risk banner | `status === 'risk'` | Advisory | Visible collapsed | Full analysis | Critical visibility test |

No blocker demoted. No warning removed.
