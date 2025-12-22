# Metrics That Matter (10 Only)

**Purpose**: No vanity metrics. Only metrics that indicate real product success.

---

## The 10 Metrics

| # | Metric | What It Measures | Why It Matters |
|---|--------|------------------|----------------|
| **1** | **Swap Success Rate** | `successful_swaps / attempted_swaps` | Trust. If swaps fail, users leave. Target: >95% |
| **2** | **Quote-to-Swap Conversion** | `swaps_executed / quotes_requested` | Trading intent. Shows if quotes lead to action. Target: >15% |
| **3** | **7-Day Retention** | `users_returning_day7 / users_day0` | Retention. Are users coming back? Target: >20% |
| **4** | **Swaps per User (Weekly)** | `total_swaps / active_users (7d)` | Engagement depth. Power users vs one-timers. Target: >3 |
| **5** | **Time to First Swap** | `median(first_swap_time - first_visit_time)` | Onboarding friction. How fast do we convert? Target: <5 min |
| **6** | **Telegram Alert → Swap Rate** | `swaps_from_telegram / alerts_sent` | Retention loop. Does Telegram drive action? Target: >5% |
| **7** | **Average Swap Value (USD)** | `total_swap_volume_usd / total_swaps` | User quality. Are we attracting real traders? Target: >$100 |
| **8** | **Error Rate by Type** | `errors_by_category / total_errors` | Trust diagnosis. What's breaking? Target: <2% total |
| **9** | **Quote Latency (p95)** | `95th_percentile(quote_response_time)` | UX quality. Slow = abandonment. Target: <2s |
| **10** | **Net Promoter Score (NPS)** | `(promoters - detractors) / respondents` | Trust sentiment. Would users recommend us? Target: >30 |

---

## Metric Definitions

### 1. Swap Success Rate
```
successful_swaps = transactions with receipt.status === 1
attempted_swaps = all transactions sent to chain
rate = successful / attempted * 100
```
**Alert threshold**: <90% triggers investigation

### 2. Quote-to-Swap Conversion
```
quotes_requested = unique quote fetches per session
swaps_executed = successful swap transactions
rate = swaps / quotes * 100
```
**Segment by**: Token pair, user type (new/returning)

### 3. 7-Day Retention
```
cohort = users who visited on day 0
retained = users from cohort who returned on day 7
rate = retained / cohort * 100
```
**Track weekly** to see trend

### 4. Swaps per User (Weekly)
```
active_users = unique wallets that swapped in 7 days
total_swaps = all swaps in 7 days
average = total_swaps / active_users
```
**Healthy distribution**: Some users at 1, power users at 10+

### 5. Time to First Swap
```
first_visit = timestamp of first page load (cookie/localStorage)
first_swap = timestamp of first successful swap
duration = first_swap - first_visit
metric = median(duration) across all converting users
```
**Exclude**: Users who never swap

### 6. Telegram Alert → Swap Rate
```
alerts_sent = total Telegram messages with [Swap Now] link
swaps_from_telegram = swaps with utm_source=telegram within 1 hour
rate = swaps / alerts * 100
```
**Key insight**: Which alert types convert best?

### 7. Average Swap Value (USD)
```
total_volume = sum of all swap input values in USD
total_swaps = count of successful swaps
average = total_volume / total_swaps
```
**Segment by**: Chain (ETH vs BSC), user cohort

### 8. Error Rate by Type
```
categories = [user_rejected, network_error, rpc_error, slippage_fail, unknown]
rate_per_category = errors[category] / total_actions
```
**Focus on**: Reducing non-user-rejected errors

### 9. Quote Latency (p95)
```
latencies = time from quote_request to quote_response
p95 = 95th percentile of latencies
```
**Track per provider**: 1inch, Uniswap, PancakeSwap

### 10. Net Promoter Score
```
survey = "How likely to recommend Swaperex? (0-10)"
promoters = respondents scoring 9-10
detractors = respondents scoring 0-6
nps = (promoters% - detractors%)
```
**Collect via**: In-app survey after 5th swap

---

## Excluded Vanity Metrics

| ❌ Metric | Why Excluded |
|-----------|--------------|
| Total page views | Doesn't indicate value |
| Registered users | Web3 has no registration |
| Social followers | Doesn't correlate with usage |
| Total volume (all-time) | Inflated by whales, wash trading |
| Daily active users | Too noisy, use 7-day instead |
| Bounce rate | Irrelevant for single-page app |
| Session duration | Trading should be fast, not long |
| Feature clicks | Doesn't measure outcome |
