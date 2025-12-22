# Trust & Safety Layer

**Purpose**: Protect users AND protect Swaperex legally.

---

## Risk Labels

| Label | Color | Criteria | Display |
|-------|-------|----------|---------|
| **Verified** | Green | On curated list, verified contract, >$1M liquidity | ✓ Verified |
| **Caution** | Yellow | Verified contract but <$100K liquidity OR high holder concentration | ⚠ Caution |
| **Unverified** | Orange | Contract not verified on explorer | ⚠ Unverified Contract |
| **High Risk** | Red | Honeypot detected OR liquidity unlocked OR >15% tax | ⛔ High Risk |
| **User Added** | Gray | Added by user, not on curated list | 👤 User Added |

---

## Warning Messages by Risk Level

### Verified (Green)
- No warning shown
- Full swap functionality enabled

### Caution (Yellow)
```
⚠️ This token has lower liquidity ($45K).
Large trades may have high price impact.
```
- Swap enabled
- Price impact prominently displayed

### Unverified (Orange)
```
⚠️ This token's contract is not verified on [Etherscan/BscScan].
Unverified contracts may contain hidden functions. Trade with extreme caution.

□ I understand the risks and want to proceed
```
- Swap blocked until checkbox clicked
- Checkbox resets on page reload

### High Risk (Red)
```
⛔ HIGH RISK TOKEN DETECTED

This token shows one or more critical risk factors:
• Honeypot: Sell transactions may fail
• Unlocked liquidity: Developer can remove funds
• High tax: 23% fee on transactions

We strongly recommend NOT trading this token.

□ I understand this token is likely a scam and accept full responsibility
```
- Swap blocked until checkbox clicked
- Warning persists on every swap attempt
- Never remembered across sessions

### User Added (Gray)
```
This token was manually added. It has not been reviewed by Swaperex.
Trade at your own risk.
```
- Swap enabled with warning visible
- No checkbox required

---

## What the Platform GUARANTEES

| Guarantee | Description |
|-----------|-------------|
| **Non-custodial execution** | We never hold your funds. All swaps execute directly from your wallet to DEX contracts. |
| **Best available rate** | We compare 1inch, Uniswap, and PancakeSwap to find the best output for your trade. |
| **Slippage protection** | Your trade will revert if price moves beyond your set slippage tolerance. |
| **Transparent fees** | We show gas costs upfront. No hidden platform fees on swaps. |
| **Client-side signing** | Private keys never leave your device. We cannot sign transactions for you. |

---

## What the Platform DOES NOT Guarantee

| Non-Guarantee | Explanation |
|---------------|-------------|
| **Token legitimacy** | We do not verify that tokens are not scams. Use risk labels as guidance only. |
| **Trade success** | Transactions may fail due to network conditions, liquidity, or token contract behavior. |
| **Price accuracy** | Displayed prices are estimates. Actual execution price depends on market conditions. |
| **Token value** | We make no claims about future value of any asset. |
| **Liquidity availability** | Tokens may become untradeable if liquidity is removed. |
| **Contract safety** | We do not audit smart contracts. Interact at your own risk. |

---

## Legal Disclaimers (Footer)

**Swap page footer:**
```
Swaperex is a non-custodial interface. You are solely responsible for your transactions.
Trading crypto assets involves significant risk. Never trade more than you can afford to lose.
```

**Token detail page footer:**
```
Token data is provided for informational purposes only.
Risk labels are automated and may not reflect all risks.
Always do your own research (DYOR).
```

**High-risk token modal:**
```
By proceeding, you acknowledge:
• Swaperex is not responsible for losses from this trade
• You have researched this token independently
• You understand you may lose 100% of your funds
```

---

## Safety Feature Visibility

| Feature | Where Shown | Always Visible? |
|---------|-------------|-----------------|
| Risk label | Token selector, Token page, Review modal | ✅ Yes |
| Liquidity amount | Token page, Quote details | ✅ Yes |
| Holder distribution | Token page | ✅ Yes |
| Contract verification | Token page | ✅ Yes |
| Price impact warning | Quote details (if >1%) | ✅ Yes |
| Slippage tolerance | Settings, Review modal | ✅ Yes |
| Non-custodial badge | Swap page footer | ✅ Yes |
| Gas estimate | Quote details, Review modal | ✅ Yes |
