# Swaperex Runtime Health Runbook

**Production:** https://dex.kobbex.com

---

## Health endpoints

### GET `/api/health`

Primary backend health (signals engine + external services).

```bash
curl -sS https://dex.kobbex.com/api/health | jq .
```

Expected shape:

```json
{
  "status": "ok",
  "signalsEngine": "running",
  "version": "1.0.0",
  "uptime": <seconds>,
  "timestamp": <ms>,
  "services": {
    "dexscreener": "up",
    "goplus": "up"
  }
}
```

### GET `/api/v1/health`

Legacy/alternate health path — must also return JSON with HTTP 200 (verified by `verify-live.sh`).

---

## Field reference

| Field | Values | Meaning |
|-------|--------|---------|
| `status` | `ok`, `partial`, `error` | Overall backend health |
| `signalsEngine` | `running`, `degraded`, `unavailable`, `disabled` | Radar/signals pipeline |
| `services.dexscreener` | `up`, `down` | DexScreener API reachability |
| `services.goplus` | `up`, `down` | GoPlus token security API reachability |

---

## Frontend status indicator

Footer / system status maps backend health to user-facing labels:

| Backend | UI label (footer) |
|---------|-------------------|
| Stable | **Operational** |
| Degraded | **Degraded — partial data** |
| Unavailable | **Unavailable** |

Auto-refresh: every 60 seconds via `systemStatusStore`.

---

## External dependencies

### DexScreener

- Used by: Security radar, screener expanded rows (advanced mode)
- Degraded behavior: Threat feed may show stale/empty data; status badge shows degraded
- Frontend does **not** invent prices or security scores when down

### GoPlus

- Used by: Token safety panel, screener expand, swap intelligence
- Degraded behavior: "Token safety unavailable" — user must verify contracts manually
- No fabricated safety scores

### CoinGecko

- Used by: Markets screener, market discovery sections
- Degraded behavior: Cached data warning, honest empty states, retry CTA
- Rate limit: UI shows "Rate limited" / cached badge — does not fake live prices

---

## signalsEngine

Powers:

- Security Command Center (radar)
- Watchlist monitoring
- Alert pipeline

When `signalsEngine` is not `running`:

- Security tabs may show empty or stale signals
- Unread badge may not update
- Swap/send/portfolio **continue to work** (client-side wallet execution)

---

## Frontend graceful degradation expectations

| Feature | Backend down | Expected UX |
|---------|--------------|-------------|
| Swap | Quote APIs may fail | Clear quote error, refresh CTA — no fake quotes |
| Send | RPC only | Works if wallet + RPC OK |
| Portfolio | Price RPC partial | Per-chain degraded banner, stale data labels |
| Security | signalsEngine down | Empty/honest states, no fake alerts |
| Markets | CoinGecko down | Cached/empty with retry |
| Token safety | GoPlus down | Unavailable message, swap not blocked by fake "safe" |

**Invariant:** Never hide errors. Never invent success, liquidity, PnL, or security scores.

---

## Monitoring commands

```bash
# Full live check
bash /root/Swaperex/scripts/audit/verify-live.sh

# One-shot certification
bash /root/Swaperex/scripts/audit/post-deploy-certification.sh

# Health only
curl -sS https://dex.kobbex.com/api/health | jq '{status, signalsEngine, services}'

# Deploy parity
bash /root/Swaperex/scripts/audit/deploy-match.sh
```

---

## nginx / static layer

Frontend is static SPA at `/var/www/swaperex`. Health APIs are proxied separately (not served as `index.html`).

If health endpoints return HTML with HTTP 200, nginx routing is misconfigured — see RECOVERY_RUNBOOK.md.

---

## version.txt

```bash
curl -sS https://dex.kobbex.com/version.txt
```

Use to confirm which commit is live without inferring from bundle hash alone.
