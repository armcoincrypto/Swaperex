# SWAPEREX P14 — Central Finding Register

**Program:** P14_FULL_PRODUCT_FUNCTIONALITY_AND_EXPERIENCE_AUDIT  
**Date:** 2026-07-10  
**Production:** `eee0264` | **HEAD:** `11c13e7`

---

## Summary counts

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 12 |
| LOW | 8 |
| POLISH | 5 |

---

## Findings

### P14-F001 — Network selector implies swap on all 6 chains

| Field | Value |
|-------|-------|
| Area | Wallet / Network |
| Description | User can switch to Polygon, Arbitrum, Optimism, or Avalanche in wallet UI, but commission swap only works on ETH and BSC. |
| Evidence | `commissionChains.ts` (2 chains) vs `appkit.ts` (6 networks); `CommissionSwapChainBanner` |
| User impact | Confusion, failed quotes, trust erosion |
| Business impact | Conversion drop, support tickets |
| Technical impact | None — working as designed but poorly communicated |
| Security impact | Low — swap blocked, not unsafe signing |
| Severity | **HIGH** |
| Confidence | CONFIRMED |
| Effort | M |
| Dependencies | None |
| Recommended action | Tier network selector: "Swap" vs "View balances" |
| Suggested phase | **P15** |

---

### P14-F002 — Main product tabs lack URL routes

| Field | Value |
|-------|-------|
| Area | Information architecture |
| Description | Portfolio, Send, Radar, Screener share `/` with in-memory state — not bookmarkable or shareable. |
| Evidence | `TradeShell.tsx` state-based `currentPage`; sitemap excludes tabs |
| User impact | Cannot deep link, refresh loses tab context |
| Business impact | SEO loss, poor sharing |
| Technical impact | Low |
| Security impact | None |
| Severity | **HIGH** |
| Confidence | CONFIRMED |
| Effort | M |
| Dependencies | Router refactor |
| Recommended action | Add `/send`, `/portfolio`, `/radar`, `/screener` routes |
| Suggested phase | **P16** |

---

### P14-F003 — Gas cost not shown pre-wallet

| Field | Value |
|-------|-------|
| Area | Swap UX |
| Description | Network fee estimate often only visible in wallet, not in swap summary. |
| Evidence | Source review SwapInterface / preview modal |
| User impact | Surprise costs, comparison difficulty |
| Business impact | Abandonment vs competitors |
| Technical impact | Requires eth_estimateGas integration in UI |
| Security impact | None |
| Severity | **HIGH** |
| Confidence | PARTIALLY CONFIRMED |
| Effort | M |
| Dependencies | RPC reliability |
| Recommended action | Show estimated gas + approval gas when quote ready |
| Suggested phase | **P16** |

---

### P14-F004 — Reown WalletConnect chunk size (2.6MB)

| Field | Value |
|-------|-------|
| Area | Performance |
| Description | Largest bundle chunk impacts first wallet open, especially mobile. |
| Evidence | Build output 2026-07-10; lazy load mitigates but does not eliminate |
| User impact | Slow connect flow |
| Business impact | Mobile conversion |
| Technical impact | Vendor constraint |
| Security impact | None |
| Severity | **HIGH** |
| Confidence | CONFIRMED |
| Effort | L (limited) |
| Dependencies | Reown SDK |
| Recommended action | Monitor; keep lazy load; RUM on WC open latency |
| Suggested phase | **P19** |

---

### P14-F005 — Dual branding Swaperex vs Kobbex DEX

| Field | Value |
|-------|-------|
| Area | Trust / SEO |
| Description | Titles use "Kobbex DEX", product uses "Swaperex", domain is dex.kobbex.com |
| Evidence | `routeSeo.ts`, `index.html`, Trust Center copy |
| User impact | Mild confusion |
| Business impact | Brand dilution |
| Severity | **MEDIUM** |
| Confidence | CONFIRMED |
| Effort | S |
| Suggested phase | **P16** |

---

### P14-F006 — No public status page

| Field | Value |
|-------|-------|
| Area | Trust / Ops |
| Description | Users cannot check system status independently of app footer |
| Evidence | No status subdomain; footer indicator only |
| Severity | **MEDIUM** |
| Confidence | CONFIRMED |
| Effort | M |
| Suggested phase | **P17** |

---

### P14-F007 — Transaction history not persistent/public

| Field | Value |
|-------|-------|
| Area | Product completeness |
| Description | Swap history is client-local; no explorer-integrated activity feed |
| Evidence | `swapHistoryStore.ts`, Portfolio activity partial |
| Severity | **MEDIUM** |
| Confidence | CONFIRMED |
| Effort | L |
| Suggested phase | **P17** |

---

### P14-F008 — Custom token import trust risk

| Field | Value |
|-------|-------|
| Area | Security / Trust |
| Description | Users can add custom tokens via localStorage with limited friction |
| Evidence | `customTokenStore.ts` |
| Severity | **MEDIUM** |
| Confidence | CONFIRMED |
| Effort | S |
| Suggested phase | **P15** |

---

### P14-F009 — Mobile WalletConnect validation deferred

| Field | Value |
|-------|-------|
| Area | Mobile / Wallet |
| Description | P12 certified with optional mobile WC QA deferred |
| Evidence | P12 audit docs, P12.1 script exists |
| Severity | **MEDIUM** |
| Confidence | CONFIRMED |
| Effort | M |
| Suggested phase | **P16** |

---

### P14-F010 — Route hop transparency limited

| Field | Value |
|-------|-------|
| Area | Swap UX |
| Description | Provider shown but not full pool hop path |
| Severity | **MEDIUM** |
| Confidence | CONFIRMED |
| Effort | M |
| Suggested phase | **P16** |

---

### P14-F011 — Accessibility gaps (token selector, contrast)

| Field | Value |
|-------|-------|
| Area | Accessibility |
| Description | Combobox semantics and contrast not fully verified |
| Severity | **MEDIUM** |
| Confidence | PARTIALLY CONFIRMED |
| Effort | M |
| Suggested phase | **P19** |

---

### P14-F012 — Generic on-chain revert messages

| Field | Value |
|-------|-------|
| Area | Error handling |
| Description | `contract_error` category lacks decoded revert reason |
| Severity | **MEDIUM** |
| Confidence | CONFIRMED |
| Effort | M |
| Suggested phase | **P16** |

---

### P14-F013 — No og:image in production HTML

| Field | Value |
|-------|-------|
| Area | SEO |
| Description | Social shares lack preview image |
| Severity | **MEDIUM** |
| Confidence | CONFIRMED (curl) |
| Effort | S |
| Suggested phase | **P18** |

---

### P14-F014 — Legacy custodial code in repo

| Field | Value |
|-------|-------|
| Area | Technical debt |
| Description | Python custodial stack and unmounted controllers create scope confusion |
| Evidence | `PRODUCT_TRUTH.md`, `web/controllers/` |
| Severity | **MEDIUM** |
| Confidence | CONFIRMED |
| Effort | L |
| Suggested phase | **Optional cleanup** |

---

### P14-F015 — Wrong-chain banner dismissible

| Field | Value |
|-------|-------|
| Area | Swap safety UX |
| Description | User can dismiss chain warning while remaining on wrong chain |
| Severity | **MEDIUM** |
| Confidence | CONFIRMED |
| Effort | S |
| Suggested phase | **P15** |

---

### P14-F016 — Safe area insets not explicit

| Field | Value |
|-------|-------|
| Area | Mobile |
| Description | No `safe-area-inset` CSS for notched devices |
| Severity | **LOW** |
| Suggested phase | **P16** |

---

### P14-F017 — Withdrawal UI orphaned

| Field | Value |
|-------|-------|
| Area | Legacy |
| Description | `WithdrawalInterface` not in navigation |
| Severity | **LOW** |
| Suggested phase | Cleanup |

---

### P14-F018 — No skip-nav link

| Field | Value |
|-------|-------|
| Area | Accessibility |
| Severity | **LOW** |
| Suggested phase | **P19** |

---

### P14-F019 — Multi-tab WC behavior undocumented

| Field | Value |
|-------|-------|
| Area | Wallet |
| Severity | **LOW** |
| Suggested phase | **P18** docs |

---

### P14-F020 — Vendor modal theme mismatch

| Field | Value |
|-------|-------|
| Area | Visual |
| Severity | **POLISH** |
| Suggested phase | **P19** |

---

### P14-F021 — Breadcrumbs absent

| Field | Value |
|-------|-------|
| Area | Navigation |
| Severity | **POLISH** |
| Suggested phase | **P16** |

---

### P14-F022 — Reduced motion not implemented

| Field | Value |
|-------|-------|
| Area | Accessibility |
| Severity | **POLISH** |
| Suggested phase | **P19** |

---

### P14-F023 — Protocol stats data source opacity

| Field | Value |
|-------|-------|
| Area | Homepage |
| Severity | **POLISH** |
| Suggested phase | **P18** |

---

### P14-F024 — Empty states inconsistent

| Field | Value |
|-------|-------|
| Area | Visual |
| Severity | **POLISH** |
| Suggested phase | **P19** |

---

## Positive findings (no remediation required)

| ID | Title |
|----|-------|
| P14-P001 | Production HEALTHY; 19/19 route smoke |
| P14-P002 | 126/126 commission pair audit |
| P14-P003 | Wrapper contracts verified on-chain |
| P14-P004 | WC-only + sanitizer P11 certified |
| P14-P005 | Trust Center transparency strong |
| P14-P006 | Quote expiry execution guard |
| P14-P007 | Operator runbooks + P13 observability |
