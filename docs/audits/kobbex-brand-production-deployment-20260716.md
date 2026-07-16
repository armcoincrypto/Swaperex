# Kobbex Brand — Production Deployment (2026-07-16)

## Gate (all PASS before deploy)

| Gate | Result |
|---|---|
| Production provenance | PASS (d8a9294 confirmed live pre-deploy) |
| Brand inventory | Complete (classified) |
| Public-copy / a11y / metadata / manifest audits | Complete |
| Storage compatibility | Proven (no key renames) |
| Typecheck | PASS |
| Build | PASS (`tsc && vite build`) |
| Tests | 713 pass / 75 files |
| Commission audit | 126/126 |
| Sourcemaps in dist | 0 |
| Production backup | PASS |
| Rollback | Prepared |

## Deploy steps

1. Branch `release/kobbex-dex-brand-unification` @ `78c0aaf`.
2. Backup: `/var/www/backups/swaperex-d8a9294-20260716T194822Z` (86 files, checksums recorded).
3. `rsync -a --delete frontend/dist/ /var/www/swaperex/` (static only).
4. Wrote `version.txt` → `short=78c0aaf branch=release/kobbex-dex-brand-unification`.
5. Verified 0 `.map` files live.

## Post-deploy (T+0)

- `/version.txt` = `78c0aaf`.
- `index.html`: 7× Kobbex / 0× Swaperex / 0× "by Kobbex".
- Live asset refs all present in dist (0 missing) — no mixed release.
- Routes `/ /portfolio /radar /screener /about /trust /terms /privacy /disclaimer` → 200.

## Nginx / services

- Nginx configuration **not modified**; no reload performed by this phase.
- No backend/API/bot/database/contract changes.
- Deployment directory name `/var/www/swaperex` retained (operational compatibility).

## Rollback command

```
rsync -a --delete /var/www/backups/swaperex-d8a9294-20260716T194822Z/ /var/www/swaperex/
```
