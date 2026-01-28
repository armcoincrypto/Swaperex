# Wallet Scan Empty State Analysis

## Truth Table: Scenarios and Messages

| Key | Scenario | Condition | Message | CTA |
|-----|----------|-----------|---------|-----|
| `rate_limited` | Provider rate limited | `error.includes('rate')` | "Provider rate-limited. Try again in a moment." | None |
| `api_error` | Provider API error | `error.includes('API')` | "Provider API error. Please try again." | None |
| `error` | General error | `scanResult.error` | Error message from backend | None |
| `no_tokens_discovered` | No tokens found by provider | `tokensDiscovered === 0` | "No tokens found on {chain} for this wallet." | "Try a different chain" (Any Wallet) / "Switch wallet network..." (My Wallet) |
| `all_spam` | All tokens were spam | `spamFiltered === tokensDiscovered` | "All {n} tokens on {chain} were filtered as spam." | "Try a different chain" (Any Wallet only) |
| `below_threshold` | All tokens below $1 | `tokensFiltered === 0` | "No tokens above minimum value threshold ($1) on {chain}." | "Try a different chain" (Any Wallet only) |
| `all_in_watchlist_dust` | All tokens in watchlist + dust balance | `notInWatchlist.length === 0 && totalValue < 1` | "Found 1 token (SYMBOL), but it's a dust balance (<$0.01) and it's already in your Watchlist." | "Try a different chain" / "Switch wallet network..." |
| `all_in_watchlist` | All tokens already monitored | `notInWatchlist.length === 0 && totalValue >= 1` | "All {n} token(s) on {chain} are already in your watchlist." | None |
| `all_unpriced` | Tokens exist but no pricing | `priced.length === 0 && unpricedCount > 0` | "Found {n} token(s) but none have pricing data." | "Try a different chain" (Any Wallet only) |
| `search_no_match` | Search filter hiding all | `searchQuery && afterSearchFilter.length === 0` | "No tokens match "{query}"." | "Clear search" |
| `no_stablecoins` | Stablecoin filter hiding all | `stableOnly && afterStableFilter.length === 0` | "No stablecoins found in this wallet." | "Show all tokens" |
| `quick_filter_no_match` | Value filter hiding all | `quickFilter !== 'none' && afterQuickFilter.length === 0` | "No tokens meet the {filter} filter." | "Clear value filter" |
| `no_verified_logos` | Logo filter hiding all | `hideNoLogo && afterLogoFilter.length === 0` | "{n} token(s) found but hidden (no verified logos)." | "Show tokens without logos" |
| `low_value` | Wallet has < $1 total | `totalValue < 1` | "This wallet has no significant holdings on {chain}." | "Try a different chain" / "Switch wallet network..." |
| `hidden_by_filters` | Combination of filters | Multiple filters active | "{n} token(s) found but hidden by your filters." | "Reset filters" |
| `unknown` | Fallback | None of the above | "No tokens to display on {chain}." | "Try a different chain" (Any Wallet only) |

## Filter Application Order

1. **Backend filtering**: Spam detection, minimum value ($1)
2. **Watchlist filter**: Remove tokens already in user's watchlist
3. **Pricing filter**: Only show tokens with valid USD price
4. **Logo filter** (`hideNoLogo`): Only show tokens with verified logos
5. **Stablecoin filter** (`stableOnly`): Only show stablecoins
6. **Search filter** (`searchQuery`): Match symbol or name
7. **Quick filter** (`quickFilter`): Top 20, $1k+, or $10k+

## Debug Logging

When `localStorage.debug === 'true'`, the following info is logged on each scan completion:

```javascript
{
  chainId: number,
  chainName: string,
  walletMode: 'connected' | 'external',
  totalValue: number,
  stats: {
    tokensDiscovered: number,
    spamFiltered: number,
    tokensFiltered: number,
  },
  filterBreakdown: {
    fromBackend: number,      // Tokens returned by API
    inWatchlist: number,      // Removed (already monitored)
    notInWatchlist: number,   // Remaining after watchlist check
    unpriced: number,         // No USD value
    priced: number,           // Have USD value
    hiddenByLogo: number,     // Removed by hideNoLogo
    hiddenByStable: number,   // Removed by stableOnly
    hiddenBySearch: number,   // Removed by search
    hiddenByQuickFilter: number, // Removed by value filter
    finalDisplay: number,     // Final count shown
  },
  activeFilters: {
    hideNoLogo: boolean,
    stableOnly: boolean,
    searchQuery: string | null,
    quickFilter: 'none' | 'top20' | 'usd1k' | 'usd10k',
  },
}
```

## QA Checklist

### Test Case 1: Empty Wallet on BNB Chain
**Setup**: Connect wallet with no tokens on BNB Chain
**Expected**: "This wallet has no significant holdings on BNB Chain."
**CTA**: "Switch wallet network to scan another chain" (My Wallet) / "Try a different chain" (Any Wallet)

### Test Case 2: Same Wallet on ETH Chain
**Setup**: Same empty wallet, switch to Ethereum
**Expected**: "This wallet has no significant holdings on Ethereum."
**CTA**: Same as above

### Test Case 3: Wallet with Tokens but `hideNoLogo` Enabled
**Setup**: Wallet with tokens that lack verified logos, `hideNoLogo` ON
**Expected**: "{n} token(s) found but hidden (no verified logos)."
**CTA**: "Show tokens without logos"

### Test Case 4: Wallet with Tokens but `stableOnly` Enabled
**Setup**: Wallet with non-stablecoin tokens, `stableOnly` ON
**Expected**: "No stablecoins found in this wallet."
**CTA**: "Show all tokens"

### Test Case 5: Wallet with Only Spam Tokens
**Setup**: Wallet where all tokens are spam-filtered by backend
**Expected**: "All {n} tokens on {chain} were filtered as spam."
**CTA**: "Try a different chain" (Any Wallet only)

### Test Case 6: Wallet with All Tokens in Watchlist (Significant Balance)
**Setup**: Wallet where every token is already in user's watchlist AND total value >= $1
**Expected**: "All {n} token(s) on {chain} are already in your watchlist."
**CTA**: None (informational only)

### Test Case 6b: Wallet with Dust Balance Already in Watchlist
**Setup**: Wallet with tokens already in watchlist AND total value < $1 (dust)
**Expected**: "Found 1 token (USDT), but it's a dust balance (<$0.01) and it's already in your Watchlist."
**CTA**: "Try a different chain" (Any Wallet) / "Switch wallet network to scan another chain" (My Wallet)

### Test Case 7: Value Filter Active ($10k+) Hiding Tokens
**Setup**: Wallet with tokens < $10k, quick filter set to "$10k+"
**Expected**: "No tokens meet the $10,000+ filter."
**CTA**: "Clear value filter"

### Test Case 8: Search Query with No Matches
**Setup**: Search for "NONEXISTENT"
**Expected**: "No tokens match "NONEXISTENT"."
**CTA**: "Clear search"

## Verification Steps

1. Open DevTools Console
2. Run: `localStorage.setItem('debug', 'true')`
3. Perform a wallet scan
4. Check console for `[WalletScan] Empty state analysis` log
5. Verify the `filterBreakdown` numbers add up correctly
6. Verify the displayed message matches the expected scenario from truth table
