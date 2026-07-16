# Kobbex Brand — Production Observation (2026-07-16)

Live artifact under observation: `78c0aaf` (branch `release/kobbex-dex-brand-unification`).
Measured via `curl --resolve dex.kobbex.com:443:127.0.0.1`.

| Checkpoint | UTC | short | Swaperex in HTML | nginx recent 5xx | / | /portfolio | /radar | /screener |
|---|---|---|---|---|---|---|---|---|
| T+0  | 2026-07-16T19:49:09Z | 78c0aaf | 0 | 0 | 200 | 200 | 200 | 200 |
| T+5m | 2026-07-16T19:54:10Z | 78c0aaf | 0 | 0 | 200 | 200 | 200 | 200 |
| T+15m| 2026-07-16T20:04:10Z | 78c0aaf | 0 | 0 | 200 | 200 | 200 | 200 |
| T+30m| 2026-07-16T20:19:12Z | 78c0aaf | 0 | 0 | 200 | 200 | 200 | 200 |
| T+1h | 2026-07-16T20:49:13Z | 78c0aaf | 0 | 0 | 200 | 200 | 200 | 200 |

Observation duration: **1 hour**, all five checkpoints genuinely measured
(raw log: `raw/kobbex-brand-20260716T193007Z/obs/observation-log.txt`).

Result: stable single artifact, no stale chunks, no public `Swaperex` text, no
frontend errors, no nginx 5xx, wallet-connect entry route serving normally.
No rollback triggered.
