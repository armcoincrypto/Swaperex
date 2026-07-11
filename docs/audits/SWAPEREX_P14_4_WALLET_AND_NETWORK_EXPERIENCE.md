# SWAPEREX P14.4 — Wallet and Network Experience Audit

**Program:** P14 | **Date:** 2026-07-10

---

## Verdict

**P14_4_WALLET_NETWORK_EXPERIENCE_PASS_WITH_GAPS**

---

## Reown / AppKit configuration (CONFIRMED)

| Setting | Value | File |
|---------|-------|------|
| Library | `@reown/appkit` + ethers adapter | `appkit.ts` |
| Networks | mainnet, bsc, polygon, arbitrum, optimism, avalanche | `appkit.ts` |
| Injected | **disabled** | `enableInjected: false` |
| EIP-6963 | disabled | `appkit.ts` |
| Coinbase | disabled | `appkit.ts` |
| Email/social | disabled | `appkit.ts` |
| Init timing | Module load in `WalletBootstrap` | P8 lazy shell |
| Pre-init sanitizer | `sanitizeAppKitPersistedState()` | P11 fix |

---

## Wallet lifecycle

| Scenario | Behavior | Status |
|----------|----------|--------|
| No wallet | Connect + read-only CTAs | **CONFIRMED** |
| Connected WC | Address, chain, balance in header | **CONFIRMED** |
| Disconnect | Clears session | **CONFIRMED** |
| Stale injected state | Sanitized on init | **CONFIRMED** (Vitest) |
| Wrong chain | `ChainWarningBanner` | **CONFIRMED** |
| Account changed | AppKitBridge sync | **CONFIRMED** source |
| Chain changed | Wallet store + swap reset | **CONFIRMED** source |
| Read-only | Balances view; swap/send blocked | **CONFIRMED** |
| Terms gate | Before first connect | **CONFIRMED** |
| Session API POST | Off by default | **CONFIRMED** |
| Multiple tabs | AppKit default behavior | **NOT CONFIRMED** live |

---

## Network tier matrix (critical)

| Chain ID | Network | Wallet/AppKit | Token lists | Commission swap | Quote smoke |
|----------|---------|---------------|-------------|-----------------|-------------|
| 1 | Ethereum | Yes | Yes (26) | **Yes** | PASS |
| 56 | BNB Chain | Yes | Yes (25) | **Yes** | PASS |
| 137 | Polygon | Yes | Yes (8) | No | N/A |
| 42161 | Arbitrum | Yes | Yes (8) | No | N/A |
| 10 | Optimism | Yes | Yes (20) | No | N/A |
| 43114 | Avalanche | Yes | Yes (18) | No | N/A |
| 100 | Gnosis | Config only | Yes (15) | No | N/A |
| 250 | Fantom | Config only | Yes (12) | No | N/A |
| 8453 | Base | Config only | Yes (10) | No | N/A |

### Mismatch summary

- **Displayed in wallet selector:** 6 chains
- **Commission swap certified:** 2 chains
- **Footer disclosure:** Present (swap vs balance-view)
- **Risk:** User selects Arbitrum, picks tokens, quote fails or banner appears — **confusing**

**Recommended:** P15 network-tier selector redesign.

---

## Mobile / WalletConnect

- P12.1 mobile WC assist script in repo
- P12 certification: mobile WC validation **deferred**
- Reown chunk: **2.6 MB** (685 KB gzip) — loads lazily when needed

---

## Evidence

- `frontend/src/services/wallet/appkit.ts`
- `frontend/src/constants/commissionChains.ts`
- `frontend/src/wallet/chains.ts`
- Vitest: `sanitizeAppKitPersistedState.test.ts` (2/2 pass)
