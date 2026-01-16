# QA Checklist: Wallet Scan V2

Manual testing steps for Swaperex Radar Wallet Scan V2 feature.

## Pre-requisites

- [ ] Backend signals service running (`pm2 status`)
- [ ] Frontend deployed and accessible
- [ ] Wallet with tokens on BSC (or other supported chain)

## V2 New Features

- Enhanced API response with stats (providerTokens, afterSpamFilter, belowMinValue, finalTokens)
- Spam token filtering (empty symbols, airdrop/claim patterns)
- Clear empty state explanations
- Local filters (min USD value, sorting)
- Premium UI with badges (chain, provider, cached)
- Debug mode for stats inspection

---

## Test Cases

### 1. Disconnected State

1. Open Radar without connecting wallet
2. **Verify**: "Connect wallet to scan" message with wallet icon
3. **Verify**: Chain badge shows in header (default BSC)

### 2. Idle State (Connected)

1. Connect wallet on BSC
2. **Verify**: "Scan My Wallet" button visible with gradient style
3. **Verify**: Slot count shown: "(X slots available)"
4. **Verify**: Connected wallet address shown at bottom
5. **Verify**: Trust messaging: "Read-only scan — no approvals..."

### 3. Scanning State

1. Click "Scan My Wallet"
2. **Verify**: No wallet signature popup (read-only!)
3. **Verify**: Loading spinner shown
4. **Verify**: "Fetching token balances..." message
5. **Verify**: 5 skeleton rows animate during loading

### 4. Results State - Token List

After scan completes with tokens found:

1. **Verify**: Summary bar shows counts:
   - "Found X tokens"
   - "Y new" (if different from total)
   - "Z watched" (if any already in watchlist)
   - "N below min" (if any filtered)

2. **Verify**: Token cards show:
   - [ ] Checkbox (left)
   - [ ] Token logo (or 2-letter fallback)
   - [ ] Symbol + name
   - [ ] NATIVE badge (for native tokens)
   - [ ] ✓ badge (for verified tokens)
   - [ ] Balance amount
   - [ ] USD value (or "—" if unavailable)
   - [ ] Price per token (small text)

3. **Verify**: Tokens sorted by USD value (highest first) by default

### 5. Local Filters

1. Click filter buttons: All, ≥$0.5, ≥$2, ≥$10
2. **Verify**: Token list updates based on filter
3. **Verify**: Active filter button is highlighted
4. Change sort dropdown: "By value", "A-Z", "By balance"
5. **Verify**: List re-sorts accordingly

### 6. Selection Controls

1. Click "All new" → **Verify**: All displayed tokens selected (up to slot limit)
2. Click "Top 5" → **Verify**: First 5 tokens selected
3. Click "Clear" → **Verify**: All checkboxes unchecked
4. Click individual token → **Verify**: Toggle works
5. **Verify**: Counter updates: "X of Y selected"

### 7. Watchlist Capacity

1. With nearly full watchlist (e.g., 18/20):
   - **Verify**: "(2 slots available)" shown on button
   - **Verify**: Only 2 tokens can be selected
   - **Verify**: Excess tokens show disabled checkbox

2. With full watchlist (20/20):
   - **Verify**: "Watchlist full (20/20)" button disabled

3. **Verify**: Capacity warning appears when limit reached

### 8. Add to Watchlist

1. Select some tokens
2. Click "Add X to Watchlist"
3. **Verify**: Success toast: "✓ Added X token(s) to Watchlist"
4. **Verify**: Returns to idle state
5. Scan again
6. **Verify**: Previously added tokens NOT shown (filtered as "watched")

### 9. Empty State Explanations

Test each empty state scenario:

#### Case 1: Provider returned nothing
- Use empty wallet
- **Verify**: "Provider returned no tokens"
- **Verify**: "Try Again" button shown

#### Case 2: All spam filtered
- (Requires wallet with only spam tokens)
- **Verify**: "All tokens were filtered"
- **Verify**: Shows count of filtered tokens

#### Case 3: All below min value
- Wallet with only low-value tokens
- **Verify**: "All tokens below $2 minimum"

#### Case 4: All already watched
- Add all tokens to watchlist first
- Scan again
- **Verify**: "All tokens already in watchlist"
- **Verify**: Shows count of watched tokens
- **Verify**: "Done" button shown

#### Case 5: Hidden by local filter
- Scan wallet with tokens
- Set filter to ≥$10 (higher than token values)
- **Verify**: "Tokens hidden by filters"
- **Verify**: "Show all values" button works

### 10. Error State

1. Disconnect internet / block API
2. Click scan
3. **Verify**: Error icon + "Scan failed" message
4. **Verify**: "Try Again" and "Cancel" buttons shown
5. Reconnect and retry
6. **Verify**: Scan succeeds

### 11. Debug Mode

1. Add `?debug=true` to URL or pass `debug={true}` prop
2. Scan wallet
3. **Verify**: Provider badge shows (ankr/fallback)
4. **Verify**: "Cached" badge shows on cached results
5. **Verify**: "Debug stats" expandable shows:
   - stats object (providerTokens, afterSpamFilter, etc.)
   - warnings array
   - processedTokens counts

### 12. Chain Support

Test on each supported chain:
- [ ] Ethereum (1)
- [ ] BNB Chain (56)
- [ ] Polygon (137)
- [ ] Arbitrum (42161)
- [ ] Optimism (10)
- [ ] Avalanche (43114)

**Verify**: Chain badge color matches chain

---

## API Tests

```bash
# Test wallet-tokens endpoint V2 response
curl "http://207.180.212.142:4001/api/v1/wallet-tokens?chainId=56&wallet=0xYOUR_WALLET" | jq

# Expected V2 response structure:
# {
#   "chainId": 56,
#   "wallet": "0x...",
#   "provider": "ankr",
#   "fetchedAt": 1234567890,
#   "minValueUsd": 2,
#   "tokens": [...],
#   "stats": {
#     "providerTokens": 37,
#     "afterChainFilter": 37,
#     "afterSpamFilter": 30,
#     "belowMinValue": 12,
#     "finalTokens": 18
#   },
#   "warnings": ["ANKR_KEY_MISSING"],
#   "cached": false
# }
```

---

## Backend Logging

Check PM2 logs for proper logging:

```bash
pm2 logs backend-signals --lines 20
```

**Verify** log format:
```
[WalletScan] COMPLETE chain=56 wallet=0x509c...0196 provider=ankr raw=37 spam=7 belowMin=12 final=18 time=1234ms
```

---

## Configuration

Environment variables (optional):
- `WALLET_SCAN_MIN_VALUE_USD` - Default: 2
- `WALLET_SCAN_MAX_TOKENS` - Default: 50
- `WALLET_SCAN_CACHE_TTL_SEC` - Default: 120
- `ANKR_API_KEY` - Optional, improves rate limits

---

## Known Limitations

- Minimum value filter: Default $2 USD (configurable)
- Maximum tokens: 50 per scan
- Cache: 120 seconds TTL
- Spam filter: May occasionally filter legitimate tokens
- Fallback provider: Only returns native token balance

---

## Pass Criteria

- [ ] Disconnected state shows correctly
- [ ] Scan triggers no wallet signature
- [ ] Skeleton loading animation works
- [ ] Results show correct counts (found/new/watched/belowMin)
- [ ] All 5 empty state cases show correct explanations
- [ ] Local filters (min USD, sort) work
- [ ] Selection presets (All new, Top 5, Clear) work
- [ ] Add selected respects watchlist capacity
- [ ] Debug mode shows provider + raw stats
- [ ] Works on BSC + ETH at minimum
- [ ] No console errors
- [ ] Trust messaging visible throughout

---

## V2 Specific Checks

- [ ] Stats object in API response
- [ ] Spam tokens filtered (check logs for spam count)
- [ ] "NATIVE" badge on native tokens
- [ ] "✓" badge on verified tokens
- [ ] Chain badge with correct color
- [ ] Provider badge in debug mode
- [ ] Cached badge when result from cache
