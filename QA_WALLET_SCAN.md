# QA Checklist: Wallet Scan MVP

Manual testing steps for Swaperex Radar Wallet Scan feature.

## Pre-requisites

- [ ] Backend signals service running (`pm2 status`)
- [ ] Frontend deployed and accessible
- [ ] Wallet with tokens on BSC (or other supported chain)

## Test Cases

### 1. Basic Scan Flow

1. Open Radar in Incognito/Private browser window
2. **Verify**: "Connect wallet to scan" message shown
3. Connect wallet on BSC (or supported chain)
4. **Verify**: "Scan My Wallet" button visible with slot count
5. Click "Scan My Wallet"
6. **Verify**: No wallet signature popup appears (read-only!)
7. **Verify**: Loading spinner shows "Scanning wallet..."
8. **Verify**: Token list loads within 5-10 seconds

### 2. Token List Display

1. After scan completes, verify token list shows:
   - [ ] Token logo (or 2-letter fallback)
   - [ ] Token symbol and name
   - [ ] Balance amount
   - [ ] USD value (or "Price unavailable")
2. **Verify**: Tokens sorted by USD value (highest first)
3. **Verify**: Top 10 (or available slots) auto-selected

### 3. Selection Controls

1. Click "Clear" → **Verify**: All checkboxes unchecked
2. Click "Top 10" → **Verify**: First 10 tokens selected
3. Click "All" → **Verify**: All tokens selected (up to slot limit)
4. Click individual token → **Verify**: Toggle selection works
5. **Verify**: Cannot select more than available watchlist slots

### 4. Add to Watchlist

1. Select some tokens (e.g., Top 10)
2. Click "Add X to Watchlist"
3. **Verify**: Success toast shows "Added X tokens to Watchlist"
4. **Verify**: Watchlist count increases by X
5. **Verify**: Scan panel returns to idle state

### 5. Slot Limit Warning

1. Add tokens until watchlist is nearly full (e.g., 18/20)
2. Scan wallet again
3. **Verify**: "(2 slots available)" shown on button
4. **Verify**: Selection limited to available slots
5. Fill watchlist to 20/20
6. **Verify**: "Watchlist full (20/20)" button disabled

### 6. Already Tracked Filtering

1. Add some tokens to watchlist
2. Scan wallet again
3. **Verify**: Previously added tokens NOT shown in scan results
4. **Verify**: "No new tokens found" if all tokens already tracked

### 7. Disconnect State

1. Disconnect wallet
2. **Verify**: "Connect wallet to scan" message shown
3. **Verify**: Cannot trigger scan without wallet

### 8. Error Handling

1. Disconnect internet / block API calls
2. Click scan
3. **Verify**: Error message shown with "Try Again" button
4. Reconnect internet
5. Click "Try Again"
6. **Verify**: Scan succeeds

### 9. Chain Support

Test on each supported chain:
- [ ] Ethereum (1)
- [ ] BNB Chain (56)
- [ ] Polygon (137)
- [ ] Arbitrum (42161)
- [ ] Optimism (10)
- [ ] Avalanche (43114)

### 10. Trust Messaging

1. **Verify**: "Read-only scan. No approvals. No transactions." text visible
2. **Verify**: "Radar is informational only, not financial advice." disclaimer
3. **Verify**: No wallet signature popups during entire flow

## API Tests (Optional)

```bash
# Test wallet-tokens endpoint
curl "http://207.180.212.142:4001/api/v1/wallet-tokens?chainId=56&wallet=0xYOUR_WALLET"

# Expected response structure:
# {
#   "tokens": [
#     {
#       "address": "0x...",
#       "symbol": "TOKEN",
#       "name": "Token Name",
#       "decimals": 18,
#       "balance": "1000000000000000000",
#       "balanceFormatted": "1.00",
#       "priceUsd": 1.50,
#       "valueUsd": 1.50,
#       "logo": "https://...",
#       "source": "ankr"
#     }
#   ],
#   "totalTokens": 5,
#   "totalValueUsd": 150.00,
#   "wallet": "0x...",
#   "chainId": 56,
#   "timestamp": 1234567890
# }
```

## Known Limitations

- Minimum value filter: Tokens < $2 USD are excluded
- Maximum tokens: Limited to 100 tokens per scan
- Cache: Results cached for 60 seconds
- Supported chains: ETH, BSC, Polygon, Arbitrum, Optimism, Avalanche only

## Pass Criteria

- [ ] All test cases pass
- [ ] No wallet signature requests during scan
- [ ] Watchlist integration works correctly
- [ ] Error states handled gracefully
- [ ] Trust messaging visible throughout
