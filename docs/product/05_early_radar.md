# Early Radar System

**Purpose**: Surface tokens before they trend. This is the DexScreener killer.

---

## Signal 1: Liquidity Added Events

**What to track:**
- New liquidity pool created (PairCreated events)
- Significant liquidity additions to existing pools (>$10K)
- Liquidity unlock events (tokens becoming tradeable)

**Why it matters:**
- New pool = new tradeable token (earliest possible signal)
- Large liquidity add = someone believes in this token
- Dev adding liquidity before announcement = alpha

**False positives:**
- Test deployments (filter: require >$5K initial liquidity)
- Rug setup (dev adds liquidity, waits for buys, pulls)
- Migration pools (old token → new token, not actually new)

**Mitigation:**
- Cross-reference with contract age (>24h old contract = migration likely)
- Check if liquidity is locked
- Flag "unlocked liquidity" prominently

---

## Signal 2: Volume Acceleration

**What to track:**
- Volume increase rate: current hour vs previous 4-hour average
- Volume spike: >5x normal in 1 hour
- Volume without price pump (accumulation signal)

**Why it matters:**
- Smart money accumulates before price moves
- Sudden volume = something is happening (news, listing, whale)
- Volume precedes price (classic market principle)

**False positives:**
- Wash trading (same wallet buying/selling)
- Bot arbitrage loops (high volume, zero net movement)
- Single whale moving position (not organic interest)

**Mitigation:**
- Track unique wallets, not just volume
- Require minimum 20 unique traders in acceleration period
- Flag if top 3 wallets >50% of volume

---

## Signal 3: Unique Buyers Growth

**What to track:**
- New unique buyer wallets per hour
- Buyer growth rate: this hour vs 24h average
- First-time buyers (wallet never held this token)

**Why it matters:**
- More buyers = wider distribution = harder to dump
- Organic growth looks like steady new buyers
- Viral tokens show exponential buyer growth

**False positives:**
- Sybil attacks (one person, many wallets)
- Airdrop farming (create wallets, buy minimum, wait for airdrop)
- Bot networks testing token

**Mitigation:**
- Require minimum buy size ($10+) to count as buyer
- Check wallet age (new wallet = suspicious)
- Track if buyers are holding vs immediately selling

---

## Signal Classification: Early & Risky vs Early & Healthy

### Early & Risky (Yellow/Orange Label)

Token shows early signals BUT has red flags:

| Signal Present | Red Flag |
|---------------|----------|
| New liquidity | Liquidity unlocked (rug possible) |
| Volume spike | <20 unique traders |
| Buyer growth | Buyers immediately selling |
| Any signal | Contract unverified |
| Any signal | Top 10 wallets hold >60% |
| Any signal | Creator wallet active (hasn't renounced) |

**User message**: "🟡 Early activity detected — high risk, unverified"

### Early & Healthy (Green Label)

Token shows early signals AND passes safety checks:

| Signal Present | Safety Check Passed |
|---------------|-------------------|
| New liquidity | Liquidity locked >30 days |
| Volume spike | >50 unique traders |
| Buyer growth | Buyers holding average >4 hours |
| All signals | Contract verified |
| All signals | Top 10 wallets hold <40% |
| All signals | No honeypot detected |

**User message**: "🟢 Early activity detected — signals healthy"

---

## Composite Radar Score

Combine signals into a single "Early Score" (0-100):

| Component | Weight | Calculation |
|-----------|--------|-------------|
| Liquidity recency | 25% | Hours since pool created (newer = higher) |
| Volume acceleration | 25% | Current vs average ratio |
| Buyer growth | 25% | New buyers this hour vs 24h average |
| Safety multiplier | 25% | 1.0 if healthy, 0.5 if risky, 0 if honeypot |

**Score interpretation:**
- 80-100: "🔥 Hot — Very early, healthy signals"
- 60-79: "📈 Warming — Growing interest"
- 40-59: "👀 Watching — Some activity"
- <40: Not shown on radar

---

## Why This Beats DexScreener

| DexScreener | Swaperex Early Radar |
|-------------|---------------------|
| Shows trending AFTER pump | Surfaces BEFORE trending |
| No safety classification | Clear "risky vs healthy" labels |
| View only | One-click swap from radar |
| Same data everyone sees | Unique composite scoring |
| No honeypot warnings | Honeypot check built-in |

**The edge**: By the time a token hits DexScreener trending, the early move is over. Swaperex shows it when liquidity is added, not when volume peaks.

---

## Data Sources Required

1. **On-chain events** (via RPC or indexed):
   - PairCreated events (Uniswap, PancakeSwap factories)
   - Swap events (for volume/buyer tracking)
   - Transfer events (for holder analysis)

2. **Liquidity lock contracts**:
   - Unicrypt, Team.Finance, PinkSale lock checks

3. **Contract analysis**:
   - Etherscan/BscScan verified status
   - Honeypot simulation (GoPlus or custom)
