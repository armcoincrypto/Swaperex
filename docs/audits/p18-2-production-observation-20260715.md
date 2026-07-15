# P18.2 Production Observation — 20260715

Evidence root: `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z`
Production URL: https://dex.kobbex.com
Live artifact: `883d8b58b1db224511b0a235532c687136823c2c` (`883d8b5`)
Production mutation: **NONE** (no redeploy; live labels already correct)


## Schedule
Background observer PID recorded in `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z/obs/obs-pid.txt`.

Checkpoints: **T+0**, **T+15m**, **T+30m**, **T+1h** → `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z/obs/checkpoint-*.txt`

## T+0 (captured)
- Homepage 200, version `883d8b5`
- Signals health 200
- Admin 401
- backend-signals online, restart_time 0
- Static frontend via nginx (PM2 `frontend` stopped — expected)

## Checkpoints
| Checkpoint | Homepage | Artifact | Signals | Admin | Signals restarts |
|------------|----------|----------|---------|-------|------------------|
| T+0 | 200 | 883d8b5 | 200 | 401 | 0 |
| T+15m | 200 | 883d8b5 | 200 | 401 | 0 |
| T+30m | 200 | 883d8b5 | 200 | 401 | 0 |
| T+1h | 200 | 883d8b5 | 200 | 401 | 0 |

**Observation result: PASS** (1h complete).

## Note
Completion flagged by `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z/obs/obs-complete.flag` when finished. Final certification incorporates completed checkpoints when present.
