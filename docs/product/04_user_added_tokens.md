# User-Added Token Flow

**Purpose**: Let users discover tokens while protecting them from scams.

---

## Flow Overview

```
User pastes contract → Chain detected → Validation pipeline → Accept/Reject → Appears in "Watched" feed
```

---

## Validation Steps (Sequential)

### Step 1: Format Validation
- Is it a valid address format? (0x... 40 hex chars)
- **Reject reason**: "Invalid contract address format"

### Step 2: Chain Detection
- Check if contract exists on Ethereum
- Check if contract exists on BSC
- If both: ask user to select chain
- If neither: reject
- **Reject reason**: "Contract not found on Ethereum or BSC"

### Step 3: Contract Type Check
- Is it an ERC-20/BEP-20 token contract?
- Has `name()`, `symbol()`, `decimals()`, `totalSupply()`?
- **Reject reason**: "This address is not a token contract"

### Step 4: Duplicate Check
- Is this token already in curated list?
- Is this token already in user's watched list?
- **Reject reason**: "Token already exists in your list" (with link)

### Step 5: Liquidity Check
- Query DEX aggregators for any trading pair
- Minimum threshold: $1,000 liquidity
- **Reject reason**: "No trading liquidity found. This token cannot be swapped."

### Step 6: Honeypot Simulation
- Simulate a buy transaction
- Simulate a sell transaction
- Check if sell succeeds and tax is <50%
- **Reject reason**: "Warning: This token may not be sellable (honeypot detected)"
- **Soft warning** (not rejection): "High tax detected: X% buy, Y% sell"

### Step 7: Basic Sanity Checks
- Total supply > 0
- At least 1 holder
- Contract not self-destructed
- **Reject reason**: "Token contract is invalid or destroyed"

---

## Rejection Reasons (User-Friendly Messages)

| Code | Message | Explanation |
|------|---------|-------------|
| INVALID_FORMAT | "Invalid address" | Not a valid hex address |
| NOT_FOUND | "Contract not found" | Doesn't exist on ETH or BSC |
| NOT_TOKEN | "Not a token" | Contract lacks ERC-20 interface |
| NO_LIQUIDITY | "No liquidity" | Can't be traded anywhere |
| HONEYPOT | "Likely honeypot" | Sell simulation failed |
| HIGH_TAX | "Extreme tax (>50%)" | Unusable for trading |
| DUPLICATE | "Already tracked" | Already in list |

---

## Abuse Prevention

### Rate Limiting
- Max 10 token additions per wallet per day
- Max 3 failed attempts per hour (prevents honeypot probing)

### Wallet Requirement
- Must connect wallet to add tokens
- Prevents bot spam of the validation endpoint

### Cost Signal
- Consider: require small gas fee to add token (anti-spam)
- Alternative: require wallet to hold >$10 in native token

### Reputation Decay
- User-added tokens that get no trades in 7 days: auto-archive
- Tokens flagged by 3+ users: review and potential removal

### No Global Feed Pollution
- User-added tokens only appear in THAT user's "Watched" list
- Only promoted to public feed if:
  - Liquidity > $50K
  - 24h volume > $10K
  - >100 unique traders

---

## User Experience After Addition

**Success state:**
- Token appears in "New & Watched" section
- Shows validation badges: "Liquidity ✓" "Sellable ✓" or warnings
- User can swap immediately

**Partial success (warnings):**
- Token added but with visible warnings
- "⚠️ High tax: 10% buy/sell"
- "⚠️ Low liquidity: $5K"
- User decides to proceed or not
