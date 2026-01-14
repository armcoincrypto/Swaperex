# Token Detail Page Structure

**Purpose**: Answer in under 5 seconds: Is this tradable? Is liquidity real? Is activity organic?

---

## Section 1: Token Identity Header

**What it shows:**
- Token name, symbol, contract address (truncated + copy button)
- Chain badge (Ethereum / BSC)
- Verified status (if on curated list) or "Unverified" warning

**What it tells the trader:**
- "Am I looking at the real token or a scam clone?"
- Contract address lets power users verify on Etherscan/BscScan

---

## Section 2: Price & Change Summary

**What it shows:**
- Current price in USD
- 24h change (%)
- 7d change (%)
- All-time high (if available)

**What it tells the trader:**
- "Is this pumping, dumping, or stable?"
- Quick momentum read without charts

---

## Section 3: Liquidity Health

**What it shows:**
- Total liquidity (USD) across all DEX pools
- Largest pool (e.g., "Uniswap V3: $2.4M")
- Liquidity depth indicator: "Thin" / "Moderate" / "Deep"
- Liquidity lock status (if detectable): "Locked until X" or "Unknown"

**What it tells the trader:**
- "Can I actually execute a trade without massive slippage?"
- "Will the dev rug by pulling liquidity?"

**Why this matters:**
- $50K liquidity = you can't sell $10K without destroying price
- Locked liquidity = lower rug risk

---

## Section 4: Trading Activity

**What it shows:**
- 24h volume (USD)
- Volume/Liquidity ratio (healthy: 0.1–1.0x)
- Number of trades (24h)
- Buy vs Sell ratio (%)

**What it tells the trader:**
- "Is anyone actually trading this?"
- "Is it all wash trading or organic?"

**Red flags surfaced:**
- Volume > 5x liquidity = likely wash trading
- 95% buys, 5% sells = coordinated pump
- <10 trades/day on "hot" token = fake hype

---

## Section 5: Holder Distribution

**What it shows:**
- Total holders count
- Top 10 holders % of supply
- Creator wallet % (if identifiable)
- "Whale concentration" label: Low / Medium / High

**What it tells the trader:**
- "Will one wallet dump and destroy price?"
- "Is this widely distributed or dev-controlled?"

**Red flags surfaced:**
- Top 10 hold >50% = high dump risk
- Creator holds >20% = extreme caution

---

## Section 6: Contract Safety

**What it shows:**
- Contract verified on explorer: Yes/No
- Honeypot check result: "Sellable" / "Warning: Sell may fail"
- Tax on buy/sell (if detected): e.g., "5% buy, 5% sell"
- Proxy contract: Yes/No (upgradeable = risky)

**What it tells the trader:**
- "Can I actually sell this after buying?"
- "Will hidden taxes eat my profits?"

**Why this matters:**
- Honeypots are the #1 retail scam
- High taxes (>10%) often indicate scam

---

## Section 7: Action Bar (Sticky)

**What it shows:**
- "Swap [TOKEN]" button → prefills swap page
- "Add to Watchlist" button
- "Share" button (copy link)

**What it tells the trader:**
- "I've seen enough, let me trade"
- Every page ends in action

---

## Information Hierarchy (5-second scan)

| Priority | Section | Key Question Answered |
|----------|---------|----------------------|
| 1 | Identity | Is this the real token? |
| 2 | Liquidity | Can I trade size? |
| 3 | Contract Safety | Can I sell? |
| 4 | Activity | Is trading organic? |
| 5 | Price | What's the trend? |
| 6 | Holders | Who controls supply? |
