# 30-Day Execution Plan

---

## Week 1: Stabilization (Days 1-7)

**Theme**: Make what exists bulletproof.

| What Ships | Why It Matters |
|------------|----------------|
| Error message overhaul | Replace all "Something went wrong" with specific, actionable messages |
| Quote expiry enforcement | Hard 30-second TTL, visual countdown, forced refresh |
| Balance refresh on swap success | Users see updated balances immediately |
| Slippage persistence | User's slippage survives page reload |
| Review modal guardrails | All 10 mandatory checks implemented |
| Swap state machine audit | Verify no invalid state transitions in production |

**Success Criteria**:
- Swap success rate >95%
- Error rate <2%
- Zero user reports of "stuck" UI states
- Quote-to-swap conversion measured (baseline)

---

## Week 2: Discovery (Days 8-14)

**Theme**: Give users reasons to explore.

| What Ships | Why It Matters |
|------------|----------------|
| Token Detail Page (v1) | Price, liquidity, holder data, risk label, swap button |
| Risk labels on token selector | Users see Verified/Caution/High Risk before selecting |
| User-added token flow | Paste contract → validate → add to watched list |
| Expand curated lists | 25 tokens per chain (ETH + BSC), all verified |
| Honeypot detection | Block known honeypots, warn on suspicious contracts |
| Portfolio → Swap flow | One-click from portfolio to prefilled swap |

**Success Criteria**:
- Token page views measured (baseline)
- User-added tokens: >10 unique tokens added
- Honeypot warning shown >0 times (proves detection works)
- Time to first swap <5 minutes

---

## Week 3: Retention (Days 15-21)

**Theme**: Bring users back.

| What Ships | Why It Matters |
|------------|----------------|
| Telegram bot (v1) | Connect wallet → receive alerts |
| Price alerts (basic) | Watched token moves >20% → Telegram notification |
| Liquidity alerts | Watched token liquidity drops >25% → immediate warning |
| Watchlist | Users can save tokens without balance |
| Recent swaps history | "Your last 10 swaps" visible in UI |
| Session persistence | Wallet stays connected across tabs/refreshes |

**Success Criteria**:
- Telegram connections: >50 wallets
- 7-day retention >15%
- Alert → site visit rate >10%
- Returning users measured

---

## Week 4: Growth (Days 22-30)

**Theme**: Make Swaperex shareable.

| What Ships | Why It Matters |
|------------|----------------|
| Early Radar (v1) | Surface tokens with new liquidity, volume spikes |
| Share token page | Shareable links with preview cards |
| Referral tracking (basic) | `?ref=` parameter tracked on swaps |
| Gas optimization | Reduce failed transactions from gas estimation |
| Mobile responsiveness | Full swap flow works on mobile browsers |
| Analytics dashboard (internal) | Track all 10 key metrics in real-time |

**Success Criteria**:
- Early Radar surfaces >5 tokens before trending
- Share links generate >100 visits
- Mobile swap success rate matches desktop
- All 10 metrics tracked and visible
- 7-day retention >20%

---

## Weekly Rhythm

| Day | Activity |
|-----|----------|
| Monday | Deploy week's features to staging |
| Tuesday-Wednesday | Internal testing, bug fixes |
| Thursday | Production deploy (if stable) |
| Friday | Metrics review, prioritize next week |
| Weekend | Monitoring only, no deploys |

---

## What NOT to Do in 30 Days

| ❌ Don't | Why |
|----------|-----|
| Add new chains (Polygon, Arbitrum) | Stabilize ETH + BSC first |
| Build advanced charting | Token page v1 is data, not charts |
| Create token launchpad | Outside core mission |
| Add limit orders | Complexity explosion, defer |
| Build mobile app | Mobile web first |
| Add social features | Trading tool, not social network |
| Implement AI predictions | Trust requires explainability |
| Over-engineer UI animations | Performance over polish |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| 1inch API downtime | Fallback to Uniswap direct, show "Backup route" |
| RPC rate limits | Multiple providers, exponential backoff |
| Token scam surge | Strengthen honeypot detection, default to Caution |
| Telegram bot blocked | Email fallback designed but not built |
| Metric tracking breaks | Dual logging (client + server) |
