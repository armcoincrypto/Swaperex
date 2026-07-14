# P18 Production Observation — 20260714

## Windows
- First deploy `093f54f`: 2026-07-14T11:54:43Z → hotfix
- Final artifact `883d8b5`: from 2026-07-14T16:01:22Z

## Checkpoints (final artifact)
| Checkpoint | Time (UTC) | Home | Trust | Signals | Admin health | Admin unauth | PM2 restarts |
|------------|------------|------|-------|---------|--------------|--------------|--------------|
| T+0 | 16:05:34Z | 200 | 200 | 200 | 200 | 401 | 0 |
| T+5m | 16:10:56Z | 200 | 200 | 200 | 200 | 401 | 0 |
| T+15m | 2026-07-14T16:20:35Z | 200 | 200 | 200 | 200 | 401 | 0 |

## Honest duration
Measured active observation after final hotfix: **15 minutes** (T+0 → T+15m). Not claiming T+30m/T+1h.

## Result
PASS — no health regression observed in the measured window.
