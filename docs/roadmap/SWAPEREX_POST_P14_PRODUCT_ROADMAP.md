# Swaperex Post-P14 Product Roadmap

**Source:** P14_FULL_PRODUCT_FUNCTIONALITY_AND_EXPERIENCE_AUDIT (2026-07-10)  
**Production baseline:** `eee0264`  
**Rollback floor:** `75b2ce7`

Each phase requires separate approval before implementation. Phases are evidence-backed from P14 findings only.

---

## P15 — Critical correctness and trust

**Goal:** Eliminate user confusion that could affect conversion or signing decisions without changing routing/commission logic.

| Item | Scope | Why | Effort | Success criteria | Production gate |
|------|-------|-----|--------|------------------|-----------------|
| Network tier UX (F001) | Split swap vs balance-view in selector + copy | Prevents wrong-chain quote attempts | M | User on Polygon sees "balance only" before token pick | P12.5 smoke + manual QA |
| Custom token friction (F008) | Warning modal + scam pattern copy | Reduces trust defects | S | Custom token add requires explicit ack | Unit test |
| Wrong-chain banner (F015) | Non-dismiss or re-show on swap attempt | Safety clarity | S | Cannot swap with dismissed wrong-chain | Manual QA |
| Fee/spender clarity audit | Review preview modal copy only | Trust at sign boundary | S | All preview fields documented | Copy review |

**Dependencies:** None on contract changes  
**Risk:** Low regression if routing untouched

---

## P16 — Core swap comfort and usability

**Goal:** Match baseline DEX usability for the certified 2-chain product.

| Item | Scope | Why | Effort | Success criteria | Production gate |
|------|-------|-----|--------|------------------|-----------------|
| URL routes for tabs (F002) | `/send`, `/portfolio`, `/radar`, `/screener` | Shareable product | M | Refresh preserves tab | E2E smoke |
| Gas estimate row (F003) | UI estimate when quote ready | Competitive transparency | M | Gas shown on 4 smoke pairs | Smoke |
| Route detail polish (F010) | Expand transparency card | Trader confidence | M | Provider + path summary | Manual QA |
| Revert message decode (F012) | Parse common reverts | Recovery | M | User sees slippage vs generic | Unit tests |
| Mobile WC validation (F009) | Execute P12.1 on real devices | Mobile conversion | M | P12.1 PASS on iOS+Android | Device QA |
| Brand unification (F005) | SEO titles + hero | Credibility | S | Single primary brand | Visual review |
| Mobile safe-area (F016) | CSS env insets | Comfort | S | No clipped CTAs on iPhone | Device QA |
| Swap settings mobile sheet | Slippage/approval on small screens | Ergonomics | M | Usable at 360px | Viewport QA |

**Dependencies:** P15 network tier recommended first  
**Risk:** Medium — router changes need regression

---

## P17 — Product completeness

**Goal:** Fill gaps vs user expectations for a real DEX product.

| Item | Scope | Why | Effort | Success criteria | Production gate |
|------|-------|-----|--------|------------------|-----------------|
| Transaction activity (F007) | Explorer-linked history in Portfolio | Retention | L | Last 20 txs with links | Integration test |
| Public status page (F006) | status.dex.kobbex.com or /status | Trust | M | Shows smoke health | Ops review |
| Support contact | Footer mailto/link + FAQ | Support readiness | S | Link live | — |
| Expand audited pairs | Run audit script + promote | Coverage | M per batch | 0 FAIL in commission audit | audit-commission-pairs |
| Screener→swap prefill | Deep link token to swap | Growth | S | One-click from screener row | Manual QA |

**Dependencies:** P16 routes help deep linking  
**Risk:** Low–medium

---

## P18 — Trust and education

**Goal:** Strengthen public credibility without overstating claims.

| Item | Scope | Why | Effort | Success criteria | Production gate |
|------|-------|-----|--------|------------------|-----------------|
| Help center / FAQ expansion | Static content | SEO + support | M | 10+ articles | Content review |
| og:image (F013) | Social preview asset | Credibility | S | Valid OG tags | curl |
| Risk explanations | Approvals, irreversibility, RPC | Education | S | Linked from swap | Copy review |
| Multi-tab WC docs (F019) | User-facing help | Support | S | Published | — |
| Protocol stats sourcing (F023) | Label data sources | Honesty | S | No unexplained numbers | — |

---

## P19 — Performance and accessibility

**Goal:** Measurable web quality improvements.

| Item | Scope | Why | Effort | Success criteria | Production gate |
|------|-------|-----|--------|------------------|-----------------|
| Lighthouse CI / RUM | FCP, LCP, CLS baselines | Observability | M | Targets documented | CI |
| WC chunk monitoring (F004) | Track open latency | Mobile perf | S | p90 < 3s on 4G | RUM |
| a11y audit (F011) | axe + keyboard pass | Compliance | M | 0 blockers | axe CI |
| reduced-motion (F022) | CSS media query | a11y | S | Animations respect pref | Manual |
| skip-nav (F018) | a11y | LOW cost | S | Keyboard reachable swap | Manual |

---

## P20 — Growth and advanced capabilities

**Goal:** Optional expansion beyond current certified scope — **requires architecture review**.

| Item | Scope | Why | Effort | Risk |
|------|-------|-----|--------|------|
| L2 commission swap | New wrapper deploys | Market breadth | XL | High |
| Cross-chain | Bridge integration | User demand | XL | High |
| Limit orders | New product surface | Advanced traders | XL | Medium |
| MEV protection | Private RPC / Flashbots | Power users | L | Medium |
| Injected wallet | Re-enable MetaMask | Wallet breadth | M | Policy change |

**Production gate for P20:** New contract audit + full release certification pipeline.

---

## What must not change (without explicit program)

- Commission wrapper routing logic
- Fee bps (20 ETH / 50 BSC)
- Treasury addresses
- WalletConnect-only policy (unless deliberate product pivot)
- AppKit sanitizer behavior
- Production deploy without certification gates

---

## Recommended sequencing

```
P15 (trust/clarity) → P16 (swap UX) → P17 (completeness) → P18 (education) → P19 (perf/a11y) → P20 (expansion)
```

**First approved phase:** **P15**
