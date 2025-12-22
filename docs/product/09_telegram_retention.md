# Telegram as Retention Engine

**Purpose**: Telegram is not marketing. Telegram is the daily return hook.

---

## Alert Types

### 1. Watched Token Activity

**When it fires:**
- Token in user's watchlist has >20% price move in 1 hour
- Token in user's portfolio has >10% price move in 1 hour
- Token user swapped recently crosses key price level

**Frequency:**
- Max 1 alert per token per 4 hours (prevent spam)
- Combine multiple tokens into single digest if >3 alerts pending

**Alert format:**
```
📈 PEPE +34% (1h)
$0.0000089 → $0.0000119
Vol: $12.4M | Your bag: $450

[View Chart] [Swap Now]
```

**Link back:**
- "View Chart" → Token detail page with chart
- "Swap Now" → Swap page with token prefilled

---

### 2. Liquidity Changes

**When it fires:**
- Watched token liquidity drops >25% (rug warning)
- Watched token liquidity increases >50% (confidence signal)
- New liquidity lock detected on watched token

**Frequency:**
- Immediately for drops (critical safety)
- Max 1 per day for increases

**Alert format:**
```
⚠️ PEPE Liquidity Alert
Liquidity dropped 32% in 2 hours
$4.2M → $2.8M

High rug risk. Consider exiting.

[Check Token] [Sell Now]
```

**Link back:**
- "Check Token" → Token detail page (liquidity section)
- "Sell Now" → Swap page with token as fromAsset

---

### 3. Price Acceleration

**When it fires:**
- Token volume 5x its 24h average in past hour
- Token unique buyers 3x average in past hour
- Token crosses ATH or significant resistance

**Frequency:**
- Max 2 per token per day
- Priority to tokens with balance

**Alert format:**
```
🔥 ETH Breaking Out
Volume 6.2x average | Buyers surging
$3,420 → Testing $3,500 resistance

[View Details] [Add to Position]
```

**Link back:**
- "View Details" → Token detail page
- "Add to Position" → Swap page with token as toAsset

---

## Alert Text Style

| ❌ Marketing Style | ✅ Trader Style |
|-------------------|-----------------|
| "Great news! Your token is up!" | "PEPE +34% (1h)" |
| "Don't miss this opportunity!" | "Vol 6x avg | Breaking resistance" |
| "Click here to learn more!" | "[Swap Now]" |
| "We think you'll love this!" | "Your bag: $450" |

**Rules:**
- Numbers first, context second
- No exclamation marks except warnings
- No emojis except functional (📈📉⚠️🔥)
- Every alert has direct action button

---

## Alert Frequency Limits

| Alert Type | Per Token | Per Day Total |
|------------|-----------|---------------|
| Price movement | 1 per 4h | 10 max |
| Liquidity drop | Immediate | Unlimited (safety) |
| Liquidity increase | 1 per day | 5 max |
| Volume spike | 2 per day | 10 max |
| Early Radar | 1 per token | 5 max |

**Digest mode:**
- If user has >5 pending alerts, send single digest
- Digest sent at user's preferred time (default: 9am local)

---

## What Links Back to Site

| Alert Action | Destination | Prefilled State |
|--------------|-------------|-----------------|
| [View Chart] | `/token/[address]` | Chart tab active |
| [Swap Now] | `/swap` | fromAsset = token |
| [Sell Now] | `/swap` | fromAsset = token, toAsset = USDT |
| [Add to Position] | `/swap` | toAsset = token |
| [Check Token] | `/token/[address]` | Safety tab active |
| [View Portfolio] | `/portfolio` | — |

**UTM tracking:**
- All links include `?utm_source=telegram&utm_alert=[type]`
- Enables measuring Telegram → Swap conversion

---

## User Preferences (Telegram Settings)

| Setting | Options | Default |
|---------|---------|---------|
| Alert frequency | Real-time / Digest / Off | Digest |
| Price threshold | 5% / 10% / 20% / 50% | 20% |
| Liquidity alerts | On / Off | On |
| Early Radar | On / Off | Off |
| Quiet hours | Time range | 11pm-7am |
