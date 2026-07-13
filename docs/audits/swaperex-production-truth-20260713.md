# Swaperex Production Truth — 20260713

## DEX_KOBBEX_PRODUCTION_TRUTH_IDENTIFIED

| Item | Value |
|------|-------|
| URL | https://dex.kobbex.com |
| Static root | `/var/www/swaperex` (nginx SPA) |
| Live artifact commit | `d4484f051941084a7987cdf42c5f2de8f48b4b30` |
| version.txt | environment=production short=d4484f0 deployed=2026-07-12T23:51:51Z |
| Nginx | `/etc/nginx/sites-enabled/dex.kobbex.com.conf` |
| Signals API | PM2 `backend-signals` on `127.0.0.1:4001` |
| Admin API | uvicorn `swaperex.api.app_admin` on `127.0.0.1:8001` |
| Source repo | `/root/Swaperex` |
| Rollback floor (historical) | `75b2ce7` |
| Durable backup this phase | `/var/www/swaperex-backup-20260713T2259Z-pre-cert-rehearsal` |

Evidence: `/root/Swaperex/docs/audits/raw/swaperex-prod-20260713T225349Z`
