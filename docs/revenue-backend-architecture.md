# Revenue & swap analytics — backend architecture (draft)

**Status:** hybrid — the repo ships a **FastAPI** ledger (`src/swaperex/api/`) with an append-only monitoring ingest path; richer NestJS-style analytics below remains a longer-term option.  
**Implemented ingest:** `POST /api/v1/monitoring/events` (see `src/swaperex/api/routes/monitoring.py`, table `monitoring_ingest_batches`).  
**Optional auth:** set env `MONITORING_INGEST_SECRET` and send header `X-Swaperex-Monitoring-Key` with the same value.  
**Stack target (future):** Node.js **NestJS** + **PostgreSQL** for rollups and admin dashboards.

## Goals

- Persist confirmed swaps (metadata + amounts).
- Store **fee token + fee amount (wei)** and **USD normalization** for reporting.
- Support **per-chain** and **per-calendar-day (UTC)** aggregates.
- Accept future ingestion from the browser batch envelope (`getMonitoringBatchEnvelope()` in the frontend) or from a dedicated `POST /swaps/confirm` after on-chain confirmation.

## High-level components

1. **API gateway (NestJS)**  
   - `POST /v1/ingest/monitoring` — optional; accepts JSON batch `{ schemaVersion, clientSessionId, exportedAt, events[] }` for `swap_success`, failures, etc.  
   - `POST /v1/swaps` — primary path when you want server-authoritative rows (signed payload or API key later).  
   - `GET /v1/revenue/summary` — dashboard: totals, by chain, by day (authenticated).

2. **Ingestion worker (optional)**  
   - Normalizes symbols → CoinGecko IDs (or your price oracle), fetches spot or historical USD at event time, stores `fee_usd` / `volume_usd`.

3. **PostgreSQL**  
   - OLTP tables for raw events + materialized views or nightly rollups for analytics.

## Entity relationship (conceptual)

- **swap_event** — one row per completed (or failed) swap you care about.  
- **fee_leg** — optional separate table if multi-token fees appear later; v1 can embed fee on `swap_event`.  
- **price_snapshot** — cached `(symbol, chain_id, ts, usd_price)` to avoid re-fetching.

## Recommended schema (PostgreSQL)

```sql
-- Logical chain registry (optional; can be enum in app)
CREATE TABLE chain (
  id          SMALLINT PRIMARY KEY,  -- 1, 56, 137, ...
  name        TEXT NOT NULL,
  native_symbol TEXT NOT NULL
);

-- Raw swap / revenue row (one per confirmed swap you track)
CREATE TABLE swap_event (
  id                BIGSERIAL PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Client / correlation (no PII requirement; hash wallet if policy demands)
  client_session_id TEXT,
  source            TEXT NOT NULL DEFAULT 'frontend', -- 'frontend' | 'reconcile' | ...

  chain_id          INTEGER NOT NULL,
  tx_hash           TEXT NOT NULL,
  tx_status         SMALLINT NOT NULL DEFAULT 1,      -- 1 success, 0 fail

  provider          TEXT NOT NULL,                    -- e.g. uniswap-v3-wrapper-v2
  route_mode        TEXT,

  token_in_symbol   TEXT,
  token_out_symbol  TEXT,
  amount_in_human   NUMERIC(78, 36),
  amount_out_human  NUMERIC(78, 36),

  fee_token_symbol  TEXT,
  fee_amount_wei    NUMERIC(78, 0),                   -- integer string-compatible
  fee_decimals      SMALLINT,

  -- Denormalized USD at ingest time (oracle / CoinGecko)
  fee_usd           NUMERIC(24, 8),
  volume_out_usd    NUMERIC(24, 8),

  -- Raw monitoring payload for forensics
  raw_json          JSONB,

  UNIQUE (chain_id, tx_hash)
);

CREATE INDEX idx_swap_event_chain_created ON swap_event (chain_id, created_at DESC);
CREATE INDEX idx_swap_event_day ON swap_event ((created_at AT TIME ZONE 'UTC')::date);

-- Fast dashboards: refresh nightly or on insert (trigger)
CREATE MATERIALIZED VIEW revenue_daily AS
SELECT
  (created_at AT TIME ZONE 'UTC')::date AS day_utc,
  chain_id,
  COUNT(*) AS swap_count,
  COALESCE(SUM(fee_usd), 0) AS total_fee_usd,
  COALESCE(SUM(volume_out_usd), 0) AS total_volume_out_usd
FROM swap_event
WHERE tx_status = 1
GROUP BY 1, 2;

CREATE UNIQUE INDEX ON revenue_daily (day_utc, chain_id);
```

## NestJS module layout (suggested)

```
src/
  revenue/
    revenue.module.ts
    revenue.controller.ts      # GET summary (admin)
    revenue.service.ts         # aggregates, refresh MV
  ingestion/
    ingestion.module.ts
    ingestion.controller.ts    # POST batches / single swap
    ingestion.service.ts       # validate, insert swap_event, price lookup
  pricing/
    pricing.service.ts         # CoinGecko / oracle with cache + rate limits
```

## USD normalization

- On insert: resolve `fee_token_symbol` + `chain_id` → price feed key → `fee_usd = (fee_amount / 10^d) * price_usd`.  
- Store **both** raw wei and USD snapshot to survive oracle revisions (optional: store `price_usd` used on row).

## Security & compliance

- Start with **no wallet address** in DB if not required; frontend monitoring already avoids PII.  
- If you add addresses, store **HMAC(server_secret, address)** for clustering without plain text.  
- Rate-limit `POST /v1/ingest/monitoring`; reject oversized batches.

## Migration path from current frontend

1. **Done (v1):** `POST /api/v1/monitoring/events` accepts the browser `MonitoringBatchEnvelope` (`schemaVersion`, `clientSessionId`, `exportedAt`, `events[]`) and stores the full JSON envelope in `monitoring_ingest_batches` for offline ETL / alerting. The frontend outbox lives in `localStorage` (`swaperex-monitoring-buffer`), retries until HTTP 2xx, and never blocks swaps.  
2. **Next:** map `swap_success` / `commission_missing` rows into normalized `swap_event` (dedupe on `chain_id` + `tx_hash`) and wire alerts on `MONITORING_ALERT_EVENT_TYPES`.  
3. **Later:** server-side confirmation via RPC for `tx_hash` to replace client-reported amounts (stronger truth).
