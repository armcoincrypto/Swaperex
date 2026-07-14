# P18.1 Production Observation — 20260714

## Artifact
`883d8b5` unchanged throughout. No restarts.

## Checkpoints
| Checkpoint | UTC | Home | Signals | Admin unauth | PM2 restarts |
|------------|-----|------|---------|--------------|--------------|
| T+0 | 2026-07-14T20:42:51Z | 200 | 200 | 401 | 0 |
| T+15m | 2026-07-14T20:57:53Z | 200 | 200 | 401 | 0 |
| T+30m | 2026-07-14T21:12:53Z | 200 | 200 | 401 | 0 |
| T+1h | 2026-07-14T21:42:54Z | 200 | 200 | 401 | 0 |

## Duration
Measured **1 hour** after canary completion (T+0 → T+1h).

## Result
PASS — no health regression; nginx error journal quiet; signals restart_time=0.

Evidence: `/root/Swaperex/docs/audits/raw/p18-1-obs-20260714T204251Z`
