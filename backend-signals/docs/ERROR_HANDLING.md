# Signal Backend Error Handling Documentation

## Priority 9.0.3 - Error Injection Tests

This document describes expected behavior for edge cases and error conditions.
Use this as a reference for manual testing and future automated tests.

---

## 1. Invalid Token Address

### Test Case
```bash
curl "http://localhost:4001/api/v1/signals?chainId=1&token=invalid"
```

### Expected Behavior
- **Response**: `200 OK` with empty signals
- **Liquidity**: `null` (no signal)
- **Risk**: `null` (no signal)
- **Debug reason**: "No liquidity data available" / "No security data available from GoPlus"
- **NO CRASH**: Backend continues running

### Why
Invalid tokens simply return no data from external APIs. The system treats this
as "no signal condition met" rather than an error.

---

## 2. Invalid Chain ID

### Test Case
```bash
curl "http://localhost:4001/api/v1/signals?chainId=999999&token=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
```

### Expected Behavior
- **Response**: `200 OK` with empty signals
- **Liquidity**: `null` (DexScreener returns no pairs for invalid chain)
- **Risk**: `null` (GoPlus returns no data for invalid chain)
- **Debug reason**: "No liquidity data available" / "No security data available"
- **NO CRASH**: Backend continues running

---

## 3. Missing Required Parameters

### Test Cases
```bash
# Missing token
curl "http://localhost:4001/api/v1/signals?chainId=1"

# Missing chainId
curl "http://localhost:4001/api/v1/signals?token=0x..."

# Both missing
curl "http://localhost:4001/api/v1/signals"
```

### Expected Behavior
- **Response**: `400 Bad Request`
- **Body**: `{ "error": "Missing params: chainId, token" }`
- **NO CRASH**: Backend continues running

---

## 4. Network Timeout (External API Slow)

### Simulation
External APIs (DexScreener, GoPlus) taking >10 seconds to respond.

### Expected Behavior
- **Response**: `200 OK` with empty signals
- **Debug reason**: "API error: The operation was aborted" or similar
- **Timeout**: Internal fetch has 10s timeout
- **NO CRASH**: Backend continues running
- **NO HANG**: Request completes within timeout

---

## 5. External API Returns Empty/Null

### Test Case
Query a token with no liquidity pool or security data.

```bash
# Random address with no pools
curl "http://localhost:4001/api/v1/signals?chainId=1&token=0x0000000000000000000000000000000000000001&debug=1"
```

### Expected Behavior
- **Response**: `200 OK`
- **Liquidity**: `null`
- **Risk**: `null`
- **Debug.liquidity.check.reason**: "No liquidity data available"
- **Debug.risk.check.reason**: "No security data available from GoPlus"

---

## 6. External API Returns Error (5xx)

### Simulation
When DexScreener or GoPlus is down.

### Expected Behavior
- **Response**: `200 OK` with empty signals
- **Debug reason**: "API error: [error message]"
- **Health endpoint**: Shows service as "down"
- **NO CRASH**: Backend continues running

---

## 7. Malformed JSON from External API

### Simulation
External API returns invalid JSON.

### Expected Behavior
- **Response**: `200 OK` with empty signals
- **Debug reason**: "API error: [parsing error]"
- **NO CRASH**: Backend gracefully handles malformed responses

---

## 8. Rapid Repeated Requests (Same Token)

### Test Case
```bash
# Rapid fire same request
for i in {1..10}; do
  curl "http://localhost:4001/api/v1/signals?chainId=1&token=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48&debug=1" &
done
```

### Expected Behavior
- **First request**: May return signal (if conditions met)
- **Subsequent requests (same state)**: Signal suppressed (deduplication)
- **Debug reason**: "Signal suppressed (duplicate state detected)"
- **Cache**: Reduces load on external APIs

---

## 9. Rate Limiting

### Test Case
More than 100 requests per minute from same IP.

### Expected Behavior
- **Response**: `429 Too Many Requests`
- **Body**: Rate limit error message
- **Recovery**: Automatic after time window

---

## 10. Concurrent Requests for Different Tokens

### Test Case
```bash
# Multiple tokens at once
curl "http://localhost:4001/api/v1/signals?chainId=1&token=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" &
curl "http://localhost:4001/api/v1/signals?chainId=1&token=0xdac17f958d2ee523a2206206994597c13d831ec7" &
curl "http://localhost:4001/api/v1/signals?chainId=56&token=0x55d398326f99059ff775485246999027b3197955" &
```

### Expected Behavior
- All requests complete independently
- No cross-contamination of data
- Each token evaluated separately

---

## 11. Backend Restart Recovery

### Test Case
1. Generate signals (token with risk factors)
2. Restart backend
3. Request same token

### Expected Behavior
- **Cooldowns**: Reset (in-memory, not persistent)
- **Dedup hashes**: Reset (in-memory, not persistent)
- **Signal**: May fire again (fresh state)

Note: This is intentional - cooldowns are per-session, not persistent.

---

## 12. Frontend: Backend Offline

### Simulation
Stop the backend, check frontend behavior.

### Expected Behavior
- **Signals badge**: Shows "Signals temporarily unavailable"
- **System status**: Shows "● Backend unavailable" (red)
- **Debug panel**: Shows error state
- **Signal history**: Preserved (localStorage)
- **App function**: Core swap functionality unaffected

---

## 13. Frontend: localStorage Corrupted

### Simulation
```javascript
localStorage.setItem('swaperex-signal-history', 'invalid json {{{');
```

### Expected Behavior
- **On load**: Zustand persist middleware handles gracefully
- **History**: Resets to empty state
- **No crash**: App continues working
- **Console**: May log warning about parse error

---

## 14. Frontend: Debug Mode Without Backend

### Test Case
Enable debug mode (?debug=1) when backend is offline.

### Expected Behavior
- **Debug panel**: Shows loading/error state
- **Error message**: Clear, non-technical message
- **Toggle**: Still works
- **No crash**: UI remains functional

---

## Summary: Graceful Degradation Principles

1. **Never crash** - All errors are caught and handled
2. **Always respond** - Even errors return valid JSON
3. **Clear reasons** - Debug mode shows exactly what happened
4. **Fallback data** - Empty signals, not errors
5. **Independent services** - One API down doesn't break others
6. **User trust** - Status indicators show real system state

---

## Manual Testing Checklist

- [ ] Invalid token returns empty signals (no crash)
- [ ] Invalid chain returns empty signals (no crash)
- [ ] Missing params returns 400 error
- [ ] Health endpoint returns status
- [ ] Rich health shows service status
- [ ] Dedup prevents duplicate signals
- [ ] Cooldown prevents spam
- [ ] Frontend shows offline badge when backend down
- [ ] System status indicator updates
- [ ] Signal history survives page reload
- [ ] Debug mode shows all check details
