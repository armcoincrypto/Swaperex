# SWAPEREX Post-P14 Finding Register

**Maintained from:** P14 finding register + P15 fixes  
**Last updated:** 2026-07-10

| ID | Origin | Area | Finding | Severity | Fix phase | Status | Evidence |
|----|--------|------|---------|----------|-----------|--------|----------|
| P14-F001 | P14 | Network | 6 wallet networks vs 2 swap | HIGH | P15 | **FIXED_NOT_DEPLOYED** | `networkCapabilities.ts`, `NetworkSelector.tsx` |
| P14-F002 | P14 | IA | Tabs lack URLs | HIGH | P16 | OPEN | — |
| P14-F003 | P14 | Swap UX | Gas not pre-wallet | HIGH | P15 | **FIXED_NOT_DEPLOYED** | `NetworkFeeEstimateRow.tsx` |
| P14-F004 | P14 | Performance | 2.6MB WC chunk | HIGH | P19 | OPEN | — |
| P14-F005 | P14 | Brand | Dual naming | MEDIUM | P16 | OPEN | — |
| P14-F006 | P14 | Trust | No public status | MEDIUM | P17 | OPEN | — |
| P14-F007 | P14 | Product | No tx history | MEDIUM | P17 | OPEN | — |
| P14-F008 | P14 | Security | Custom token friction | MEDIUM | P15 | **FIXED_NOT_DEPLOYED** | TokenSelector risk ack |
| P14-F009 | P14 | Mobile | WC validation deferred | MEDIUM | P16 | OPEN | — |
| P14-F010 | P14 | Swap UX | Route hop transparency | MEDIUM | P16 | OPEN | — |
| P14-F011 | P14 | a11y | Token selector a11y | MEDIUM | P19 | OPEN | — |
| P14-F012 | P14 | Errors | Generic reverts | MEDIUM | P16 | OPEN | — |
| P14-F013 | P14 | SEO | No og:image | MEDIUM | P18 | OPEN | — |
| P14-F014 | P14 | Tech debt | Legacy Python | MEDIUM | P19 | OPEN | — |
| P14-F015 | P14 | Swap safety | Dismissible wrong-chain | MEDIUM | P15 | **FIXED_NOT_DEPLOYED** | `TradeShell.tsx` |
| P14-F016 | P14 | Mobile | Safe area | LOW | P16 | OPEN | — |
| P14-F017 | P14 | Legacy | Withdrawal UI orphaned | LOW | P19 | OPEN | — |
| P14-F018 | P14 | a11y | Skip nav | LOW | P19 | OPEN | — |
| P14-F019 | P14 | Wallet | Multi-tab WC | LOW | P18 | OPEN | — |
| P14-F020–F024 | P14 | Polish | Various | POLISH | P16–P19 | OPEN | — |

**Closure rule:** FIXED → DEPLOYED_MONITORING → CLOSED requires production validation after certified deploy.
